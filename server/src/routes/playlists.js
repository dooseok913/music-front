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

// POST /api/playlists/import - Import from external platform (Tidal)
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

        const playlistId = await insert(`
            INSERT INTO playlists (user_id, title, description, space_type, status_flag, source_type, external_id, cover_image)
            VALUES (?, ?, ?, 'EMS', 'PTP', 'Platform', ?, ?)
        `, [userId, title, description, platformPlaylistId, coverImage])

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
            playlist
        })
    } catch (error) {
        console.error('Error importing playlist:', error)
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
        const { targetSpace } = req.body

        if (!['EMS', 'GMS', 'PMS'].includes(targetSpace)) {
            return res.status(400).json({ error: 'Invalid space. Must be EMS, GMS, or PMS' })
        }

        const affected = await execute(`
            UPDATE playlists SET space_type = ? WHERE playlist_id = ?
        `, [targetSpace, id])

        if (affected === 0) {
            return res.status(404).json({ error: 'Playlist not found' })
        }

        res.json({
            message: `Playlist moved to ${targetSpace}`,
            spaceType: targetSpace
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

export default router
