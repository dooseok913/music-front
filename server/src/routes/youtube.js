import express from 'express'
import { optionalAuth } from '../middleware/auth.js'

const router = express.Router()

// GET /api/youtube/search - Search for a video (Smart Match)
// GET /api/youtube/search - Search for videos/playlists
router.get('/search', optionalAuth, async (req, res) => {
    try {
        // Accept 'q' (standard) or 'query' (custom)
        const query = req.query.q || req.query.query
        const maxResults = req.query.maxResults || 1

        if (!query) {
            return res.status(400).json({ error: 'Query is required' })
        }

        const apiKey = process.env.YOUTUBE_KEY
        if (!apiKey) {
            return res.status(503).json({ error: 'YouTube API key not configured' })
        }

        const YOUTUBE_API_URL = 'https://www.googleapis.com/youtube/v3/search'
        const url = new URL(YOUTUBE_API_URL)
        url.searchParams.append('key', apiKey)
        url.searchParams.append('part', 'snippet')
        url.searchParams.append('q', query.toString())
        url.searchParams.append('type', 'video') // Prefer videos for music
        url.searchParams.append('videoCategoryId', '10') // Music category
        url.searchParams.append('maxResults', maxResults.toString())

        const response = await fetch(url.toString())
        if (!response.ok) {
            const errorText = await response.text()
            console.error('[YouTube] Search failed:', errorText)
            return res.status(response.status).json({ error: 'YouTube API error' })
        }

        const data = await response.json()
        const items = data.items || []

        // Format results
        const formattedItems = items.map(item => ({
            id: item.id?.videoId || item.id?.playlistId || item.id,
            title: item.snippet?.title,
            channelTitle: item.snippet?.channelTitle,
            thumbnail: item.snippet?.thumbnails?.high?.url || item.snippet?.thumbnails?.medium?.url,
            publishedAt: item.snippet?.publishedAt
        }))

        // Compatibility: If maxResults=1 (legacy/SmartMatch), return single object structure 
        // BUT strict check if client wanted list. MusicHome requests default=10 -> list.
        // We will return { playlists: [...] } to satisfy MusicHome which expects 'playlists' property.
        // To avoid breaking legacy single-fetch, we can check if the client *looks* like it wants the old format?
        // Actually, cleaner is to support the new format fully.

        res.json({
            playlists: formattedItems, // Map to 'playlists' for frontend compatibility
            // Legacy fields for backward compat if needed (first item)
            ...(formattedItems[0] ? {
                youtubeId: formattedItems[0].id,
                title: formattedItems[0].title,
                thumbnail: formattedItems[0].thumbnail
            } : {})
        })

    } catch (error) {
        console.error('[YouTube] Proxy error:', error)
        res.status(500).json({ error: error.message })
    }
})

export default router
