import express from 'express'
import { query, queryOne, insert, execute } from '../config/db.js'

const router = express.Router()

// GET /api/playlists - Get all playlists with filters
router.get('/', async (req, res) => {
    try {
        const { spaceType, status, userId = 1 } = req.query

        let sql = `
            SELECT 
                p.playlist_id as id,
                p.title,
                p.description,
                p.space_type as spaceType,
                p.status_flag as status,
                p.source_type as sourceType,
                p.external_id as externalId,
                p.cover_image as coverImage,
                p.created_at as createdAt,
                p.updated_at as updatedAt,
                (SELECT COUNT(*) FROM playlist_tracks pt WHERE pt.playlist_id = p.playlist_id) as trackCount,
                COALESCE(psi.ai_score, 0) as aiScore
            FROM playlists p
            LEFT JOIN playlist_scored_id psi ON p.playlist_id = psi.playlist_id AND psi.user_id = p.user_id
            WHERE p.user_id = ?
        `
        const params = [userId]

        if (spaceType) {
            sql += ' AND p.space_type = ?'
            params.push(spaceType)
        }

        if (status) {
            sql += ' AND p.status_flag = ?'
            params.push(status)
        }

        sql += ' ORDER BY p.created_at DESC'

        const playlists = await query(sql, params)

        res.json({
            playlists,
            total: playlists.length
        })
    } catch (error) {
        console.error('Error fetching playlists:', error)
        res.status(500).json({ error: error.message })
    }
})

// GET /api/playlists/:id - Get single playlist with tracks
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params

        const playlist = await queryOne(`
            SELECT 
                p.playlist_id as id,
                p.title,
                p.description,
                p.space_type as spaceType,
                p.status_flag as status,
                p.source_type as sourceType,
                p.external_id as externalId,
                p.cover_image as coverImage,
                p.created_at as createdAt
            FROM playlists p
            WHERE p.playlist_id = ?
        `, [id])

        if (!playlist) {
            return res.status(404).json({ error: 'Playlist not found' })
        }

        // Get tracks
        const tracks = await query(`
            SELECT 
                t.track_id as id,
                t.title,
                t.artist,
                t.album,
                t.duration,
                t.isrc,
                pt.order_index as orderIndex
            FROM playlist_tracks pt
            JOIN tracks t ON pt.track_id = t.track_id
            WHERE pt.playlist_id = ?
            ORDER BY pt.order_index
        `, [id])

        res.json({ ...playlist, tracks })
    } catch (error) {
        console.error('Error fetching playlist:', error)
        res.status(500).json({ error: error.message })
    }
})

// POST /api/playlists - Create new playlist
router.post('/', async (req, res) => {
    try {
        const {
            title,
            description = '',
            spaceType = 'EMS',
            status = 'PTP',
            sourceType = 'Platform',
            externalId = null,
            coverImage = null,
            userId = 1
        } = req.body

        if (!title) {
            return res.status(400).json({ error: 'Title is required' })
        }

        const playlistId = await insert(`
            INSERT INTO playlists (user_id, title, description, space_type, status_flag, source_type, external_id, cover_image)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [userId, title, description, spaceType, status, sourceType, externalId, coverImage])

        const playlist = await queryOne(`
            SELECT 
                playlist_id as id,
                title,
                description,
                space_type as spaceType,
                status_flag as status,
                created_at as createdAt
            FROM playlists WHERE playlist_id = ?
        `, [playlistId])

        res.status(201).json(playlist)
    } catch (error) {
        console.error('Error creating playlist:', error)
        res.status(500).json({ error: error.message })
    }
})

// Helper: Fetch YouTube playlist tracks
async function fetchYoutubePlaylistTracks(playlistId) {
    const YOUTUBE_API_URL = 'https://www.googleapis.com/youtube/v3'
    const apiKey = process.env.YOUTUBE_KEY

    if (!apiKey) return []

    try {
        // Get playlist items
        const itemsUrl = new URL(`${YOUTUBE_API_URL}/playlistItems`)
        itemsUrl.searchParams.append('key', apiKey)
        itemsUrl.searchParams.append('part', 'snippet,contentDetails')
        itemsUrl.searchParams.append('playlistId', playlistId)
        itemsUrl.searchParams.append('maxResults', '50')

        const itemsRes = await fetch(itemsUrl.toString())
        if (!itemsRes.ok) return []

        const itemsData = await itemsRes.json()
        if (!itemsData.items || itemsData.items.length === 0) return []

        // Get video details for duration
        const videoIds = itemsData.items
            .map(item => item.contentDetails?.videoId)
            .filter(Boolean)
            .join(',')

        if (!videoIds) return []

        const videosUrl = new URL(`${YOUTUBE_API_URL}/videos`)
        videosUrl.searchParams.append('key', apiKey)
        videosUrl.searchParams.append('part', 'contentDetails,snippet')
        videosUrl.searchParams.append('id', videoIds)

        const videosRes = await fetch(videosUrl.toString())
        if (!videosRes.ok) return itemsData.items.map((item, i) => ({
            id: item.contentDetails?.videoId,
            title: item.snippet.title,
            artist: item.snippet.videoOwnerChannelTitle || 'Unknown',
            duration: 0,
            position: i
        }))

        const videosData = await videosRes.json()
        const videoDetails = videosData.items.reduce((acc, video) => {
            // Parse ISO 8601 duration
            const match = video.contentDetails?.duration?.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/)
            const duration = match
                ? (parseInt(match[1] || 0) * 3600) + (parseInt(match[2] || 0) * 60) + (parseInt(match[3] || 0))
                : 0
            acc[video.id] = { duration, channelTitle: video.snippet?.channelTitle }
            return acc
        }, {})

        return itemsData.items.map((item, i) => {
            const videoId = item.contentDetails?.videoId
            const details = videoDetails[videoId] || {}
            return {
                id: videoId,
                title: item.snippet.title,
                artist: details.channelTitle || item.snippet.videoOwnerChannelTitle || 'Unknown',
                duration: details.duration || 0,
                position: i,
                thumbnail: item.snippet.thumbnails?.high?.url || ''
            }
        })
    } catch (error) {
        console.error('Error fetching YouTube tracks:', error)
        return []
    }
}

// POST /api/playlists/import - Import from external platform (Tidal, YouTube)
router.post('/import', async (req, res) => {
    try {
        const {
            platformPlaylistId,
            platform = 'Tidal',
            title,
            description = '',
            coverImage = null,
            userId = 1
        } = req.body

        if (!platformPlaylistId || !title) {
            return res.status(400).json({ error: 'platformPlaylistId and title are required' })
        }

        // Check if already imported
        const existing = await queryOne(`
            SELECT playlist_id FROM playlists
            WHERE external_id = ? AND user_id = ?
        `, [platformPlaylistId, userId])

        if (existing) {
            return res.status(409).json({
                error: 'Playlist already imported',
                playlistId: existing.playlist_id
            })
        }

        // Create playlist
        const playlistId = await insert(`
            INSERT INTO playlists (user_id, title, description, space_type, status_flag, source_type, external_id, cover_image)
            VALUES (?, ?, ?, 'EMS', 'PTP', 'Platform', ?, ?)
        `, [userId, title, description, platformPlaylistId, coverImage])

        // Fetch and import tracks for YouTube
        let trackCount = 0
        if (platform === 'YouTube') {
            const tracks = await fetchYoutubePlaylistTracks(platformPlaylistId)

            for (const track of tracks) {
                try {
                    // Insert track
                    const trackId = await insert(`
                        INSERT INTO tracks (title, artist, album, duration, external_metadata)
                        VALUES (?, ?, ?, ?, ?)
                    `, [
                        track.title,
                        track.artist,
                        'YouTube Music',
                        track.duration,
                        JSON.stringify({ youtubeId: track.id, thumbnail: track.thumbnail })
                    ])

                    // Link to playlist
                    await insert(`
                        INSERT INTO playlist_tracks (playlist_id, track_id, order_index)
                        VALUES (?, ?, ?)
                    `, [playlistId, trackId, track.position])

                    trackCount++
                } catch (e) {
                    console.error('Error inserting track:', e.message)
                }
            }
        }

        const playlist = await queryOne(`
            SELECT
                playlist_id as id,
                title,
                description,
                space_type as spaceType,
                status_flag as status,
                source_type as sourceType,
                external_id as externalId,
                created_at as createdAt
            FROM playlists WHERE playlist_id = ?
        `, [playlistId])

        res.status(201).json({
            message: `Playlist imported from ${platform}`,
            playlist,
            trackCount
        })
    } catch (error) {
        console.error('Error importing playlist:', error)
        res.status(500).json({ error: error.message })
    }
})

// POST /api/playlists/import-album - Import album as playlist with tracks (iTunes/Apple Music)
router.post('/import-album', async (req, res) => {
    try {
        const {
            title,
            artist,
            coverImage = null,
            tracks = [],
            userId = 1
        } = req.body

        if (!title || !tracks || tracks.length === 0) {
            return res.status(400).json({ error: 'title and tracks are required' })
        }

        // Create playlist
        const playlistId = await insert(`
            INSERT INTO playlists (user_id, title, description, space_type, status_flag, source_type, cover_image)
            VALUES (?, ?, ?, 'EMS', 'PTP', 'Platform', ?)
        `, [userId, title, `Album by ${artist} (Apple Music)`, coverImage])

        // Insert tracks
        let trackCount = 0
        for (let i = 0; i < tracks.length; i++) {
            const track = tracks[i]
            try {
                const metadata = {
                    itunesId: track.id,
                    artwork: track.artwork,
                    audio: track.audio,
                    url: track.url
                }

                const trackId = await insert(`
                    INSERT INTO tracks (title, artist, album, duration, external_metadata)
                    VALUES (?, ?, ?, ?, ?)
                `, [
                    track.title,
                    track.artist || artist,
                    title,
                    track.duration || 0,
                    JSON.stringify(metadata)
                ])

                await insert(`
                    INSERT INTO playlist_tracks (playlist_id, track_id, order_index)
                    VALUES (?, ?, ?)
                `, [playlistId, trackId, i])

                trackCount++
            } catch (e) {
                console.error('Error inserting track:', e.message)
            }
        }

        const playlist = await queryOne(`
            SELECT
                playlist_id as id,
                title,
                description,
                space_type as spaceType,
                status_flag as status,
                source_type as sourceType,
                created_at as createdAt
            FROM playlists WHERE playlist_id = ?
        `, [playlistId])

        res.status(201).json({
            message: 'Album imported as playlist',
            playlist,
            count: trackCount
        })
    } catch (error) {
        console.error('Error importing album:', error)
        res.status(500).json({ error: error.message })
    }
})

// PATCH /api/playlists/:id/status - Update status
router.patch('/:id/status', async (req, res) => {
    try {
        const { id } = req.params
        const { status } = req.body

        if (!['PTP', 'PRP', 'PFP'].includes(status)) {
            return res.status(400).json({ error: 'Invalid status. Must be PTP, PRP, or PFP' })
        }

        const affected = await execute(`
            UPDATE playlists SET status_flag = ? WHERE playlist_id = ?
        `, [status, id])

        if (affected === 0) {
            return res.status(404).json({ error: 'Playlist not found' })
        }

        res.json({ message: 'Status updated', status })
    } catch (error) {
        console.error('Error updating status:', error)
        res.status(500).json({ error: error.message })
    }
})

// PATCH /api/playlists/:id/move - Move to different space
router.patch('/:id/move', async (req, res) => {
    try {
        const { id } = req.params
        const { spaceType } = req.body

        if (!['EMS', 'GMS', 'PMS'].includes(spaceType)) {
            return res.status(400).json({ error: 'Invalid space. Must be EMS, GMS, or PMS' })
        }

        const affected = await execute(`
            UPDATE playlists SET space_type = ? WHERE playlist_id = ?
        `, [spaceType, id])

        if (affected === 0) {
            return res.status(404).json({ error: 'Playlist not found' })
        }

        res.json({
            message: `Playlist moved to ${spaceType}`,
            spaceType
        })
    } catch (error) {
        console.error('Error moving playlist:', error)
        res.status(500).json({ error: error.message })
    }
})

// DELETE /api/playlists/:id - Delete playlist
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params

        const affected = await execute(`
            DELETE FROM playlists WHERE playlist_id = ?
        `, [id])

        if (affected === 0) {
            return res.status(404).json({ error: 'Playlist not found' })
        }

        res.json({ message: 'Playlist deleted' })
    } catch (error) {
        console.error('Error deleting playlist:', error)
        res.status(500).json({ error: error.message })
    }
})

// POST /api/playlists/:id/tracks - Add track to playlist
router.post('/:id/tracks', async (req, res) => {
    try {
        const { id } = req.params
        const { track } = req.body

        if (!track || !track.title) {
            return res.status(400).json({ error: 'Track data required' })
        }

        // 1. Insert Track (Simple approach: create new entry for every add)
        // Ideally we would check duplicates, but for MVP this is fine.
        const metadata = {
            itunesId: track.id,
            artwork: track.artwork,
            audio: track.audio,
            url: track.url
        }

        const trackId = await insert(`
            INSERT INTO tracks (title, artist, album, duration, external_metadata)
            VALUES (?, ?, ?, ?, ?)
        `, [
            track.title,
            track.artist || 'Unknown Artist',
            track.album || 'Unknown Album',
            0, // Duration not always available in ms/seconds strictly from prompt
            JSON.stringify(metadata)
        ])

        // 2. Add to Playlist
        const lastTrack = await queryOne(
            `SELECT MAX(order_index) as maxOrder FROM playlist_tracks WHERE playlist_id = ?`,
            [id]
        )
        const newOrder = (lastTrack?.maxOrder || 0) + 1

        await insert(`
            INSERT INTO playlist_tracks (playlist_id, track_id, order_index)
            VALUES (?, ?, ?)
        `, [id, trackId, newOrder])

        res.status(201).json({ message: 'Track added', trackId, order: newOrder })
    } catch (error) {
        console.error('Error adding track:', error)
        res.status(500).json({ error: error.message })
    }
})

// DELETE /api/playlists/:id/tracks/:trackId - Remove track from playlist
router.delete('/:id/tracks/:trackId', async (req, res) => {
    try {
        const { id, trackId } = req.params

        const affected = await execute(`
            DELETE FROM playlist_tracks 
            WHERE playlist_id = ? AND track_id = ?
        `, [id, trackId])

        if (affected === 0) {
            return res.status(404).json({ error: 'Track not found in playlist' })
        }

        res.json({ message: 'Track removed' })
    } catch (error) {
        console.error('Error removing track:', error)
        res.status(500).json({ error: error.message })
    }
})

export default router
