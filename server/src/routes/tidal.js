import express from 'express'

const router = express.Router()

// Tidal API Configuration
const TIDAL_AUTH_URL = 'https://auth.tidal.com/v1/oauth2/token'
const TIDAL_API_URL = 'https://api.tidal.com/v1'

let cachedToken = null
let tokenExpiry = null

// Get Access Token (Client Credentials Flow)
async function getTidalToken() {
    // Return cached token if still valid
    if (cachedToken && tokenExpiry && Date.now() < tokenExpiry) {
        return cachedToken
    }

    const clientId = process.env.TIDAL_CLIENT_ID
    const clientSecret = process.env.TIDAL_CLIENT_SECRET

    if (!clientId || !clientSecret) {
        throw new Error('Tidal API credentials not configured')
    }

    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')

    const response = await fetch(TIDAL_AUTH_URL, {
        method: 'POST',
        headers: {
            'Authorization': `Basic ${credentials}`,
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: 'grant_type=client_credentials'
    })

    if (!response.ok) {
        const error = await response.text()
        throw new Error(`Tidal auth failed: ${error}`)
    }

    const data = await response.json()
    cachedToken = data.access_token
    tokenExpiry = Date.now() + (data.expires_in * 1000) - 60000 // Refresh 1 min early

    return cachedToken
}

// Helper: Make Tidal API Request
async function tidalRequest(endpoint, params = {}) {
    const token = await getTidalToken()

    const url = new URL(`${TIDAL_API_URL}${endpoint}`)
    Object.entries(params).forEach(([key, value]) => {
        if (value) url.searchParams.append(key, value)
    })

    const response = await fetch(url.toString(), {
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            'Accept': 'application/vnd.tidal.v1+json'
        }
    })

    if (!response.ok) {
        const error = await response.text()
        console.error(`Tidal API Error: ${response.status} ${response.statusText}`, error)
        throw new Error(`Tidal API error: ${response.status} ${error}`)
    }

    return response.json()
}

// GET /api/tidal/auth/status - Check auth status
router.get('/auth/status', async (req, res) => {
    try {
        const token = await getTidalToken()
        res.json({
            authenticated: true,
            expiresAt: tokenExpiry
        })
    } catch (error) {
        res.json({
            authenticated: false,
            error: error.message
        })
    }
})

// GET /api/tidal/search/playlists - Search playlists
router.get('/search/playlists', async (req, res) => {
    try {
        const { query = 'K-POP', limit = 10, countryCode = 'US' } = req.query

        const data = await tidalRequest('/search', {
            query,
            type: 'PLAYLISTS',
            limit,
            countryCode
        })

        res.json(data)
    } catch (error) {
        res.status(500).json({ error: error.message })
    }
})

// GET /api/tidal/playlists/:id - Get playlist details
router.get('/playlists/:id', async (req, res) => {
    try {
        const { id } = req.params
        const { countryCode = 'KR' } = req.query

        const data = await tidalRequest(`/playlists/${id}`, { countryCode })
        res.json(data)
    } catch (error) {
        res.status(500).json({ error: error.message })
    }
})

// GET /api/tidal/playlists/:id/items - Get playlist tracks
router.get('/playlists/:id/items', async (req, res) => {
    try {
        const { id } = req.params
        const { limit = 50, offset = 0, countryCode = 'KR' } = req.query

        const data = await tidalRequest(`/playlists/${id}/items`, {
            limit,
            offset,
            countryCode
        })

        res.json(data)
    } catch (error) {
        res.status(500).json({ error: error.message })
    }
})

// GET /api/tidal/featured - Get featured/curated playlists
router.get('/featured', async (req, res) => {
    try {
        const { countryCode = 'US', limit = 20 } = req.query

        // Search for popular genre playlists
        const genres = ['K-POP', 'Pop', 'Hip-Hop', 'Rock', 'Electronic']
        const results = []

        for (const genre of genres) {
            try {
                const data = await tidalRequest('/search', {
                    query: genre,
                    type: 'PLAYLISTS',
                    limit: 5,
                    countryCode
                })
                if (data.playlists) {
                    results.push({
                        genre,
                        playlists: data.playlists.slice(0, 5)
                    })
                }
            } catch (e) {
                console.error(`Failed to fetch ${genre}:`, e.message)
            }
        }

        if (results.length === 0) {
            console.warn(`Tidal API returned 0 results for genres. Check region/auth.`)
        }

        res.json({ featured: results })
    } catch (error) {
        console.error('Final error in /featured:', error)
        res.status(500).json({ error: error.message })
    }
})

export default router
