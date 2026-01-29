import express from 'express'
import { query, queryOne, execute } from '../config/db.js'

const router = express.Router()

// POST /api/stats/view - 조회수 기록
router.post('/view', async (req, res) => {
    try {
        const { contentType, contentId, artistName } = req.body

        if (contentType === 'artist' && artistName) {
            // 아티스트 조회수
            await execute(`
                INSERT INTO artist_stats (artist_name, view_count)
                VALUES (?, 1)
                ON DUPLICATE KEY UPDATE view_count = view_count + 1
            `, [artistName])
        } else if (['playlist', 'track', 'album'].includes(contentType) && contentId) {
            // 콘텐츠 조회수
            await execute(`
                INSERT INTO content_stats (content_type, content_id, view_count)
                VALUES (?, ?, 1)
                ON DUPLICATE KEY UPDATE view_count = view_count + 1
            `, [contentType, contentId])
        } else {
            return res.status(400).json({ error: 'Invalid parameters' })
        }

        res.json({ success: true })
    } catch (error) {
        console.error('Error recording view:', error)
        res.status(500).json({ error: error.message })
    }
})

// POST /api/stats/play - 재생수 기록
router.post('/play', async (req, res) => {
    try {
        const { contentType, contentId, artistName } = req.body

        if (contentType === 'artist' && artistName) {
            await execute(`
                INSERT INTO artist_stats (artist_name, play_count)
                VALUES (?, 1)
                ON DUPLICATE KEY UPDATE play_count = play_count + 1
            `, [artistName])
        } else if (['playlist', 'track', 'album'].includes(contentType) && contentId) {
            await execute(`
                INSERT INTO content_stats (content_type, content_id, play_count)
                VALUES (?, ?, 1)
                ON DUPLICATE KEY UPDATE play_count = play_count + 1
            `, [contentType, contentId])

            // 트랙 재생시 아티스트 재생수도 증가
            if (contentType === 'track') {
                const track = await queryOne('SELECT artist FROM tracks WHERE track_id = ?', [contentId])
                if (track?.artist) {
                    await execute(`
                        INSERT INTO artist_stats (artist_name, play_count)
                        VALUES (?, 1)
                        ON DUPLICATE KEY UPDATE play_count = play_count + 1
                    `, [track.artist])
                }
            }
        } else {
            return res.status(400).json({ error: 'Invalid parameters' })
        }

        res.json({ success: true })
    } catch (error) {
        console.error('Error recording play:', error)
        res.status(500).json({ error: error.message })
    }
})

// GET /api/stats/best/playlists - 베스트 플레이리스트
router.get('/best/playlists', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 5
        const sortBy = req.query.sortBy || 'play_count' // play_count, view_count

        const playlists = await query(`
            SELECT
                p.playlist_id as id,
                p.title,
                p.description,
                p.cover_image as coverImage,
                p.space_type as spaceType,
                COALESCE(cs.view_count, 0) as viewCount,
                COALESCE(cs.play_count, 0) as playCount,
                (SELECT COUNT(*) FROM playlist_tracks pt WHERE pt.playlist_id = p.playlist_id) as trackCount
            FROM playlists p
            LEFT JOIN content_stats cs ON cs.content_type = 'playlist' AND cs.content_id = p.playlist_id
            ORDER BY ${sortBy === 'view_count' ? 'cs.view_count' : 'cs.play_count'} DESC, p.created_at DESC
            LIMIT ?
        `, [limit])

        res.json({ playlists })
    } catch (error) {
        console.error('Error fetching best playlists:', error)
        res.status(500).json({ error: error.message })
    }
})

// GET /api/stats/best/tracks - 베스트 트랙
router.get('/best/tracks', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 10
        const sortBy = req.query.sortBy || 'play_count'

        const tracks = await query(`
            SELECT
                t.track_id as id,
                t.title,
                t.artist,
                t.album,
                t.duration,
                t.external_metadata as externalMetadata,
                COALESCE(cs.view_count, 0) as viewCount,
                COALESCE(cs.play_count, 0) as playCount
            FROM tracks t
            LEFT JOIN content_stats cs ON cs.content_type = 'track' AND cs.content_id = t.track_id
            ORDER BY ${sortBy === 'view_count' ? 'cs.view_count' : 'cs.play_count'} DESC, t.created_at DESC
            LIMIT ?
        `, [limit])

        // Parse external_metadata JSON
        const parsedTracks = tracks.map(t => ({
            ...t,
            externalMetadata: typeof t.externalMetadata === 'string'
                ? JSON.parse(t.externalMetadata)
                : t.externalMetadata
        }))

        res.json({ tracks: parsedTracks })
    } catch (error) {
        console.error('Error fetching best tracks:', error)
        res.status(500).json({ error: error.message })
    }
})

// GET /api/stats/best/artists - 베스트 아티스트
router.get('/best/artists', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 5
        const sortBy = req.query.sortBy || 'play_count'

        const artists = await query(`
            SELECT
                ast.artist_name as name,
                ast.view_count as viewCount,
                ast.play_count as playCount,
                ast.like_count as likeCount,
                a.image_url as image
            FROM artist_stats ast
            LEFT JOIN artists a ON ast.artist_name = a.name
            ORDER BY ${sortBy === 'view_count' ? 'ast.view_count' : 'ast.play_count'} DESC
            LIMIT ?
        `, [limit])

        res.json({ artists })
    } catch (error) {
        console.error('Error fetching best artists:', error)
        res.status(500).json({ error: error.message })
    }
})

// GET /api/stats/best/albums - 베스트 앨범 (트랙 테이블에서 앨범별로 집계)
router.get('/best/albums', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 5

        const albums = await query(`
            SELECT
                t.album as title,
                t.artist,
                MIN(JSON_UNQUOTE(JSON_EXTRACT(t.external_metadata, '$.artwork'))) as coverImage,
                SUM(COALESCE(cs.play_count, 0)) as playCount,
                SUM(COALESCE(cs.view_count, 0)) as viewCount,
                COUNT(t.track_id) as trackCount
            FROM tracks t
            LEFT JOIN content_stats cs ON cs.content_type = 'track' AND cs.content_id = t.track_id
            WHERE t.album IS NOT NULL AND t.album != ''
            GROUP BY t.album, t.artist
            ORDER BY playCount DESC, viewCount DESC
            LIMIT ?
        `, [limit])

        res.json({ albums })
    } catch (error) {
        console.error('Error fetching best albums:', error)
        res.status(500).json({ error: error.message })
    }
})

// GET /api/stats/home - 홈 통계 (실 데이터)
router.get('/home', async (req, res) => {
    try {
        const [playlistCount, trackCount, aiPending, likesCount] = await Promise.all([
            queryOne('SELECT COUNT(*) as count FROM playlists'),
            queryOne('SELECT COUNT(*) as count FROM tracks'),
            queryOne('SELECT COUNT(*) as count FROM playlists WHERE ai_score = 0 OR ai_score IS NULL'),
            queryOne('SELECT COALESCE(SUM(like_count), 0) as count FROM content_stats')
        ])

        res.json({
            totalPlaylists: playlistCount?.count || 0,
            totalTracks: trackCount?.count || 0,
            aiPending: aiPending?.count || 0,
            likes: likesCount?.count || 0
        })
    } catch (error) {
        console.error('Error fetching home stats:', error)
        res.status(500).json({ error: error.message })
    }
})

// POST /api/stats/like - 좋아요 토글
router.post('/like', async (req, res) => {
    try {
        const { contentType, contentId, artistName, isLiked } = req.body
        const increment = isLiked ? 1 : -1

        if (contentType === 'artist' && artistName) {
            await execute(`
                INSERT INTO artist_stats (artist_name, like_count)
                VALUES (?, GREATEST(0, ?))
                ON DUPLICATE KEY UPDATE like_count = GREATEST(0, like_count + ?)
            `, [artistName, increment, increment])
        } else if (['playlist', 'track', 'album'].includes(contentType) && contentId) {
            await execute(`
                INSERT INTO content_stats (content_type, content_id, like_count)
                VALUES (?, ?, GREATEST(0, ?))
                ON DUPLICATE KEY UPDATE like_count = GREATEST(0, like_count + ?)
            `, [contentType, contentId, increment, increment])
        }

        res.json({ success: true })
    } catch (error) {
        console.error('Error toggling like:', error)
        res.status(500).json({ error: error.message })
    }
})

export default router
