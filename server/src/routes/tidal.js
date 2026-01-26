import express from 'express'
import crypto from 'crypto'

const router = express.Router()

// Tidal API Configuration
const TIDAL_AUTH_URL = 'https://auth.tidal.com/v1/oauth2/token'
const TIDAL_API_URL = 'https://api.tidal.com/v1'

let cachedToken = null
let tokenExpiry = null
let userToken = null
let userTokenExpiry = null
let pkceVerifier = null // Store PKCE code_verifier

// PKCE Helper Functions
function generateCodeVerifier() {
    return crypto.randomBytes(32).toString('base64url')
}

function generateCodeChallenge(verifier) {
    return crypto.createHash('sha256').update(verifier).digest('base64url')
}

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
async function tidalRequest(endpoint, params = {}, tokenOverride = null) {
    let token = tokenOverride || (userToken && userTokenExpiry && Date.now() < userTokenExpiry ? userToken : null)

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
        const scopes = 'r_usr w_usr w_sub'

        const response = await fetch('https://auth.tidal.com/v1/oauth2/device_authorization', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: `client_id=${clientId}&scope=${encodeURIComponent(scopes)}`
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

        // Match Rust app: use form body instead of Basic Auth header
        const params = new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            device_code: deviceCode,
            grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
            scope: 'r_usr w_usr w_sub'
        })

        const response = await fetch(TIDAL_AUTH_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: params.toString()
        })

        const data = await response.json()

        if (data.error) {
            return res.status(400).json(data)
        }

        const token = data.access_token

        // Match sample code: Get session info immediately after token
        console.log('[Tidal] Fetching session info after poll...')
        const sessionResp = await fetch(`${TIDAL_API_URL}/sessions`, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/vnd.tidal.v1+json'
            }
        })

        if (!sessionResp.ok) {
            console.error('[Tidal] Session fetch failed:', sessionResp.status)
            return res.status(sessionResp.status).json({ success: false, error: 'Failed to fetch session info' })
        }

        const session = await sessionResp.json()
        console.log('[Tidal] Session acquired:', session)

        userToken = token
        userTokenExpiry = Date.now() + (data.expires_in * 1000)

        res.json({
            success: true,
            user: {
                userId: session.userId || session.user_id,
                countryCode: session.countryCode || session.country_code,
                username: session.username || 'Tidal User'
            },
            access_token: token
        })
    } catch (error) {
        res.status(500).json({ error: error.message })
    }
})

// --- WEB AUTH FLOW ---

// GET /api/tidal/auth/login - Redirect to Tidal Login (with PKCE)
router.get('/auth/login', (req, res) => {
    const clientId = process.env.TIDAL_CLIENT_ID
    const redirectUri = 'http://localhost:5173/tidal-callback'

    // Generate PKCE code_verifier and code_challenge
    pkceVerifier = generateCodeVerifier()
    const codeChallenge = generateCodeChallenge(pkceVerifier)

    // Scopes matching Tidal sample code configuration
    const scopes = [
        'r_usr',
        'w_usr',
        'w_sub'
    ].join(' ')

    const authUrl = `https://login.tidal.com/authorize?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scopes)}&code_challenge=${codeChallenge}&code_challenge_method=S256`

    res.redirect(authUrl)
})

// POST /api/tidal/auth/exchange - Exchange Code for Token (with PKCE)
router.post('/auth/exchange', async (req, res) => {
    try {
        const { code } = req.body
        const clientId = process.env.TIDAL_CLIENT_ID
        const clientSecret = process.env.TIDAL_CLIENT_SECRET
        const redirectUri = 'http://localhost:5173/tidal-callback'

        if (!pkceVerifier) {
            return res.status(400).json({ success: false, error: 'PKCE verifier not found. Please restart login flow.' })
        }

        const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')

        const response = await fetch(TIDAL_AUTH_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Basic ${credentials}`,
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: `grant_type=authorization_code&code=${code}&redirect_uri=${encodeURIComponent(redirectUri)}&code_verifier=${pkceVerifier}`
        })

        // Clear the verifier after use
        pkceVerifier = null

        const data = await response.json()

        if (data.error) {
            console.error('Token Exchange Error:', data)
            return res.status(400).json({ success: false, error: data.error_description || data.error })
        }

        const token = data.access_token
        userToken = token
        userTokenExpiry = Date.now() + (data.expires_in * 1000)

        // Get session info to retrieve userId and countryCode (like Rust app does)
        console.log('[Tidal] Fetching session info after exchange...')
        const sessionResp = await fetch(`${TIDAL_API_URL}/sessions`, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/vnd.tidal.v1+json'
            }
        })

        let user = { username: 'Tidal User' }
        if (sessionResp.ok) {
            const session = await sessionResp.json()
            console.log('[Tidal] Session acquired:', session)
            user = {
                userId: session.userId || session.user_id,
                countryCode: session.countryCode || session.country_code,
                username: session.username || 'Tidal User'
            }
        } else {
            console.warn('[Tidal] Session fetch failed:', sessionResp.status)
        }

        res.json({
            success: true,
            user,
            access_token: token,
            refresh_token: data.refresh_token,
            expires_in: data.expires_in
        })
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

// GET /api/tidal/search/universal - Search for multiple types
router.get('/search/universal', async (req, res) => {
    try {
        const { query, limit = 10, countryCode = 'US' } = req.query

        if (!query) return res.status(400).json({ error: 'Query is required' })

        // Use Client Token for search to avoid scope issues
        const token = await getClientToken()
        const types = ['ARTISTS', 'ALBUMS', 'TRACKS', 'PLAYLISTS']

        const params = new URLSearchParams({
            query,
            type: types.join(','),
            limit,
            countryCode
        })

        const response = await fetch(`${TIDAL_API_URL}/search?${params}`, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
                'Accept': 'application/vnd.tidal.v1+json'
            }
        })

        if (!response.ok) throw new Error(await response.text())
        const data = await response.json()

        res.json(data)
    } catch (error) {
        res.status(500).json({ error: error.message })
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

// GET /api/tidal/recommendations - Get personalized recommendations (Mixes)
router.get('/recommendations', async (req, res) => {
    try {
        const { countryCode = 'US', limit = 10 } = req.query

        // Use Client Token for generic "Mix" search as fallback
        // Since User Token 'r_usr' scope needed for true recommendations is unavailable/broken
        const token = await getClientToken()
        const params = new URLSearchParams({
            query: 'Mix',
            type: 'PLAYLISTS',
            limit,
            countryCode
        })

        const response = await fetch(`${TIDAL_API_URL}/search?${params}`, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
                'Accept': 'application/vnd.tidal.v1+json'
            }
        })

        if (!response.ok) throw new Error(await response.text())
        const data = await response.json()

        res.json(data)
    } catch (error) {
        console.error('Recommendations error:', error)
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

// Exported helper for background sync / registration
export async function fetchTidalPlaylists(token, providedUserId = null) {
    try {
        console.log('[Tidal] Fetching user playlists...')
        let tidalUserId = providedUserId
        let countryCode = 'US' // Default to US as it has the most catalog access

        // 1. Resolve user identity and detect countryCode
        console.log('[Tidal] Resolving user identity and country...')

        // Try identity endpoints - sample code uses /sessions
        const endpoints = ['/sessions', '/users/me', '/me']

        for (const endpoint of endpoints) {
            try {
                const response = await fetch(`${TIDAL_API_URL}${endpoint}`, {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Accept': 'application/vnd.tidal.v1+json'
                    }
                })

                if (response.ok) {
                    const data = await response.json()
                    tidalUserId = tidalUserId || data.userId || data.id || (data.user && data.user.id)
                    // Dynamically capture the user's account country code
                    if (data.countryCode) {
                        countryCode = data.countryCode
                        console.log('[Tidal] Detected countryCode:', countryCode)
                    }
                    if (tidalUserId) {
                        console.log(`[Tidal] Identity resolved via ${endpoint}: ${tidalUserId}`)
                        break
                    }
                }
            } catch (e) {
                console.warn(`[Tidal] Identity fetch failed for ${endpoint}`)
            }
        }

        // 2. Fallback for userId from JWT if still missing
        if (!tidalUserId) {
            try {
                const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString())
                tidalUserId = payload.user_id || payload.sub
                console.log('[Tidal] Identity extracted from JWT:', tidalUserId)
            } catch (e) { }
        }

        if (!tidalUserId) {
            throw new Error(`Failed to resolve Tidal user identity`)
        }

        // 3. Try multiple endpoints to get user's music data
        const playlistEndpoints = [
            `/users/${tidalUserId}/playlists`,
            `/users/${tidalUserId}/favorites/playlists`,
            `/my-collection/playlists/folders`
        ]

        for (const endpoint of playlistEndpoints) {
            console.log(`[Tidal] Trying endpoint: ${endpoint}`)
            try {
                const response = await fetch(`${TIDAL_API_URL}${endpoint}?countryCode=${countryCode}&limit=50`, {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Accept': 'application/vnd.tidal.v1+json'
                    }
                })

                if (response.ok) {
                    const data = await response.json()
                    const items = data.items || data.data || []
                    if (items.length > 0) {
                        console.log(`[Tidal] Success! Found ${items.length} playlists via ${endpoint}`)
                        return items
                    }
                } else {
                    console.log(`[Tidal] ${endpoint} returned ${response.status}`)
                }
            } catch (e) {
                console.warn(`[Tidal] Endpoint ${endpoint} failed:`, e.message)
            }
        }

        // 4. If no playlists found, try to get favorites tracks and create a virtual playlist
        console.log('[Tidal] No playlists accessible, trying favorites tracks...')
        const favoritesResponse = await fetch(`${TIDAL_API_URL}/users/${tidalUserId}/favorites/tracks?countryCode=${countryCode}&limit=100`, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/vnd.tidal.v1+json'
            }
        })

        if (favoritesResponse.ok) {
            const favData = await favoritesResponse.json()
            const tracks = favData.items || []
            if (tracks.length > 0) {
                console.log(`[Tidal] Found ${tracks.length} favorite tracks, creating virtual playlist`)
                // Return a virtual playlist containing favorites
                return [{
                    uuid: `tidal-favorites-${tidalUserId}`,
                    title: 'Tidal Favorites',
                    description: 'Your liked tracks from Tidal',
                    numberOfTracks: tracks.length,
                    _virtualTracks: tracks // Pass tracks directly
                }]
            }
        }

        // 5. If still nothing, return empty but don't throw
        console.log('[Tidal] No accessible playlists or favorites found')
        return []
    } catch (error) {
        console.error('[Tidal] fetchTidalPlaylists error:', error)
        // Don't throw - return empty array so sync can complete
        return []
    }
}

export async function fetchTidalPlaylistTracks(token, playlistId, countryCode = 'KR') {
    try {
        let allItems = []
        let offset = 0
        const limit = 100 // Tidal max limit per request
        let total = 0

        do {
            console.log(`[Tidal] Fetching tracks for ${playlistId} (offset: ${offset})...`)
            const response = await fetch(`${TIDAL_API_URL}/playlists/${playlistId}/items?limit=${limit}&offset=${offset}&countryCode=${countryCode}`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Accept': 'application/vnd.tidal.v1+json'
                }
            })

            if (!response.ok) {
                if (response.status === 403 && countryCode !== 'US') {
                    console.warn(`[Tidal] 403 Forbidden for tracks in ${countryCode}, falling back to US...`)
                    return fetchTidalPlaylistTracks(token, playlistId, 'US') // Retry with US
                }
                throw new Error(`Failed to fetch tracks for ${playlistId}: ${response.status}`)
            }

            const data = await response.json()
            const items = data.items || []
            allItems = allItems.concat(items)

            total = data.totalNumberOfItems || items.length // Some endpoints might not return totalNumberOfItems
            offset += items.length

            if (items.length === 0) break // Safety break

        } while (offset < total)

        console.log(`[Tidal] Total tracks fetched: ${allItems.length}`)
        return allItems
    } catch (error) {
        console.error('[Tidal] fetchTidalPlaylistTracks error:', error)
        return []
    }
}

export default router
