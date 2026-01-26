import express from 'express'
import { query, queryOne, insert, execute } from '../config/db.js'
import { optionalAuth } from '../middleware/auth.js'
import fs from 'fs'
import path from 'path'

const router = express.Router()

// GET /api/playlists - Get all playlists with filters
router.get('/', optionalAuth, async (req, res) => {
    try {
        let { spaceType, status, userId } = req.query

        // Use authenticated user ID if available
        if (req.user && req.user.userId) {
            userId = req.user.userId
        }

        // If userId is not provided (or extracted from token), return empty to avoid leaking other users' data
        if (!userId) {
            return res.json({ playlists: [], total: 0 })
        }

        // DEBUG: Write to file
        const debugInfo = `
[${new Date().toISOString()}] Request to /playlists
- Query: ${JSON.stringify(req.query)}
- Headers.Authorization: ${req.headers.authorization ? 'Present' : 'Missing'}
- req.user: ${JSON.stringify(req.user)}
- Resolved userId: ${userId}
----------------------------------------
`
        fs.appendFileSync(path.join(process.cwd(), 'debug_log.txt'), debugInfo)

        console.log(`[Playlists] Fetching for userId: ${userId}, spaceType: ${spaceType || 'ALL'}, status: ${status || 'ALL'}`)

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

        // Process image URLs
        const processedPlaylists = playlists.map(p => {
            let image = p.coverImage
            if (p.sourceType === 'Platform' && p.externalId && !image?.startsWith('http')) {
                // Tidal Image Logic: resources.tidal.com/images/{uuid}/640x640.jpg
                // UUID requires '-' replaced by '/'
                if (image) {
                    const tidalPath = image.replace(/-/g, '/')
                    image = `https://resources.tidal.com/images/${tidalPath}/640x640.jpg`
                }
            }
            return { ...p, coverImage: image }
        })

        res.json({
            playlists: processedPlaylists,
            total: playlists.length
        })
    } catch (error) {
        console.error('Error fetching playlists:', error)
        res.status(500).json({ error: error.message })
    }
})

// PATCH /api/playlists/:id - Update playlist details (Title/Description)
router.patch('/:id', async (req, res) => {
    try {
        const { id } = req.params
        const { title, description } = req.body

        if (!title) {
            return res.status(400).json({ error: 'Title is required' })
        }

        const affected = await execute(`
            UPDATE playlists SET title = ?, description = ? WHERE playlist_id = ?
        `, [title, description || '', id])

        if (affected === 0) {
            return res.status(404).json({ error: 'Playlist not found' })
        }

        res.json({
            message: 'Playlist updated',
            playlist: { id, title, description }
        })
    } catch (error) {
        console.error('Error updating playlist:', error)
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

        // Process image URL
        let image = playlist.coverImage
        if (playlist.sourceType === 'Platform' && playlist.externalId && !image?.startsWith('http')) {
            if (image) {
                const tidalPath = image.replace(/-/g, '/')
                image = `https://resources.tidal.com/images/${tidalPath}/640x640.jpg`
            }
        }
        playlist.coverImage = image

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
        let allItems = []
        let nextPageToken = ''
        const maxResults = 50 // YouTube max per request

        do {
            // Get playlist items
            const itemsUrl = new URL(`${YOUTUBE_API_URL}/playlistItems`)
            itemsUrl.searchParams.append('key', apiKey)
            itemsUrl.searchParams.append('part', 'snippet,contentDetails')
            itemsUrl.searchParams.append('playlistId', playlistId)
            itemsUrl.searchParams.append('maxResults', maxResults.toString())
            if (nextPageToken) {
                itemsUrl.searchParams.append('pageToken', nextPageToken)
            }

            const itemsRes = await fetch(itemsUrl.toString())
            if (!itemsRes.ok) break

            const itemsData = await itemsRes.json()
            const items = itemsData.items || []

            if (items.length === 0) break

            // Get video details for duration (batch for this page)
            const videoIds = items
                .map(item => item.contentDetails?.videoId)
                .filter(Boolean)
                .join(',')

            let videoDetails = {}
            if (videoIds) {
                const videosUrl = new URL(`${YOUTUBE_API_URL}/videos`)
                videosUrl.searchParams.append('key', apiKey)
                videosUrl.searchParams.append('part', 'contentDetails,snippet')
                videosUrl.searchParams.append('id', videoIds)

                const videosRes = await fetch(videosUrl.toString())
                if (videosRes.ok) {
                    const videosData = await videosRes.json()
                    videoDetails = videosData.items.reduce((acc, video) => {
                        const match = video.contentDetails?.duration?.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/)
                        const duration = match
                            ? (parseInt(match[1] || 0) * 3600) + (parseInt(match[2] || 0) * 60) + (parseInt(match[3] || 0))
                            : 0
                        acc[video.id] = { duration, channelTitle: video.snippet?.channelTitle }
                        return acc
                    }, {})
                }
            }

            const processedItems = items.map((item, i) => {
                const videoId = item.contentDetails?.videoId
                const details = videoDetails[videoId] || {}
                return {
                    id: videoId,
                    title: item.snippet.title,
                    artist: details.channelTitle || item.snippet.videoOwnerChannelTitle || 'Unknown',
                    duration: details.duration || 0,
                    position: allItems.length + i, // Correct position across pages
                    thumbnail: item.snippet.thumbnails?.high?.url || ''
                }
            })

            allItems = allItems.concat(processedItems)
            nextPageToken = itemsData.nextPageToken

            console.log(`[YouTube] Fetched page, total so far: ${allItems.length}`)

        } while (nextPageToken)

        console.log(`[YouTube] Total tracks fetched: ${allItems.length}`)
        return allItems
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

                    // Background Enrichment (Fire & Forget)
                    import('../services/metadataService.js').then(m => {
                        m.default.enrichTrack(trackId, track.title, track.artist, null)
                            .catch(e => console.error(`Enrichment failed for ${trackId}:`, e.message))
                    })
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

// POST /api/playlists/seed - Auto-import initial playlists from Tidal & iTunes
router.post('/seed', async (req, res) => {
    try {
        const { userId = 1, force = false } = req.body

        // Check if already seeded (can be bypassed with force=true)
        const existingCount = await queryOne(`
            SELECT COUNT(*) as count FROM playlists 
            WHERE user_id = ? AND space_type = 'EMS'
        `, [userId])

        console.log(`[Seed] Existing EMS count: ${existingCount.count}, force: ${force}`)

        if (existingCount.count > 0 && !force) {
            return res.json({ message: 'Already seeded', imported: 0, existing: existingCount.count })
        }

        let totalImported = 0
        const errors = []

        // 1. Fetch Tidal Featured Playlists (may fail if no auth)
        try {
            console.log('[Seed] Fetching Tidal featured...')
            const tidalResponse = await fetch('http://localhost:3001/api/tidal/featured')
            if (tidalResponse.ok) {
                const tidalData = await tidalResponse.json()
                const featuredPlaylists = tidalData.featured?.flatMap(f => f.playlists) || []
                console.log(`[Seed] Tidal returned ${featuredPlaylists.length} playlists`)

                for (const p of featuredPlaylists.slice(0, 10)) {
                    try {
                        await insert(`
                            INSERT INTO playlists (user_id, title, description, space_type, status_flag, source_type, external_id, cover_image)
                            VALUES (?, ?, ?, 'EMS', 'PTP', 'Platform', ?, ?)
                        `, [userId, p.title, `Tidal: ${p.description || 'Curated'}`, p.uuid, p.squareImage || null])
                        totalImported++

                        // Note: Seed only inserts playlists, it doesn't fetch tracks yet? 
                        // The original code passed `p.uuid` as external_id. 
                        // Validating: The seed logic above inserts playlists but DOES NOT fetch tracks immediately.
                        // The tracks are fetched when the user clicks/opens the playlist via GET /playlists/:id 
                        // OR we should auto-fetch them here?
                        // "Standard" behavior: just import playlist container. Tracks fetched on demand or via separate sync.
                        // However, to enrich, we need tracks.
                        // If seed only creates empty playlists, we can't enrich yet.
                        // Checking `import` route: It fetches tracks immediately.
                        // Checking `seed` route: It just inserts playlists.

                        // So for `seed`, we can't enrich tracks because they aren't there.
                        // But wait, the user said "Bring playlist and fill metadata".
                        // Use case: Import playlist -> fetch tracks -> enrich.
                        // My change in `import` handles the manual import case.
                        // For `seed`, we might want to auto-fill tracks?
                        // Ideally, we should fetch tracks for seeded playlists too if we want to enrich them.
                        // But `seed` logic is currently simple.
                        // I will leave seed as is (just container) and focus on `import` or `resync`.

                    } catch (e) {
                        if (!e.message?.includes('Duplicate')) errors.push(`Tidal: ${e.message}`)
                    }
                }
            } else {
                console.log(`[Seed] Tidal failed with status: ${tidalResponse.status}`)
            }
        } catch (e) {
            console.warn('[Seed] Tidal fetch failed:', e.message)
            errors.push(`Tidal fetch: ${e.message}`)
        }

        // 2. Fetch iTunes Recommendations
        try {
            const genres = ['K-Pop', 'Classical', 'Jazz', 'Pop']
            console.log(`[Seed] Fetching iTunes for genres: ${genres.join(', ')}`)

            for (const genre of genres) {
                try {
                    const itunesResponse = await fetch(`http://localhost:3001/api/itunes/recommendations?genre=${encodeURIComponent(genre)}&limit=3`)
                    if (itunesResponse.ok) {
                        const itunesData = await itunesResponse.json()
                        const albums = itunesData.recommendations || []
                        console.log(`[Seed] iTunes ${genre}: ${albums.length} albums`)

                        for (const album of albums.slice(0, 2)) {
                            try {
                                await insert(`
                                    INSERT INTO playlists (user_id, title, description, space_type, status_flag, source_type, external_id, cover_image)
                                    VALUES (?, ?, ?, 'EMS', 'PTP', 'Platform', ?, ?)
                                `, [userId, album.title, `Apple Music: ${album.artist}`, `itunes_${album.id}`, album.artwork || null])
                                totalImported++
                                console.log(`[Seed] Imported: ${album.title}`)
                            } catch (e) {
                                if (!e.message?.includes('Duplicate')) {
                                    errors.push(`iTunes ${album.title}: ${e.message}`)
                                    console.error(`[Seed] Insert failed:`, e.message)
                                }
                            }
                        }
                    }
                } catch (e) {
                    console.warn(`[Seed] iTunes ${genre} failed:`, e.message)
                }
            }
        } catch (e) {
            console.warn('[Seed] iTunes fetch failed:', e.message)
            errors.push(`iTunes fetch: ${e.message}`)
        }

        console.log(`[Seed] Completed: ${totalImported} playlists imported`)
        res.json({
            message: 'Seed completed',
            imported: totalImported,
            errors: errors.length > 0 ? errors : undefined
        })
    } catch (error) {
        console.error('[Seed] Error:', error)
        res.status(500).json({ error: error.message })
    }
})

export default router
