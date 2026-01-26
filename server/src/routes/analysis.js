import express from 'express'
import { analysisService } from '../services/analysisService.js'
import { query } from '../config/db.js'

const router = express.Router()

// POST /api/analysis/train - Train model from personal playlists
router.post('/train', async (req, res) => {
    const userId = req.body.userId || 3 // Default to user 3
    try {
        const result = await analysisService.trainModel(userId)
        res.json(result)
    } catch (error) {
        res.status(500).json({ error: error.message })
    }
})

// GET /api/analysis/profile/:userId - Get user's trained profile
router.get('/profile/:userId', async (req, res) => {
    const userId = parseInt(req.params.userId)
    try {
        const result = await analysisService.getProfileSummary(userId)
        res.json(result)
    } catch (error) {
        res.status(500).json({ error: error.message })
    }
})

// POST /api/analysis/evaluate/:id - Evaluate a playlist
router.post('/evaluate/:id', async (req, res) => {
    const userId = req.body.userId || 3 // Default to user 3
    const playlistId = req.params.id

    try {
        const result = await analysisService.evaluatePlaylist(userId, playlistId)

        // Update playlist with AI score
        if (result.score) {
            await query(`
                UPDATE playlists
                SET ai_score = ?
                WHERE playlist_id = ?
            `, [result.score, playlistId])

            // Auto-promote to GMS if score >= 70
            if (result.score >= 70) {
                await query(`
                    UPDATE playlists
                    SET status_flag = 'PFP', space_type = 'GMS'
                    WHERE playlist_id = ? AND space_type = 'EMS'
                `, [playlistId])
                result.promoted = true
            }
        }

        res.json(result)
    } catch (error) {
        res.status(500).json({ error: error.message })
    }
})

// POST /api/analysis/batch-evaluate - Evaluate multiple playlists
router.post('/batch-evaluate', async (req, res) => {
    const { userId = 3, playlistIds } = req.body

    if (!playlistIds || !Array.isArray(playlistIds)) {
        return res.status(400).json({ error: 'playlistIds array required' })
    }

    try {
        const results = []
        for (const playlistId of playlistIds) {
            const result = await analysisService.evaluatePlaylist(userId, playlistId)
            results.push({ playlistId, ...result })

            // Update AI score
            if (result.score) {
                await query(
                    'UPDATE playlists SET ai_score = ? WHERE playlist_id = ?',
                    [result.score, playlistId]
                )
            }
        }

        res.json({
            evaluated: results.length,
            results
        })
    } catch (error) {
        res.status(500).json({ error: error.message })
    }
})

// GET /api/analysis/recommendations/:userId - Get personalized recommendations
router.get('/recommendations/:userId', async (req, res) => {
    const userId = parseInt(req.params.userId)
    const { limit = 10 } = req.query

    try {
        const profile = await analysisService.loadProfile(userId)
        if (!profile) {
            return res.json({
                recommendations: [],
                message: 'Train model first to get recommendations'
            })
        }

        // Get top artists from profile
        const topArtists = profile.preferences.topArtists.slice(0, 10).map(a => a.name)

        // Find playlists with matching artists that user doesn't have
        const recommendations = await query(`
            SELECT DISTINCT
                p.playlist_id as playlistId,
                p.title,
                p.description,
                p.cover_image as coverImage,
                COUNT(DISTINCT t.track_id) as trackCount,
                SUM(CASE WHEN t.artist IN (${topArtists.map(() => '?').join(',')}) THEN 1 ELSE 0 END) as matchCount
            FROM playlists p
            JOIN playlist_tracks pt ON p.playlist_id = pt.playlist_id
            JOIN tracks t ON pt.track_id = t.track_id
            WHERE p.space_type = 'EMS'
            AND p.user_id != ?
            GROUP BY p.playlist_id
            HAVING matchCount > 0
            ORDER BY matchCount DESC, trackCount DESC
            LIMIT ?
        `, [...topArtists, userId, parseInt(limit)])

        res.json({
            recommendations,
            basedOn: topArtists.slice(0, 5)
        })
    } catch (error) {
        res.status(500).json({ error: error.message })
    }
})

export default router
