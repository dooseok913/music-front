import express from 'express'

const router = express.Router()

// Tidal API Configuration
const TIDAL_AUTH_URL = 'https://auth.tidal.com/v1/oauth2/token'
const TIDAL_API_URL = 'https://api.tidal.com/v1'

let cachedToken = null
let tokenExpiry = null
let userToken = null
let userTokenExpiry = null

// Get Client Credentials Token
async function getClientToken() {
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
    tokenExpiry = Date.now() + (data.expires_in * 1000) - 60000
    return cachedToken
}

// Helper: Make Tidal API Request (Prefer User Token)
async function tidalRequest(endpoint, params = {}) {
    let token = userToken && userTokenExpiry && Date.now() < userTokenExpiry ? userToken : null

    // Fallback to client token if no user token
    if (!token) {
        token = await getClientToken()
    }

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

// POST /api/tidal/auth/device - Init Device Flow
router.post('/auth/device', async (req, res) => {
    try {
        const clientId = process.env.TIDAL_CLIENT_ID
        // Using Open Access scope or default
        // const scope = 'r_usr w_usr' 

        const response = await fetch('https://auth.tidal.com/v1/oauth2/device_authorization', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: `client_id=${clientId}&scope=r_usr`
        })

        if (!response.ok) {
            const errorText = await response.text()
            console.error('Tidal Device Auth Init Failed:', {
                status: response.status,
                statusText: response.statusText,
                error: errorText,
                clientIdPartial: clientId ? clientId.substring(0, 5) + '...' : 'MISSING'
            })
            throw new Error(errorText)
        }

        const data = await response.json()
        res.json(data)
    } catch (error) {
        res.status(500).json({ error: error.message })
    }
})

// POST /api/tidal/auth/token - Polling for Token (Device Flow)
router.post('/auth/token', async (req, res) => {
    try {
        const { deviceCode } = req.body
        const clientId = process.env.TIDAL_CLIENT_ID
        const clientSecret = process.env.TIDAL_CLIENT_SECRET
        const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')

        const response = await fetch(TIDAL_AUTH_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Basic ${credentials}`,
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: `grant_type=urn:ietf:params:oauth:grant-type:device_code&device_code=${deviceCode}&scope=r_usr`
        })

        const data = await response.json()

        if (data.error) {
            return res.status(400).json(data)
        }

        userToken = data.access_token
        userTokenExpiry = Date.now() + (data.expires_in * 1000)

        res.json({ success: true, user: data.user })
    } catch (error) {
        res.status(500).json({ error: error.message })
    }
})

// --- WEB AUTH FLOW ---

// GET /api/tidal/auth/login - Redirect to Tidal Login
router.get('/auth/login', (req, res) => {
    const clientId = process.env.TIDAL_CLIENT_ID
    const redirectUri = 'http://localhost:5173/tidal-callback' // Frontend Callback Route
    const scope = 'r_usr w_usr'

    // Construct Authorization Code Flow URL
    // Note: Tidal's documented auth URL for web is https://auth.tidal.com/v1/oauth2/authorize
    // But some docs say login.tidal.com/oauth2/authorize. We stick to auth.tidal.com/v1

    const authUrl = `https://auth.tidal.com/v1/oauth2/authorize?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scope}`

    // If called via AJAX, return URL. If browser, could redirect. 
    // Ideally we just return the URL so frontend pops it up.
    // However, if we use window.open('/api/...') it expects a page or redirect.
    res.redirect(authUrl)
})

// POST /api/tidal/auth/exchange - Exchange Code for Token
router.post('/auth/exchange', async (req, res) => {
    try {
        const { code } = req.body
        const clientId = process.env.TIDAL_CLIENT_ID
        const clientSecret = process.env.TIDAL_CLIENT_SECRET
        const redirectUri = 'http://localhost:5173/tidal-callback'

        const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')

        const response = await fetch(TIDAL_AUTH_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Basic ${credentials}`,
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: `grant_type=authorization_code&code=${code}&redirect_uri=${encodeURIComponent(redirectUri)}`
        })

        const data = await response.json()

        if (data.error) {
            console.error('Token Exchange Error:', data)
            return res.status(400).json({ success: false, error: data.error_description || data.error })
        }

        userToken = data.access_token
        userTokenExpiry = Date.now() + (data.expires_in * 1000)

        res.json({ success: true, user: { username: data.user?.username || 'Tidal User' } })
    } catch (error) {
        console.error('Exchange Exception:', error)
        res.status(500).json({ success: false, error: error.message })
    }
})

// GET /api/tidal/auth/status - Check auth status
router.get('/auth/status', async (req, res) => {
    try {
        // Just verify if we can get a token (client or user)
        const hasUserToken = !!(userToken && userTokenExpiry && Date.now() < userTokenExpiry)

        if (!hasUserToken) {
            await getClientToken() // Ensure client token works at least
        }

        res.json({
            authenticated: true, // System is authenticated
            userConnected: hasUserToken, // User is logged in
            type: hasUserToken ? 'User' : 'Client'
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
        const genres = ['Classical', 'Vocal Jazz', 'K-POP']
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
