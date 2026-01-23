import express from 'express'

const router = express.Router()

// YouTube Data API v3 Configuration
const YOUTUBE_API_URL = 'https://www.googleapis.com/youtube/v3'

// Helper: Make YouTube API Request
async function youtubeRequest(endpoint, params = {}) {
    const apiKey = process.env.YOUTUBE_KEY

    if (!apiKey) {
        throw new Error('YouTube API key not configured')
    }

    const url = new URL(`${YOUTUBE_API_URL}${endpoint}`)
    url.searchParams.append('key', apiKey)

    Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
            url.searchParams.append(key, value)
        }
    })

    const response = await fetch(url.toString())

    if (!response.ok) {
        const error = await response.text()
        console.error(`YouTube API Error: ${response.status}`, error)
        throw new Error(`YouTube API error: ${response.status}`)
    }

    return response.json()
}

// Helper: Parse ISO 8601 duration to seconds
function parseDuration(duration) {
    if (!duration) return 0

    const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/)
    if (!match) return 0

    const hours = parseInt(match[1] || 0)
    const minutes = parseInt(match[2] || 0)
    const seconds = parseInt(match[3] || 0)

    return hours * 3600 + minutes * 60 + seconds
}

// GET /api/youtube/status - Check API key validity
router.get('/status', async (req, res) => {
    try {
        const apiKey = process.env.YOUTUBE_KEY

        if (!apiKey) {
            return res.json({
                authenticated: false,
                error: 'YouTube API key not configured'
            })
        }

        // Make a minimal API call to verify the key works
        await youtubeRequest('/videos', {
            part: 'id',
            chart: 'mostPopular',
            maxResults: 1
        })

        res.json({
            authenticated: true,
            message: 'YouTube API connected'
        })
    } catch (error) {
        res.json({
            authenticated: false,
            error: error.message
        })
    }
})

// GET /api/youtube/search - Search for playlists
router.get('/search', async (req, res) => {
    try {
        const { q = 'K-Pop playlist', maxResults = 10 } = req.query

        const data = await youtubeRequest('/search', {
            part: 'snippet',
            type: 'playlist',
            q,
            maxResults,
            relevanceLanguage: 'ko'
        })

        // Transform to consistent format
        const playlists = data.items.map(item => ({
            id: item.id.playlistId,
            title: item.snippet.title,
            description: item.snippet.description,
            thumbnail: item.snippet.thumbnails?.high?.url || item.snippet.thumbnails?.medium?.url || '',
            channelTitle: item.snippet.channelTitle,
            publishedAt: item.snippet.publishedAt
        }))

        res.json({ playlists })
    } catch (error) {
        console.error('YouTube search error:', error)
        res.status(500).json({ error: error.message })
    }
})

// GET /api/youtube/playlist/:id - Get playlist details
router.get('/playlist/:id', async (req, res) => {
    try {
        const { id } = req.params

        const data = await youtubeRequest('/playlists', {
            part: 'snippet,contentDetails',
            id
        })

        if (!data.items || data.items.length === 0) {
            return res.status(404).json({ error: 'Playlist not found' })
        }

        const playlist = data.items[0]

        res.json({
            id: playlist.id,
            title: playlist.snippet.title,
            description: playlist.snippet.description,
            thumbnail: playlist.snippet.thumbnails?.high?.url || playlist.snippet.thumbnails?.medium?.url || '',
            channelTitle: playlist.snippet.channelTitle,
            itemCount: playlist.contentDetails.itemCount,
            publishedAt: playlist.snippet.publishedAt
        })
    } catch (error) {
        console.error('YouTube playlist error:', error)
        res.status(500).json({ error: error.message })
    }
})

// GET /api/youtube/playlist/:id/items - Get playlist tracks/videos
router.get('/playlist/:id/items', async (req, res) => {
    try {
        const { id } = req.params
        const { pageToken, maxResults = 50 } = req.query

        // 1. Get playlist items
        const params = {
            part: 'snippet,contentDetails',
            playlistId: id,
            maxResults
        }

        if (pageToken) {
            params.pageToken = pageToken
        }

        const data = await youtubeRequest('/playlistItems', params)

        if (!data.items || data.items.length === 0) {
            return res.json({
                items: [],
                nextPageToken: null,
                totalResults: 0
            })
        }

        // 2. Get video details for duration
        const videoIds = data.items
            .map(item => item.contentDetails?.videoId)
            .filter(Boolean)
            .join(',')

        let videoDetails = {}

        if (videoIds) {
            const videosData = await youtubeRequest('/videos', {
                part: 'contentDetails,snippet',
                id: videoIds
            })

            videoDetails = videosData.items.reduce((acc, video) => {
                acc[video.id] = {
                    duration: parseDuration(video.contentDetails?.duration),
                    channelTitle: video.snippet?.channelTitle
                }
                return acc
            }, {})
        }

        // 3. Transform to consistent format
        const items = data.items.map((item, index) => {
            const videoId = item.contentDetails?.videoId
            const details = videoDetails[videoId] || {}

            return {
                id: videoId,
                title: item.snippet.title,
                channelTitle: details.channelTitle || item.snippet.videoOwnerChannelTitle || '',
                thumbnail: item.snippet.thumbnails?.high?.url || item.snippet.thumbnails?.medium?.url || '',
                duration: details.duration || 0,
                position: item.snippet.position ?? index
            }
        })

        res.json({
            items,
            nextPageToken: data.nextPageToken || null,
            totalResults: data.pageInfo?.totalResults || items.length
        })
    } catch (error) {
        console.error('YouTube playlist items error:', error)
        res.status(500).json({ error: error.message })
    }
})

// GET /api/youtube/playlists - Get featured/trending playlists (for auto-discovery)
router.get('/playlists', async (req, res) => {
    try {
        const { maxResults = 10 } = req.query

        // Search for popular music playlists
        const genres = ['K-Pop hits', 'Pop music playlist', 'Hip Hop playlist']
        const allPlaylists = []

        for (const genre of genres) {
            try {
                const data = await youtubeRequest('/search', {
                    part: 'snippet',
                    type: 'playlist',
                    q: genre,
                    maxResults: 5,
                    relevanceLanguage: 'ko'
                })

                const playlists = data.items.map(item => ({
                    id: item.id.playlistId,
                    title: item.snippet.title,
                    description: item.snippet.description,
                    thumbnail: item.snippet.thumbnails?.high?.url || '',
                    channelTitle: item.snippet.channelTitle,
                    publishedAt: item.snippet.publishedAt
                }))

                allPlaylists.push(...playlists)
            } catch (e) {
                console.error(`Failed to fetch ${genre}:`, e.message)
            }
        }

        // Dedupe by id
        const uniquePlaylists = Array.from(
            new Map(allPlaylists.map(p => [p.id, p])).values()
        ).slice(0, maxResults)

        res.json({ playlists: uniquePlaylists })
    } catch (error) {
        console.error('YouTube playlists error:', error)
        res.status(500).json({ error: error.message })
    }
})

export default router
