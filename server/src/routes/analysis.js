import express from 'express'
import { analysisService } from '../services/analysisService.js'
import { db } from '../config/db.js'

const router = express.Router()

// POST /api/analysis/train - Train model from connected platforms
router.post('/train', async (req, res) => {
    // Mock user ID 1 for demo
    const userId = 1
    try {
        const result = await analysisService.trainModel(userId)
        res.json(result)
    } catch (error) {
        res.status(500).json({ error: error.message })
    }
})

// POST /api/analysis/evaluate/:id - Evaluate a playlist
router.post('/evaluate/:id', async (req, res) => {
    const userId = 1
    const playlistId = req.params.id

    try {
        const result = await analysisService.evaluatePlaylist(userId, playlistId)

        // Update playlist status if score is good (Auto-Promote candidate)
        // PFP = Personal Filtered Playlist (Verified)
        if (result.score >= 70) {
            await db.query(`
                UPDATE playlists 
                SET status_flag = 'PFP', ai_score = ? 
                WHERE playlist_id = ?
            `, [result.score, playlistId])
        }

        res.json(result)
    } catch (error) {
        res.status(500).json({ error: error.message })
    }
})

export default router
