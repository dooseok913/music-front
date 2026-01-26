import express from 'express'
import { query, queryOne } from '../config/db.js'
import { optionalAuth } from '../middleware/auth.js'

const router = express.Router()

// GET /api/ems/playlists - EMS 플레이리스트 목록 조회
router.get('/playlists', optionalAuth, async (req, res) => {
    try {
        const { userId, limit = 50, offset = 0 } = req.query
        const resolvedUserId = req.user?.userId || userId

        if (!resolvedUserId) {
            return res.status(400).json({ error: 'userId required' })
        }

        const playlists = await query(`
            SELECT
                p.playlist_id as playlistId,
                p.title,
                p.description,
                p.status_flag as status,
                p.source_type as sourceType,
                p.external_id as externalId,
                p.cover_image as coverImage,
                p.created_at as createdAt,
                (SELECT COUNT(*) FROM playlist_tracks pt WHERE pt.playlist_id = p.playlist_id) as trackCount,
                COALESCE(psi.ai_score, 0) as aiScore
            FROM playlists p
            LEFT JOIN playlist_scored_id psi ON p.playlist_id = psi.playlist_id AND psi.user_id = p.user_id
            WHERE p.user_id = ? AND p.space_type = 'EMS'
            ORDER BY p.created_at DESC
            LIMIT ? OFFSET ?
        `, [resolvedUserId, parseInt(limit), parseInt(offset)])

        const total = await queryOne(`
            SELECT COUNT(*) as cnt FROM playlists
            WHERE user_id = ? AND space_type = 'EMS'
        `, [resolvedUserId])

        res.json({
            playlists,
            total: total.cnt,
            limit: parseInt(limit),
            offset: parseInt(offset)
        })
    } catch (error) {
        console.error('Error fetching EMS playlists:', error)
        res.status(500).json({ error: error.message })
    }
})

// GET /api/ems/tracks - EMS 전체 트랙 목록 조회
router.get('/tracks', optionalAuth, async (req, res) => {
    try {
        const { userId, limit = 100, offset = 0, includeFeatures = 'false' } = req.query
        const resolvedUserId = req.user?.userId || userId

        if (!resolvedUserId) {
            return res.status(400).json({ error: 'userId required' })
        }

        const tracks = await query(`
            SELECT DISTINCT
                t.track_id as trackId,
                t.title,
                t.artist,
                t.album,
                t.duration,
                t.isrc,
                t.genre,
                ${includeFeatures === 'true' ? 't.audio_features as audioFeatures,' : ''}
                p.playlist_id as playlistId,
                p.title as playlistTitle,
                COALESCE(tsi.ai_score, 0) as aiScore,
                COALESCE(r.rating, 0) as userRating
            FROM tracks t
            JOIN playlist_tracks pt ON t.track_id = pt.track_id
            JOIN playlists p ON pt.playlist_id = p.playlist_id
            LEFT JOIN track_scored_id tsi ON t.track_id = tsi.track_id AND tsi.user_id = ?
            LEFT JOIN user_track_ratings r ON t.track_id = r.track_id AND r.user_id = ?
            WHERE p.user_id = ? AND p.space_type = 'EMS'
            ORDER BY pt.added_at DESC
            LIMIT ? OFFSET ?
        `, [resolvedUserId, resolvedUserId, resolvedUserId, parseInt(limit), parseInt(offset)])

        const total = await queryOne(`
            SELECT COUNT(DISTINCT t.track_id) as cnt
            FROM tracks t
            JOIN playlist_tracks pt ON t.track_id = pt.track_id
            JOIN playlists p ON pt.playlist_id = p.playlist_id
            WHERE p.user_id = ? AND p.space_type = 'EMS'
        `, [resolvedUserId])

        // audioFeatures JSON 파싱
        const parsedTracks = tracks.map(track => ({
            ...track,
            audioFeatures: track.audioFeatures ?
                (typeof track.audioFeatures === 'string' ? JSON.parse(track.audioFeatures) : track.audioFeatures)
                : undefined
        }))

        res.json({
            tracks: parsedTracks,
            total: total.cnt,
            limit: parseInt(limit),
            offset: parseInt(offset)
        })
    } catch (error) {
        console.error('Error fetching EMS tracks:', error)
        res.status(500).json({ error: error.message })
    }
})

// GET /api/ems/stats - EMS 통계 정보
router.get('/stats', optionalAuth, async (req, res) => {
    try {
        const { userId } = req.query
        const resolvedUserId = req.user?.userId || userId

        if (!resolvedUserId) {
            return res.status(400).json({ error: 'userId required' })
        }

        // 기본 통계
        const basicStats = await queryOne(`
            SELECT
                COUNT(DISTINCT p.playlist_id) as playlistCount,
                COUNT(DISTINCT t.track_id) as trackCount,
                COUNT(DISTINCT t.artist) as artistCount,
                COALESCE(SUM(t.duration), 0) as totalDuration
            FROM playlists p
            LEFT JOIN playlist_tracks pt ON p.playlist_id = pt.playlist_id
            LEFT JOIN tracks t ON pt.track_id = t.track_id
            WHERE p.user_id = ? AND p.space_type = 'EMS'
        `, [resolvedUserId])

        // 상위 아티스트
        const topArtists = await query(`
            SELECT
                t.artist,
                COUNT(*) as trackCount
            FROM tracks t
            JOIN playlist_tracks pt ON t.track_id = pt.track_id
            JOIN playlists p ON pt.playlist_id = p.playlist_id
            WHERE p.user_id = ? AND p.space_type = 'EMS'
            GROUP BY t.artist
            ORDER BY trackCount DESC
            LIMIT 10
        `, [resolvedUserId])

        // 장르 분포
        const genreDistribution = await query(`
            SELECT
                t.genre,
                COUNT(*) as trackCount
            FROM tracks t
            JOIN playlist_tracks pt ON t.track_id = pt.track_id
            JOIN playlists p ON pt.playlist_id = p.playlist_id
            WHERE p.user_id = ? AND p.space_type = 'EMS' AND t.genre IS NOT NULL
            GROUP BY t.genre
            ORDER BY trackCount DESC
            LIMIT 10
        `, [resolvedUserId])

        // 소스 분포
        const sourceDistribution = await query(`
            SELECT
                p.source_type as sourceType,
                COUNT(DISTINCT p.playlist_id) as playlistCount,
                COUNT(pt.track_id) as trackCount
            FROM playlists p
            LEFT JOIN playlist_tracks pt ON p.playlist_id = pt.playlist_id
            WHERE p.user_id = ? AND p.space_type = 'EMS'
            GROUP BY p.source_type
        `, [resolvedUserId])

        // 평가 통계
        const ratingStats = await queryOne(`
            SELECT
                COUNT(*) as totalRatings,
                SUM(CASE WHEN r.rating = 1 THEN 1 ELSE 0 END) as likes,
                SUM(CASE WHEN r.rating = -1 THEN 1 ELSE 0 END) as dislikes
            FROM user_track_ratings r
            JOIN tracks t ON r.track_id = t.track_id
            JOIN playlist_tracks pt ON t.track_id = pt.track_id
            JOIN playlists p ON pt.playlist_id = p.playlist_id
            WHERE r.user_id = ? AND p.space_type = 'EMS'
        `, [resolvedUserId])

        res.json({
            userId: parseInt(resolvedUserId),
            spaceType: 'EMS',
            stats: {
                playlists: basicStats.playlistCount,
                tracks: basicStats.trackCount,
                artists: basicStats.artistCount,
                totalDurationSeconds: basicStats.totalDuration,
                totalDurationFormatted: formatDuration(basicStats.totalDuration)
            },
            topArtists,
            genreDistribution,
            sourceDistribution,
            ratingStats: {
                total: ratingStats?.totalRatings || 0,
                likes: ratingStats?.likes || 0,
                dislikes: ratingStats?.dislikes || 0
            }
        })
    } catch (error) {
        console.error('Error fetching EMS stats:', error)
        res.status(500).json({ error: error.message })
    }
})

// GET /api/ems/export - EMS 데이터 ML 학습용 내보내기
router.get('/export', async (req, res) => {
    try {
        const { userId, format = 'json' } = req.query

        if (!userId) {
            return res.status(400).json({ error: 'userId required' })
        }

        const data = await query(`
            SELECT
                p.user_id as userId,
                p.playlist_id as playlistId,
                p.title as playlistTitle,
                p.source_type as sourceType,
                t.track_id as trackId,
                t.title as trackTitle,
                t.artist,
                t.album,
                t.duration,
                t.isrc,
                t.genre,
                t.audio_features as audioFeatures,
                pt.order_index as orderIndex,
                COALESCE(r.rating, 0) as userRating,
                COALESCE(tsi.ai_score, 0) as trackScore,
                COALESCE(psi.ai_score, 0) as playlistScore
            FROM playlists p
            JOIN playlist_tracks pt ON p.playlist_id = pt.playlist_id
            JOIN tracks t ON pt.track_id = t.track_id
            LEFT JOIN user_track_ratings r ON t.track_id = r.track_id AND r.user_id = p.user_id
            LEFT JOIN track_scored_id tsi ON t.track_id = tsi.track_id AND tsi.user_id = p.user_id
            LEFT JOIN playlist_scored_id psi ON p.playlist_id = psi.playlist_id AND psi.user_id = p.user_id
            WHERE p.user_id = ? AND p.space_type = 'EMS'
            ORDER BY p.playlist_id, pt.order_index
        `, [userId])

        // audioFeatures 및 tags JSON 파싱
        const parsedData = data.map(row => {
            let features = null
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
                        features = parsed
                    }
                } catch (e) {
                    features = null
                }
            }
            return { ...row, audioFeatures: features, tags: tags.join(', ') }
        })

        if (format === 'csv') {
            const headers = [
                'userId', 'playlistId', 'playlistTitle', 'sourceType',
                'trackId', 'trackTitle', 'artist', 'album', 'duration',
                'isrc', 'genre', 'tags', 'orderIndex', 'userRating', 'trackScore', 'playlistScore'
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
            res.setHeader('Content-Disposition', 'attachment; filename=ems_data.csv')
            return res.send('\uFEFF' + csv)
        }

        res.json({
            userId: parseInt(userId),
            spaceType: 'EMS',
            totalRecords: parsedData.length,
            exportedAt: new Date().toISOString(),
            data: parsedData
        })
    } catch (error) {
        console.error('Error exporting EMS data:', error)
        res.status(500).json({ error: error.message })
    }
})

// GET /api/ems/recommendations - EMS 기반 추천 트랙
router.get('/recommendations', optionalAuth, async (req, res) => {
    try {
        const { userId, limit = 20 } = req.query
        const resolvedUserId = req.user?.userId || userId

        if (!resolvedUserId) {
            return res.status(400).json({ error: 'userId required' })
        }

        // 사용자가 좋아요한 트랙의 아티스트 기반 추천
        const likedArtists = await query(`
            SELECT DISTINCT t.artist
            FROM user_track_ratings r
            JOIN tracks t ON r.track_id = t.track_id
            WHERE r.user_id = ? AND r.rating = 1
            LIMIT 10
        `, [resolvedUserId])

        let recommendations = []

        if (likedArtists.length > 0) {
            const artistNames = likedArtists.map(a => a.artist)
            const placeholders = artistNames.map(() => '?').join(',')

            // 좋아요한 아티스트의 다른 트랙 추천 (아직 평가하지 않은 것)
            recommendations = await query(`
                SELECT DISTINCT
                    t.track_id as trackId,
                    t.title,
                    t.artist,
                    t.album,
                    t.duration,
                    t.genre,
                    'liked_artist' as recommendReason
                FROM tracks t
                JOIN playlist_tracks pt ON t.track_id = pt.track_id
                JOIN playlists p ON pt.playlist_id = p.playlist_id
                LEFT JOIN user_track_ratings r ON t.track_id = r.track_id AND r.user_id = ?
                WHERE p.user_id = ?
                    AND p.space_type = 'EMS'
                    AND t.artist IN (${placeholders})
                    AND r.rating IS NULL
                ORDER BY RAND()
                LIMIT ?
            `, [resolvedUserId, resolvedUserId, ...artistNames, parseInt(limit)])
        }

        // 추천이 부족하면 AI 점수 높은 트랙으로 보충
        if (recommendations.length < limit) {
            const remaining = parseInt(limit) - recommendations.length
            const existingIds = recommendations.map(r => r.trackId)

            let excludeClause = ''
            const params = [resolvedUserId, resolvedUserId]

            if (existingIds.length > 0) {
                excludeClause = `AND t.track_id NOT IN (${existingIds.map(() => '?').join(',')})`
                params.push(...existingIds)
            }
            params.push(remaining)

            const highScored = await query(`
                SELECT DISTINCT
                    t.track_id as trackId,
                    t.title,
                    t.artist,
                    t.album,
                    t.duration,
                    t.genre,
                    'high_score' as recommendReason,
                    tsi.ai_score as aiScore
                FROM tracks t
                JOIN playlist_tracks pt ON t.track_id = pt.track_id
                JOIN playlists p ON pt.playlist_id = p.playlist_id
                LEFT JOIN track_scored_id tsi ON t.track_id = tsi.track_id AND tsi.user_id = ?
                LEFT JOIN user_track_ratings r ON t.track_id = r.track_id AND r.user_id = ?
                WHERE p.space_type = 'EMS'
                    AND r.rating IS NULL
                    ${excludeClause}
                ORDER BY tsi.ai_score DESC, RAND()
                LIMIT ?
            `, params)

            recommendations.push(...highScored)
        }

        res.json({
            userId: parseInt(resolvedUserId),
            recommendations,
            total: recommendations.length
        })
    } catch (error) {
        console.error('Error getting recommendations:', error)
        res.status(500).json({ error: error.message })
    }
})

// GET /api/ems/playlist/:playlistId/export - 개별 플레이리스트 CSV 내보내기
router.get('/playlist/:playlistId/export', async (req, res) => {
    try {
        const { playlistId } = req.params
        const { format = 'csv' } = req.query

        // 플레이리스트 정보 조회
        const playlist = await queryOne(`
            SELECT playlist_id, title, user_id FROM playlists WHERE playlist_id = ?
        `, [playlistId])

        if (!playlist) {
            return res.status(404).json({ error: 'Playlist not found' })
        }

        // 트랙 데이터 조회
        const data = await query(`
            SELECT
                t.track_id as trackId,
                t.title,
                t.artist,
                t.album,
                t.duration,
                t.isrc,
                t.genre,
                t.audio_features as audioFeatures,
                pt.order_index as orderIndex,
                COALESCE(r.rating, 0) as userRating,
                COALESCE(tsi.ai_score, 0) as trackScore
            FROM playlist_tracks pt
            JOIN tracks t ON pt.track_id = t.track_id
            LEFT JOIN user_track_ratings r ON t.track_id = r.track_id AND r.user_id = ?
            LEFT JOIN track_scored_id tsi ON t.track_id = tsi.track_id AND tsi.user_id = ?
            WHERE pt.playlist_id = ?
            ORDER BY pt.order_index
        `, [playlist.user_id, playlist.user_id, playlistId])

        // audioFeatures 및 tags JSON 파싱
        const parsedData = data.map(row => {
            let features = null
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
                        features = parsed
                    }
                } catch (e) {
                    features = null
                }
            }
            return { ...row, audioFeatures: features, tags: tags.join(', ') }
        })

        if (format === 'csv') {
            const headers = [
                'trackId', 'title', 'artist', 'album', 'duration',
                'isrc', 'genre', 'tags', 'orderIndex', 'userRating', 'trackScore'
            ]

            let csv = headers.join(',') + '\n'
            parsedData.forEach(row => {
                const values = headers.map(h => {
                    const val = row[h]
                    if (val === null || val === undefined) return ''
                    if (typeof val === 'string' && (val.includes(',') || val.includes('"') || val.includes('\n'))) {
                        return `"${val.replace(/"/g, '""')}"`
                    }
                    return val
                })
                csv += values.join(',') + '\n'
            })

            const safeTitle = playlist.title.replace(/[^a-zA-Z0-9가-힣]/g, '_')
            res.setHeader('Content-Type', 'text/csv; charset=utf-8')
            res.setHeader('Content-Disposition', `attachment; filename=playlist_${playlistId}_${safeTitle}.csv`)
            return res.send('\uFEFF' + csv) // BOM for Excel UTF-8 support
        }

        res.json({
            playlistId: parseInt(playlistId),
            playlistTitle: playlist.title,
            totalTracks: parsedData.length,
            exportedAt: new Date().toISOString(),
            data: parsedData
        })
    } catch (error) {
        console.error('Error exporting playlist:', error)
        res.status(500).json({ error: error.message })
    }
})

// GET /api/ems/playlists/links - 모든 플레이리스트 CSV 링크 목록
router.get('/playlists/links', async (req, res) => {
    try {
        const { userId } = req.query
        const baseUrl = `${req.protocol}://${req.get('host')}`

        if (!userId) {
            return res.status(400).json({ error: 'userId required' })
        }

        const playlists = await query(`
            SELECT
                p.playlist_id as playlistId,
                p.title,
                (SELECT COUNT(*) FROM playlist_tracks pt WHERE pt.playlist_id = p.playlist_id) as trackCount
            FROM playlists p
            WHERE p.user_id = ? AND p.space_type = 'EMS'
            ORDER BY p.created_at DESC
        `, [userId])

        const playlistLinks = playlists.map(p => ({
            playlistId: p.playlistId,
            title: p.title,
            trackCount: p.trackCount,
            csvUrl: `${baseUrl}/api/ems/playlist/${p.playlistId}/export?format=csv`,
            jsonUrl: `${baseUrl}/api/ems/playlist/${p.playlistId}/export?format=json`
        }))

        res.json({
            userId: parseInt(userId),
            total: playlistLinks.length,
            playlists: playlistLinks
        })
    } catch (error) {
        console.error('Error fetching playlist links:', error)
        res.status(500).json({ error: error.message })
    }
})

// 재생시간 포맷 헬퍼
function formatDuration(seconds) {
    if (!seconds) return '0:00'
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    const secs = seconds % 60

    if (hours > 0) {
        return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`
}

export default router
