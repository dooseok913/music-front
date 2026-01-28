import express from 'express'
import { query, queryOne } from '../config/db.js'
import { authMiddleware } from '../middleware/auth.js'
import { downloadArtistImage } from '../utils/imageDownloader.js'

const router = express.Router()

// Spotify API 토큰 캐시
let spotifyToken = null
let spotifyTokenExpiry = 0

// Spotify 토큰 가져오기
async function getSpotifyToken() {
    if (spotifyToken && Date.now() < spotifyTokenExpiry) {
        return spotifyToken
    }

    const clientId = process.env.SPOTIFY_CLIENT_ID
    const clientSecret = process.env.SPOTIFY_CLIENT_SECRET

    if (!clientId || !clientSecret) {
        throw new Error('Spotify API credentials not configured')
    }

    const response = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': 'Basic ' + Buffer.from(clientId + ':' + clientSecret).toString('base64')
        },
        body: 'grant_type=client_credentials'
    })

    const data = await response.json()
    spotifyToken = data.access_token
    spotifyTokenExpiry = Date.now() + (data.expires_in - 60) * 1000
    return spotifyToken
}

// Spotify에서 ISRC로 트랙 검색 및 오디오 특성 가져오기
async function getSpotifyAudioFeatures(isrc) {
    const token = await getSpotifyToken()

    // ISRC로 트랙 검색
    const searchRes = await fetch(`https://api.spotify.com/v1/search?q=isrc:${isrc}&type=track&limit=1`, {
        headers: { 'Authorization': `Bearer ${token}` }
    })
    const searchData = await searchRes.json()

    if (!searchData.tracks?.items?.length) {
        return null
    }

    const track = searchData.tracks.items[0]
    const spotifyId = track.id

    // 오디오 특성 가져오기
    const featuresRes = await fetch(`https://api.spotify.com/v1/audio-features/${spotifyId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
    })
    const features = await featuresRes.json()

    // 장르는 아티스트에서 가져오기
    let genres = []
    if (track.artists?.[0]?.id) {
        const artistRes = await fetch(`https://api.spotify.com/v1/artists/${track.artists[0].id}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        })
        const artistData = await artistRes.json()
        genres = artistData.genres || []
    }

    return {
        spotifyId,
        genres,
        audioFeatures: {
            tempo: features.tempo,
            energy: features.energy,
            danceability: features.danceability,
            valence: features.valence,
            acousticness: features.acousticness,
            instrumentalness: features.instrumentalness,
            liveness: features.liveness,
            speechiness: features.speechiness,
            loudness: features.loudness,
            key: features.key,
            mode: features.mode,
            time_signature: features.time_signature
        }
    }
}

// MusicBrainz에서 ISRC로 장르 가져오기 (API 키 불필요)
async function getMusicBrainzGenre(isrc) {
    try {
        const response = await fetch(
            `https://musicbrainz.org/ws/2/recording?query=isrc:${isrc}&fmt=json`,
            {
                headers: {
                    'User-Agent': 'MusicSpace/1.0 (musicspace@local)'
                }
            }
        )
        const data = await response.json()

        if (!data.recordings?.length) return null

        const recording = data.recordings[0]
        const tags = recording.tags?.map(t => t.name) || []

        // 릴리즈 그룹에서 추가 태그 가져오기
        if (recording['release-groups']?.length) {
            const rgTags = recording['release-groups'][0].tags?.map(t => t.name) || []
            tags.push(...rgTags)
        }

        return {
            mbid: recording.id,
            tags: [...new Set(tags)].slice(0, 5),
            artist: recording['artist-credit']?.[0]?.name
        }
    } catch (error) {
        console.error('MusicBrainz error:', error.message)
        return null
    }
}

// Last.fm에서 트랙 태그 가져오기
async function getLastFmTags(artist, track) {
    const apiKey = process.env.LASTFM_API_KEY
    if (!apiKey) return null

    try {
        const params = new URLSearchParams({
            method: 'track.getTopTags',
            artist: artist,
            track: track,
            api_key: apiKey,
            format: 'json'
        })

        const response = await fetch(`http://ws.audioscrobbler.com/2.0/?${params}`)
        const data = await response.json()

        if (data.error || !data.toptags?.tag) return null

        return {
            tags: data.toptags.tag.slice(0, 10).map(t => ({
                name: t.name,
                count: parseInt(t.count)
            }))
        }
    } catch (error) {
        console.error('Last.fm error:', error.message)
        return null
    }
}

// Last.fm에서 아티스트 태그 가져오기
async function getLastFmArtistTags(artist) {
    const apiKey = process.env.LASTFM_API_KEY
    if (!apiKey) return null

    try {
        const params = new URLSearchParams({
            method: 'artist.getTopTags',
            artist: artist,
            api_key: apiKey,
            format: 'json'
        })

        const response = await fetch(`http://ws.audioscrobbler.com/2.0/?${params}`)
        const data = await response.json()

        if (data.error || !data.toptags?.tag) return null

        return {
            tags: data.toptags.tag.slice(0, 10).map(t => ({
                name: t.name,
                count: parseInt(t.count)
            }))
        }
    } catch (error) {
        console.error('Last.fm artist error:', error.message)
        return null
    }
}

// 통합: MusicBrainz + Last.fm으로 장르/태그 수집
async function collectGenreAndTags(isrc, artist, title) {
    const result = {
        genres: [],
        tags: [],
        source: []
    }

    // 1. MusicBrainz에서 장르 가져오기
    const mbData = await getMusicBrainzGenre(isrc)
    if (mbData?.tags?.length) {
        result.genres.push(...mbData.tags)
        result.source.push('musicbrainz')
    }

    // Rate limiting for MusicBrainz (1 req/sec)
    await new Promise(r => setTimeout(r, 1100))

    // 2. Last.fm에서 태그 가져오기 (API 키 있는 경우)
    if (process.env.LASTFM_API_KEY) {
        const lfmTrack = await getLastFmTags(artist, title)
        if (lfmTrack?.tags?.length) {
            result.tags.push(...lfmTrack.tags.map(t => t.name))
            result.source.push('lastfm-track')
        }

        // 아티스트 태그도 가져오기
        const lfmArtist = await getLastFmArtistTags(artist)
        if (lfmArtist?.tags?.length) {
            result.tags.push(...lfmArtist.tags.map(t => t.name))
            result.source.push('lastfm-artist')
        }
    }

    // 중복 제거
    result.genres = [...new Set(result.genres)]
    result.tags = [...new Set(result.tags)]

    return result
}

// GET /api/training/user/:userId/data - 특정 사용자의 학습 데이터 조회
router.get('/user/:userId/data', async (req, res) => {
    try {
        const { userId } = req.params
        const { includeMetadata = 'true' } = req.query

        // 사용자의 모든 플레이리스트와 트랙 정보 조회
        const playlists = await query(`
            SELECT
                p.playlist_id as playlistId,
                p.title as playlistTitle,
                p.description,
                p.space_type as spaceType,
                p.status_flag as status,
                p.source_type as sourceType,
                p.created_at as createdAt
            FROM playlists p
            WHERE p.user_id = ?
            ORDER BY p.created_at DESC
        `, [userId])

        // 각 플레이리스트의 트랙 정보 조회
        const trainingData = []

        for (const playlist of playlists) {
            const tracks = await query(`
                SELECT
                    t.track_id as trackId,
                    t.title,
                    t.artist,
                    t.album,
                    t.duration,
                    t.isrc,
                    t.external_metadata as externalMetadata,
                    pt.order_index as orderIndex,
                    pt.added_at as addedAt
                FROM playlist_tracks pt
                JOIN tracks t ON pt.track_id = t.track_id
                WHERE pt.playlist_id = ?
                ORDER BY pt.order_index
            `, [playlist.playlistId])

            // 메타데이터 파싱
            const parsedTracks = tracks.map(track => {
                let metadata = {}
                if (includeMetadata === 'true' && track.externalMetadata) {
                    try {
                        metadata = typeof track.externalMetadata === 'string'
                            ? JSON.parse(track.externalMetadata)
                            : track.externalMetadata
                    } catch (e) {
                        metadata = {}
                    }
                }
                return {
                    ...track,
                    externalMetadata: includeMetadata === 'true' ? metadata : undefined
                }
            })

            trainingData.push({
                ...playlist,
                trackCount: tracks.length,
                tracks: parsedTracks
            })
        }

        res.json({
            userId: parseInt(userId),
            totalPlaylists: playlists.length,
            totalTracks: trainingData.reduce((sum, p) => sum + p.trackCount, 0),
            data: trainingData
        })
    } catch (error) {
        console.error('Error fetching training data:', error)
        res.status(500).json({ error: error.message })
    }
})

// GET /api/training/export - 전체 학습 데이터 내보내기 (ML 학습용 포맷)
router.get('/export', async (req, res) => {
    try {
        const { format = 'json', userId } = req.query

        let userFilter = ''
        const params = []

        if (userId) {
            userFilter = 'WHERE p.user_id = ?'
            params.push(userId)
        }

        // 모든 플레이리스트-트랙 관계 조회
        const data = await query(`
            SELECT
                p.user_id as userId,
                p.playlist_id as playlistId,
                p.title as playlistTitle,
                p.space_type as spaceType,
                p.status_flag as status,
                p.source_type as sourceType,
                t.track_id as trackId,
                t.title as trackTitle,
                t.artist,
                t.album,
                t.duration,
                t.isrc,
                t.genre,
                t.audio_features as audioFeatures,
                t.external_metadata as externalMetadata,
                pt.order_index as orderIndex,
                COALESCE(r.rating, 0) as userRating,
                COALESCE(tsi.ai_score, 0) as trackScore,
                COALESCE(psi.ai_score, 0) as playlistScore
            FROM playlists p
            JOIN playlist_tracks pt ON p.playlist_id = pt.playlist_id
            JOIN tracks t ON pt.track_id = t.track_id
            LEFT JOIN user_track_ratings r ON t.track_id = r.track_id AND p.user_id = r.user_id
            LEFT JOIN track_scored_id tsi ON t.track_id = tsi.track_id AND p.user_id = tsi.user_id
            LEFT JOIN playlist_scored_id psi ON p.playlist_id = psi.playlist_id AND p.user_id = psi.user_id
            ${userFilter}
            ORDER BY p.user_id, p.playlist_id, pt.order_index
        `, params)

        // 메타데이터 및 오디오 특성 파싱
        const parsedData = data.map(row => {
            let metadata = {}
            let audioFeatures = null
            let tags = []
            if (row.externalMetadata) {
                try {
                    metadata = typeof row.externalMetadata === 'string'
                        ? JSON.parse(row.externalMetadata)
                        : row.externalMetadata
                } catch (e) {
                    metadata = {}
                }
            }
            if (row.audioFeatures) {
                try {
                    const parsed = typeof row.audioFeatures === 'string'
                        ? JSON.parse(row.audioFeatures)
                        : row.audioFeatures
                    // Last.fm 태그 형식인 경우 ({ tags: [...], source: [...] })
                    if (parsed.tags && Array.isArray(parsed.tags)) {
                        tags = parsed.tags
                        audioFeatures = null
                    } else {
                        // Spotify 오디오 특성인 경우
                        audioFeatures = parsed
                    }
                } catch (e) {
                    audioFeatures = null
                }
            }
            return { ...row, externalMetadata: metadata, audioFeatures, tags: tags.join(', ') }
        })

        if (format === 'csv') {
            // CSV 형식으로 변환
            const headers = [
                'userId', 'playlistId', 'playlistTitle', 'spaceType', 'status',
                'sourceType', 'trackId', 'trackTitle', 'artist', 'album',
                'duration', 'isrc', 'genre', 'tags', 'orderIndex', 'userRating', 'trackScore', 'playlistScore'
            ]

            let csv = headers.join(',') + '\n'
            parsedData.forEach(row => {
                const values = headers.map(h => {
                    const val = row[h]
                    if (val === null || val === undefined) return ''
                    if (typeof val === 'string' && (val.includes(',') || val.includes('"'))) {
                        return `"${val.replace(/"/g, '""')}"`
                    }
                    return val
                })
                csv += values.join(',') + '\n'
            })

            res.setHeader('Content-Type', 'text/csv; charset=utf-8')
            res.setHeader('Content-Disposition', 'attachment; filename=training_data.csv')
            return res.send('\uFEFF' + csv)
        }

        res.json({
            totalRecords: parsedData.length,
            exportedAt: new Date().toISOString(),
            data: parsedData
        })
    } catch (error) {
        console.error('Error exporting training data:', error)
        res.status(500).json({ error: error.message })
    }
})

// GET /api/training/features - 학습 특성(Feature) 추출
router.get('/features', async (req, res) => {
    try {
        const { userId } = req.query

        let userFilter = ''
        const params = []

        if (userId) {
            userFilter = 'WHERE p.user_id = ?'
            params.push(userId)
        }

        // 아티스트 빈도
        const artistStats = await query(`
            SELECT
                t.artist,
                COUNT(*) as frequency,
                COUNT(DISTINCT p.playlist_id) as playlistCount
            FROM tracks t
            JOIN playlist_tracks pt ON t.track_id = pt.track_id
            JOIN playlists p ON pt.playlist_id = p.playlist_id
            ${userFilter}
            GROUP BY t.artist
            ORDER BY frequency DESC
            LIMIT 50
        `, params)

        // 앨범 빈도
        const albumStats = await query(`
            SELECT
                t.album,
                t.artist,
                COUNT(*) as frequency
            FROM tracks t
            JOIN playlist_tracks pt ON t.track_id = pt.track_id
            JOIN playlists p ON pt.playlist_id = p.playlist_id
            ${userFilter}
            GROUP BY t.album, t.artist
            ORDER BY frequency DESC
            LIMIT 50
        `, params)

        // 플레이리스트 유형별 통계
        const spaceTypeStats = await query(`
            SELECT
                p.space_type as spaceType,
                COUNT(DISTINCT p.playlist_id) as playlistCount,
                COUNT(pt.track_id) as trackCount
            FROM playlists p
            LEFT JOIN playlist_tracks pt ON p.playlist_id = pt.playlist_id
            ${userFilter}
            GROUP BY p.space_type
        `, params)

        // 소스 유형별 통계
        const sourceStats = await query(`
            SELECT
                p.source_type as sourceType,
                COUNT(DISTINCT p.playlist_id) as playlistCount,
                COUNT(pt.track_id) as trackCount
            FROM playlists p
            LEFT JOIN playlist_tracks pt ON p.playlist_id = pt.playlist_id
            ${userFilter}
            GROUP BY p.source_type
        `, params)

        // 평균 재생 시간
        const durationStats = await queryOne(`
            SELECT
                AVG(t.duration) as avgDuration,
                MIN(t.duration) as minDuration,
                MAX(t.duration) as maxDuration,
                SUM(t.duration) as totalDuration
            FROM tracks t
            JOIN playlist_tracks pt ON t.track_id = pt.track_id
            JOIN playlists p ON pt.playlist_id = p.playlist_id
            ${userFilter}
        `, params)

        res.json({
            userId: userId ? parseInt(userId) : 'all',
            extractedAt: new Date().toISOString(),
            features: {
                topArtists: artistStats,
                topAlbums: albumStats,
                spaceTypeDistribution: spaceTypeStats,
                sourceTypeDistribution: sourceStats,
                durationStats: {
                    avgSeconds: Math.round(durationStats?.avgDuration || 0),
                    minSeconds: durationStats?.minDuration || 0,
                    maxSeconds: durationStats?.maxDuration || 0,
                    totalSeconds: durationStats?.totalDuration || 0
                }
            }
        })
    } catch (error) {
        console.error('Error extracting features:', error)
        res.status(500).json({ error: error.message })
    }
})

// POST /api/training/score - 학습 결과 점수 저장
router.post('/score', async (req, res) => {
    try {
        const { userId, scores } = req.body

        if (!userId || !scores || !Array.isArray(scores)) {
            return res.status(400).json({ error: 'userId and scores array required' })
        }

        let playlistUpdated = 0
        let trackUpdated = 0

        for (const score of scores) {
            if (score.type === 'playlist' && score.playlistId) {
                await query(`
                    INSERT INTO playlist_scored_id (playlist_id, user_id, ai_score)
                    VALUES (?, ?, ?)
                    ON DUPLICATE KEY UPDATE ai_score = ?, updated_at = CURRENT_TIMESTAMP
                `, [score.playlistId, userId, score.score, score.score])
                playlistUpdated++
            } else if (score.type === 'track' && score.trackId) {
                await query(`
                    INSERT INTO track_scored_id (track_id, user_id, ai_score)
                    VALUES (?, ?, ?)
                    ON DUPLICATE KEY UPDATE ai_score = ?, updated_at = CURRENT_TIMESTAMP
                `, [score.trackId, userId, score.score, score.score])
                trackUpdated++
            }
        }

        res.json({
            message: 'Scores saved',
            playlistUpdated,
            trackUpdated
        })
    } catch (error) {
        console.error('Error saving scores:', error)
        res.status(500).json({ error: error.message })
    }
})

// GET /api/training/interactions - 사용자 상호작용 데이터 (추천 시스템용)
router.get('/interactions', async (req, res) => {
    try {
        const { userId, limit = 1000 } = req.query

        let userFilter = ''
        const params = []

        if (userId) {
            userFilter = 'WHERE p.user_id = ?'
            params.push(userId)
        }
        params.push(parseInt(limit))

        // 사용자-트랙 상호작용 데이터 (플레이리스트에 추가 = 긍정적 상호작용)
        const interactions = await query(`
            SELECT
                p.user_id as userId,
                t.track_id as trackId,
                t.artist,
                t.album,
                1 as interaction,
                pt.added_at as timestamp
            FROM playlist_tracks pt
            JOIN playlists p ON pt.playlist_id = p.playlist_id
            JOIN tracks t ON pt.track_id = t.track_id
            ${userFilter}
            ORDER BY pt.added_at DESC
            LIMIT ?
        `, params)

        res.json({
            totalInteractions: interactions.length,
            data: interactions
        })
    } catch (error) {
        console.error('Error fetching interactions:', error)
        res.status(500).json({ error: error.message })
    }
})

// POST /api/training/collect-features - 트랙 오디오 특성 수집 (Spotify)
router.post('/collect-features', async (req, res) => {
    try {
        const { trackIds, limit = 50 } = req.body

        // trackIds가 없으면 audio_features가 null인 트랙들 조회
        let tracks
        if (trackIds && trackIds.length > 0) {
            const placeholders = trackIds.map(() => '?').join(',')
            tracks = await query(
                `SELECT track_id, isrc FROM tracks WHERE track_id IN (${placeholders}) AND isrc IS NOT NULL`,
                trackIds
            )
        } else {
            const limitNum = parseInt(limit) || 50
            tracks = await query(
                `SELECT track_id, isrc FROM tracks WHERE audio_features IS NULL AND isrc IS NOT NULL LIMIT ${limitNum}`
            )
        }

        const results = { success: 0, failed: 0, errors: [] }

        for (const track of tracks) {
            try {
                const features = await getSpotifyAudioFeatures(track.isrc)
                if (features) {
                    await query(
                        'UPDATE tracks SET genre = ?, audio_features = ? WHERE track_id = ?',
                        [features.genres.join(', ') || null, JSON.stringify(features.audioFeatures), track.track_id]
                    )
                    results.success++
                } else {
                    results.failed++
                    results.errors.push({ trackId: track.track_id, isrc: track.isrc, error: 'Not found on Spotify' })
                }
            } catch (err) {
                results.failed++
                results.errors.push({ trackId: track.track_id, isrc: track.isrc, error: err.message })
            }

            // Rate limiting - Spotify API 제한 방지
            await new Promise(r => setTimeout(r, 100))
        }

        res.json({
            message: 'Feature collection completed',
            processed: tracks.length,
            ...results
        })
    } catch (error) {
        console.error('Error collecting features:', error)
        res.status(500).json({ error: error.message })
    }
})

// POST /api/training/collect-genres - MusicBrainz + Last.fm으로 장르/태그 수집
router.post('/collect-genres', async (req, res) => {
    try {
        const { trackIds, limit = 50 } = req.body

        // trackIds가 없으면 genre가 null인 트랙들 조회
        let tracks
        if (trackIds && trackIds.length > 0) {
            const placeholders = trackIds.map(() => '?').join(',')
            tracks = await query(
                `SELECT track_id, isrc, artist, title FROM tracks WHERE track_id IN (${placeholders})`,
                trackIds
            )
        } else {
            const limitNum = parseInt(limit) || 50
            tracks = await query(
                `SELECT track_id, isrc, artist, title FROM tracks WHERE genre IS NULL LIMIT ${limitNum}`
            )
        }

        const results = { success: 0, failed: 0, errors: [] }

        for (const track of tracks) {
            try {
                const data = await collectGenreAndTags(track.isrc, track.artist, track.title)

                if (data.genres.length || data.tags.length) {
                    const genreStr = data.genres.join(', ') || null
                    const tagsJson = data.tags.length ? JSON.stringify({ tags: data.tags, source: data.source }) : null

                    if (genreStr) {
                        await query('UPDATE tracks SET genre = ? WHERE track_id = ?', [genreStr, track.track_id])
                    }
                    if (tagsJson) {
                        await query('UPDATE tracks SET audio_features = ? WHERE track_id = ?', [tagsJson, track.track_id])
                    }
                    results.success++
                } else {
                    results.failed++
                    results.errors.push({ trackId: track.track_id, error: 'No genre/tags found' })
                }
            } catch (err) {
                results.failed++
                results.errors.push({ trackId: track.track_id, error: err.message })
            }
        }

        res.json({
            message: 'Genre collection completed',
            processed: tracks.length,
            hasLastFmKey: !!process.env.LASTFM_API_KEY,
            ...results
        })
    } catch (error) {
        console.error('Error collecting genres:', error)
        res.status(500).json({ error: error.message })
    }
})

// GET /api/training/features-status - 오디오 특성 수집 현황
router.get('/features-status', async (req, res) => {
    try {
        const total = await queryOne('SELECT COUNT(*) as cnt FROM tracks')
        const withFeatures = await queryOne('SELECT COUNT(*) as cnt FROM tracks WHERE audio_features IS NOT NULL')
        const withGenre = await queryOne('SELECT COUNT(*) as cnt FROM tracks WHERE genre IS NOT NULL')

        res.json({
            total: total.cnt,
            withAudioFeatures: withFeatures.cnt,
            withGenre: withGenre.cnt,
            missingFeatures: total.cnt - withFeatures.cnt
        })
    } catch (error) {
        res.status(500).json({ error: error.message })
    }
})

// POST /api/training/rate - 사용자 트랙 평가 (좋아요/싫어요)
router.post('/rate', authMiddleware, async (req, res) => {
    try {
        const userId = req.user.userId
        const { trackId, rating } = req.body

        if (!trackId || rating === undefined) {
            return res.status(400).json({ error: 'trackId and rating required' })
        }

        if (![1, 0, -1].includes(rating)) {
            return res.status(400).json({ error: 'rating must be 1 (like), 0 (neutral), or -1 (dislike)' })
        }

        await query(`
            INSERT INTO user_track_ratings (user_id, track_id, rating)
            VALUES (?, ?, ?)
            ON DUPLICATE KEY UPDATE rating = ?, updated_at = CURRENT_TIMESTAMP
        `, [userId, trackId, rating, rating])

        res.json({ message: 'Rating saved', trackId, rating })
    } catch (error) {
        console.error('Error saving rating:', error)
        res.status(500).json({ error: error.message })
    }
})

// GET /api/training/ratings - 사용자 평가 데이터 조회
router.get('/ratings', async (req, res) => {
    try {
        const { userId, limit = 1000 } = req.query

        let userFilter = ''
        const params = []

        if (userId) {
            userFilter = 'WHERE r.user_id = ?'
            params.push(userId)
        }
        params.push(parseInt(limit))

        const ratings = await query(`
            SELECT
                r.user_id as userId,
                r.track_id as trackId,
                t.title,
                t.artist,
                t.genre,
                r.rating,
                r.created_at as ratedAt
            FROM user_track_ratings r
            JOIN tracks t ON r.track_id = t.track_id
            ${userFilter}
            ORDER BY r.created_at DESC
            LIMIT ?
        `, params)

        const stats = await queryOne(`
            SELECT
                COUNT(*) as total,
                SUM(CASE WHEN rating = 1 THEN 1 ELSE 0 END) as likes,
                SUM(CASE WHEN rating = -1 THEN 1 ELSE 0 END) as dislikes,
                SUM(CASE WHEN rating = 0 THEN 1 ELSE 0 END) as neutrals
            FROM user_track_ratings
            ${userId ? 'WHERE user_id = ?' : ''}
        `, userId ? [userId] : [])

        res.json({
            totalRatings: ratings.length,
            stats,
            data: ratings
        })
    } catch (error) {
        console.error('Error fetching ratings:', error)
        res.status(500).json({ error: error.message })
    }
})

// GET /api/training/ml-dataset - ML 학습용 통합 데이터셋
router.get('/ml-dataset', async (req, res) => {
    try {
        const { userId } = req.query

        let userFilter = ''
        const params = []

        if (userId) {
            userFilter = 'WHERE p.user_id = ?'
            params.push(userId)
        }

        const data = await query(`
            SELECT
                p.user_id as userId,
                t.track_id as trackId,
                t.title,
                t.artist,
                t.album,
                t.duration,
                t.isrc,
                t.genre,
                t.audio_features as audioFeatures,
                COALESCE(r.rating, 0) as userRating,
                COALESCE(tsi.ai_score, 0) as aiScore,
                1 as inPlaylist
            FROM playlist_tracks pt
            JOIN playlists p ON pt.playlist_id = p.playlist_id
            JOIN tracks t ON pt.track_id = t.track_id
            LEFT JOIN user_track_ratings r ON t.track_id = r.track_id AND p.user_id = r.user_id
            LEFT JOIN track_scored_id tsi ON t.track_id = tsi.track_id AND p.user_id = tsi.user_id
            ${userFilter}
            ORDER BY p.user_id, t.track_id
        `, params)

        // audioFeatures 및 tags JSON 파싱
        const parsedData = data.map(row => {
            let audioFeatures = null
            let tags = []
            if (row.audioFeatures) {
                try {
                    const parsed = typeof row.audioFeatures === 'string'
                        ? JSON.parse(row.audioFeatures)
                        : row.audioFeatures
                    // Last.fm 태그 형식인 경우 ({ tags: [...], source: [...] })
                    if (parsed.tags && Array.isArray(parsed.tags)) {
                        tags = parsed.tags
                    } else {
                        // Spotify 오디오 특성인 경우
                        audioFeatures = parsed
                    }
                } catch (e) {
                    audioFeatures = null
                }
            }
            return { ...row, audioFeatures, tags }
        })

        res.json({
            totalRecords: parsedData.length,
            exportedAt: new Date().toISOString(),
            data: parsedData
        })
    } catch (error) {
        console.error('Error generating ML dataset:', error)
        res.status(500).json({ error: error.message })
    }
})

// Spotify에서 아티스트 이미지 가져오기 Helper
async function fetchSpotifyArtistImage(artistName) {
    try {
        const token = await getSpotifyToken()
        const response = await fetch(`https://api.spotify.com/v1/search?q=${encodeURIComponent(artistName)}&type=artist&limit=1`, {
            headers: { 'Authorization': `Bearer ${token}` }
        })
        const data = await response.json()

        if (data.artists?.items?.length > 0) {
            const artist = data.artists.items[0]
            if (artist.images?.length > 0) {
                return {
                    imageUrl: artist.images[0].url, // 가장 큰 이미지
                    spotifyId: artist.id,
                    genres: artist.genres,
                    popularity: artist.popularity,
                    followers: artist.followers?.total
                }
            }
        }
        return null
    } catch (error) {
        console.error(`Error fetching image for ${artistName}:`, error)
        return null
    }
}

// POST /api/training/collect-artist-images - 아티스트 이미지 수집
router.post('/collect-artist-images', async (req, res) => {
    try {
        const { limit = 20, forceUpdate = false } = req.body

        // 1. 이미지가 없는 아티스트 조회
        let queryStr = `SELECT artist_id, name FROM artists`
        if (!forceUpdate) {
            queryStr += ` WHERE image_url IS NULL OR image_url = ''`
        }
        queryStr += ` ORDER BY artist_id DESC LIMIT ${parseInt(limit)}`

        const artists = await query(queryStr)

        const results = { success: 0, failed: 0, updated: [] }

        for (const artist of artists) {
            const info = await fetchSpotifyArtistImage(artist.name)

            if (info) {
                // 로컬에 이미지 다운로드
                const localImagePath = await downloadArtistImage(info.imageUrl, artist.artist_id, artist.name)

                await query(`
                    UPDATE artists SET
                        image_url = ?,
                        spotify_id = COALESCE(spotify_id, ?),
                        genres = COALESCE(genres, ?),
                        popularity = COALESCE(popularity, ?),
                        followers = COALESCE(followers, ?)
                    WHERE artist_id = ?
                `, [
                    localImagePath,
                    info.spotifyId,
                    JSON.stringify(info.genres),
                    info.popularity,
                    info.followers,
                    artist.artist_id
                ])
                results.success++
                results.updated.push({ name: artist.name, image: localImagePath })
            } else {
                results.failed++
            }

            // Rate limiting
            await new Promise(r => setTimeout(r, 100))
        }

        // 2. artist_stats에는 있지만 artists 테이블에 없는 아티스트 동기화
        if (artists.length < parseInt(limit)) {
            const missingArtists = await query(`
                SELECT DISTINCT ast.artist_name 
                FROM artist_stats ast
                LEFT JOIN artists a ON ast.artist_name = a.name
                WHERE a.artist_id IS NULL
                ORDER BY ast.play_count DESC
                LIMIT ${parseInt(limit) - artists.length}
            `)

            for (const miss of missingArtists) {
                const info = await fetchSpotifyArtistImage(miss.artist_name)
                if (info) {
                    // INSERT 또는 UPDATE (spotify_id 중복 시)
                    const insertResult = await query(`
                        INSERT INTO artists (name, spotify_id, genres, popularity, followers)
                        VALUES (?, ?, ?, ?, ?)
                        ON DUPLICATE KEY UPDATE
                            name = VALUES(name),
                            genres = COALESCE(genres, VALUES(genres)),
                            popularity = COALESCE(popularity, VALUES(popularity)),
                            followers = COALESCE(followers, VALUES(followers))
                    `, [
                        miss.artist_name,
                        info.spotifyId,
                        JSON.stringify(info.genres),
                        info.popularity,
                        info.followers
                    ])

                    // 아티스트 ID 조회 (새로 삽입 또는 기존)
                    let artistId = insertResult.insertId
                    if (!artistId || artistId === 0) {
                        const existing = await queryOne(`SELECT artist_id FROM artists WHERE spotify_id = ?`, [info.spotifyId])
                        artistId = existing?.artist_id
                    }

                    if (artistId) {
                        // 로컬에 이미지 다운로드
                        const localImagePath = await downloadArtistImage(info.imageUrl, artistId, miss.artist_name)
                        await query(`UPDATE artists SET image_url = ? WHERE artist_id = ?`, [localImagePath, artistId])
                        results.success++
                        results.updated.push({ name: miss.artist_name, image: localImagePath, isNew: true })
                    }
                }
                await new Promise(r => setTimeout(r, 100))
            }
        }

        res.json(results)
    } catch (error) {
        console.error('Error collecting artist images:', error)
        res.status(500).json({ error: error.message })
    }
})

export default router
