import express from 'express'
import { query, queryOne } from '../config/db.js'
import { optionalAuth } from '../middleware/auth.js'

const router = express.Router()

// GET /api/pms/playlists - PMS 플레이리스트 목록 조회
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
            WHERE p.user_id = ? AND p.space_type = 'PMS'
            ORDER BY p.created_at DESC
            LIMIT ? OFFSET ?
        `, [resolvedUserId, parseInt(limit), parseInt(offset)])

        const total = await queryOne(`
            SELECT COUNT(*) as cnt FROM playlists
            WHERE user_id = ? AND space_type = 'PMS'
        `, [resolvedUserId])

        res.json({
            playlists,
            total: total.cnt,
            limit: parseInt(limit),
            offset: parseInt(offset)
        })
    } catch (error) {
        console.error('Error fetching PMS playlists:', error)
        res.status(500).json({ error: error.message })
    }
})

// GET /api/pms/tracks - PMS 전체 트랙 목록 조회
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
            WHERE p.user_id = ? AND p.space_type = 'PMS'
            ORDER BY pt.added_at DESC
            LIMIT ? OFFSET ?
        `, [resolvedUserId, resolvedUserId, resolvedUserId, parseInt(limit), parseInt(offset)])

        const total = await queryOne(`
            SELECT COUNT(DISTINCT t.track_id) as cnt
            FROM tracks t
            JOIN playlist_tracks pt ON t.track_id = pt.track_id
            JOIN playlists p ON pt.playlist_id = p.playlist_id
            WHERE p.user_id = ? AND p.space_type = 'PMS'
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
        console.error('Error fetching PMS tracks:', error)
        res.status(500).json({ error: error.message })
    }
})

// GET /api/pms/stats - PMS 통계 정보
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
            WHERE p.user_id = ? AND p.space_type = 'PMS'
        `, [resolvedUserId])

        // 상위 아티스트
        const topArtists = await query(`
            SELECT
                t.artist,
                COUNT(*) as trackCount
            FROM tracks t
            JOIN playlist_tracks pt ON t.track_id = pt.track_id
            JOIN playlists p ON pt.playlist_id = p.playlist_id
            WHERE p.user_id = ? AND p.space_type = 'PMS'
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
            WHERE p.user_id = ? AND p.space_type = 'PMS' AND t.genre IS NOT NULL
            GROUP BY t.genre
            ORDER BY trackCount DESC
            LIMIT 10
        `, [resolvedUserId])

        res.json({
            userId: parseInt(resolvedUserId),
            spaceType: 'PMS',
            stats: {
                playlists: basicStats.playlistCount,
                tracks: basicStats.trackCount,
                artists: basicStats.artistCount,
                totalDurationSeconds: basicStats.totalDuration,
                totalDurationFormatted: formatDuration(basicStats.totalDuration)
            },
            topArtists,
            genreDistribution
        })
    } catch (error) {
        console.error('Error fetching PMS stats:', error)
        res.status(500).json({ error: error.message })
    }
})

// GET /api/pms/export - PMS 데이터 ML 학습용 내보내기
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
            WHERE p.user_id = ? AND p.space_type = 'PMS'
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
            res.setHeader('Content-Disposition', 'attachment; filename=pms_data.csv')
            return res.send('\uFEFF' + csv)
        }

        res.json({
            userId: parseInt(userId),
            spaceType: 'PMS',
            totalRecords: parsedData.length,
            exportedAt: new Date().toISOString(),
            data: parsedData
        })
    } catch (error) {
        console.error('Error exporting PMS data:', error)
        res.status(500).json({ error: error.message })
    }
})

// GET /api/pms/playlist/:playlistId/export - 개별 플레이리스트 CSV 내보내기
router.get('/playlist/:playlistId/export', async (req, res) => {
    try {
        const { playlistId } = req.params
        const { format = 'csv' } = req.query

        const playlist = await queryOne(`
            SELECT playlist_id, title, user_id FROM playlists WHERE playlist_id = ?
        `, [playlistId])

        if (!playlist) {
            return res.status(404).json({ error: 'Playlist not found' })
        }

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
            return res.send('\uFEFF' + csv)
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

// GET /api/pms/playlists/links - 모든 플레이리스트 CSV 링크 목록
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
            WHERE p.user_id = ? AND p.space_type = 'PMS'
            ORDER BY p.created_at DESC
        `, [userId])

        const playlistLinks = playlists.map(p => ({
            playlistId: p.playlistId,
            title: p.title,
            trackCount: p.trackCount,
            csvUrl: `${baseUrl}/api/pms/playlist/${p.playlistId}/export?format=csv`,
            jsonUrl: `${baseUrl}/api/pms/playlist/${p.playlistId}/export?format=json`
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
