import express from 'express'

const router = express.Router()

// iTunes Search API Configuration
const ITUNES_API_URL = 'https://itunes.apple.com'

// Helper: Make iTunes API Request
async function itunesRequest(endpoint, params = {}) {
    const url = new URL(`${ITUNES_API_URL}${endpoint}`)
    Object.entries(params).forEach(([key, value]) => {
        if (value) url.searchParams.append(key, value)
    })

    const response = await fetch(url.toString())

    if (!response.ok) {
        const error = await response.text()
        console.error(`iTunes API Error: ${response.status} ${response.statusText}`, error)
        throw new Error(`iTunes API error: ${response.status} ${error}`)
    }

    return response.json()
}

// GET /api/itunes/search - Search for music
router.get('/search', async (req, res) => {
    try {
        const { term, limit = 20, country = 'US', entity = 'song' } = req.query

        if (!term) {
            return res.status(400).json({ error: 'Search term is required' })
        }

        const data = await itunesRequest('/search', {
            term,
            limit,
            country,
            media: 'music',
            entity
        })

        // Transform data to match a common format if needed, or return raw
        const results = data.results.map(item => ({
            id: item.trackId,
            title: item.trackName,
            artist: item.artistName,
            album: item.collectionName,
            artwork: item.artworkUrl100?.replace('100x100', '600x600'), // Get higher quality image
            audio: item.previewUrl, // 30s preview
            url: item.trackViewUrl,
            date: item.releaseDate
        }))

        res.json({ results })
    } catch (error) {
        res.status(500).json({ error: error.message })
    }
})

// GET /api/itunes/recommendations - Get recommended albums/playlists
router.get('/recommendations', async (req, res) => {
    try {
        const { country = 'US', limit = 10, genre } = req.query

        // Define varied search terms or use provided genre
        const queries = genre ? [genre] : ['K-Pop', 'Top Hits', 'Pop', 'New Music', 'Jazz']

        // Fetch in parallel
        const validResults = []
        const seenIds = new Set()

        const promises = queries.map(query =>
            itunesRequest('/search', {
                term: query,
                limit: 5,
                country,
                media: 'music',
                entity: 'album',
                attribute: 'albumTerm' // More targeted search
            }).catch(e => {
                console.warn(`Failed to fetch recommendations for ${query}:`, e.message)
                return { results: [] }
            })
        )

        const responses = await Promise.all(promises)

        // Aggregate and dedup
        for (const data of responses) {
            for (const item of data.results) {
                // Ensure it's a collection and we haven't seen it
                if (item.collectionId && !seenIds.has(item.collectionId)) {
                    seenIds.add(item.collectionId)
                    validResults.push({
                        id: item.collectionId,
                        title: item.collectionName,
                        artist: item.artistName,
                        artwork: item.artworkUrl100?.replace('100x100', '600x600'),
                        count: item.trackCount,
                        genre: item.primaryGenreName,
                        date: item.releaseDate,
                        link: item.collectionViewUrl
                    })
                }
            }
        }

        // Shuffle results for variety
        const shuffled = validResults.sort(() => 0.5 - Math.random()).slice(0, limit * 2) // Return plenty

        res.json({ recommendations: shuffled })
    } catch (error) {
        console.error('Recommendations error:', error)
        res.status(500).json({ error: error.message })
    }
})

// GET /api/itunes/album/:id - Get tracks for an album
router.get('/album/:id', async (req, res) => {
    try {
        const { id } = req.params
        let { country = 'US' } = req.query

        // Helper to fetch and parse album data
        const fetchAlbumData = async (countryCode) => {
            const data = await itunesRequest('/lookup', {
                id,
                entity: 'song',
                country: countryCode
            })

            if (!data.results || data.results.length === 0) {
                return null
            }

            const collection = data.results[0]
            const tracks = data.results.slice(1).map(item => ({
                id: item.trackId,
                title: item.trackName,
                artist: item.artistName,
                album: item.collectionName,
                artwork: item.artworkUrl100?.replace('100x100', '600x600'),
                audio: item.previewUrl,
                url: item.trackViewUrl,
                duration: Math.round((item.trackTimeMillis || 0) / 1000),
                trackNumber: item.trackNumber
            }))

            return {
                id: collection.collectionId,
                title: collection.collectionName,
                artist: collection.artistName,
                trackCount: collection.trackCount,
                tracks
            }
        }

        // Try requested country first
        let result = await fetchAlbumData(country)

        // If no tracks found and country was KR, try US as fallback
        if (result && result.tracks.length === 0 && country === 'KR') {
            console.log(`No tracks in KR for album ${id}, trying US...`)
            result = await fetchAlbumData('US')
        }

        if (!result) {
            return res.status(404).json({ error: 'Album not found' })
        }

        res.json(result)

    } catch (error) {
        res.status(500).json({ error: error.message })
    }
})


export default router
