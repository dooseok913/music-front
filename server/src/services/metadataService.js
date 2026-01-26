import fetch from 'node-fetch'
import { query } from '../config/db.js'

// --- Spotify Helper ---
let spotifyToken = null
let spotifyTokenExpiry = 0

async function getSpotifyToken() {
    if (spotifyToken && Date.now() < spotifyTokenExpiry) {
        return spotifyToken
    }

    const clientId = process.env.SPOTIFY_CLIENT_ID
    const clientSecret = process.env.SPOTIFY_CLIENT_SECRET

    if (!clientId || !clientSecret) {
        // Return null silently if not configured, as this is an enhancement feature
        return null
    }

    try {
        const response = await fetch('https://accounts.spotify.com/api/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Authorization': 'Basic ' + Buffer.from(clientId + ':' + clientSecret).toString('base64')
            },
            body: 'grant_type=client_credentials'
        })

        if (!response.ok) return null

        const data = await response.json()
        spotifyToken = data.access_token
        spotifyTokenExpiry = Date.now() + (data.expires_in - 60) * 1000
        return spotifyToken
    } catch (e) {
        console.error('Spotify Auth Error:', e.message)
        return null
    }
}

// --- MusicBrainz Helper ---
async function getMusicBrainzGenre(isrc) {
    if (!isrc) return null
    try {
        const response = await fetch(
            `https://musicbrainz.org/ws/2/recording?query=isrc:${isrc}&fmt=json`,
            { headers: { 'User-Agent': 'MusicSpace/1.0 (musicspace@local)' } }
        )
        const data = await response.json()

        if (!data.recordings?.length) return null
        const recording = data.recordings[0]
        const tags = recording.tags?.map(t => t.name) || []

        if (recording['release-groups']?.length) {
            const rgTags = recording['release-groups'][0].tags?.map(t => t.name) || []
            tags.push(...rgTags)
        }

        return {
            mbid: recording.id,
            tags: [...new Set(tags)].slice(0, 5)
        }
    } catch (error) {
        console.warn('MusicBrainz error:', error.message)
        return null
    }
}

// --- Last.fm Helper ---
async function getLastFmTags(artist, title) {
    const apiKey = process.env.LASTFM_API_KEY
    if (!apiKey || !artist || !title) return null

    try {
        const params = new URLSearchParams({
            method: 'track.getTopTags',
            artist: artist,
            track: title,
            api_key: apiKey,
            format: 'json'
        })

        const response = await fetch(`http://ws.audioscrobbler.com/2.0/?${params}`)
        const data = await response.json()

        if (data.error || !data.toptags?.tag) return null

        return {
            tags: data.toptags.tag.slice(0, 10).map(t => ({
                name: t.name,
                count: parseInt(t.count)
            }))
        }
    } catch (error) {
        console.warn('Last.fm error:', error.message)
        return null
    }
}

// --- Main Enrichment Service ---
const metadataService = {
    // Search Spotify by Title + Artist (Fallback if ISRC is missing or fails)
    async searchSpotify(title, artist) {
        const token = await getSpotifyToken()
        if (!token) return null

        try {
            const query = `track:${title} artist:${artist}`
            const encodedQuery = encodeURIComponent(query)
            const res = await fetch(`https://api.spotify.com/v1/search?q=${encodedQuery}&type=track&limit=1`, {
                headers: { 'Authorization': `Bearer ${token}` }
            })
            const data = await res.json()
            return data.tracks?.items?.[0] || null
        } catch (e) {
            console.error('Spotify Search Error:', e.message)
            return null
        }
    },

    // Get Audio Features from Spotify
    async getSpotifyFeatures(spotifyId) {
        const token = await getSpotifyToken()
        if (!token) return null

        try {
            const res = await fetch(`https://api.spotify.com/v1/audio-features/${spotifyId}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            })
            return await res.json()
        } catch (e) {
            return null
        }
    },

    // Orchestrator: Enrich a single track
    async enrichTrack(trackId, title, artist, iSrc = null) {
        console.log(`[Metadata] Enriching track ${trackId}: ${title} - ${artist}`)
        let updates = {}
        let tagsSet = new Set()
        let genresSet = new Set()
        let audioFeaturesObj = null

        // 1. Try Spotify (Features + Genres)
        let spotifyTrack = null
        if (iSrc) {
            // Search by ISRC first
            const token = await getSpotifyToken()
            if (token) {
                const res = await fetch(`https://api.spotify.com/v1/search?q=isrc:${iSrc}&type=track&limit=1`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                })
                const data = await res.json()
                spotifyTrack = data.tracks?.items?.[0]
            }
        }

        // Fallback: Search by Text if ISRC search failed or ISRC was missing
        if (!spotifyTrack) {
            spotifyTrack = await this.searchSpotify(title, artist)
        }

        if (spotifyTrack) {
            // Get Features
            const features = await this.getSpotifyFeatures(spotifyTrack.id)
            if (features && !features.error) {
                audioFeaturesObj = {
                    tempo: features.tempo,
                    energy: features.energy,
                    danceability: features.danceability,
                    valence: features.valence,
                    acousticness: features.acousticness,
                    instrumentalness: features.instrumentalness,
                    liveness: features.liveness,
                    speechiness: features.speechiness,
                    loudness: features.loudness,
                    key: features.key,
                    mode: features.mode,
                    time_signature: features.time_signature
                }
            }

            // Get Genres from Artist
            if (spotifyTrack.artists?.[0]?.id) {
                const token = await getSpotifyToken()
                if (token) {
                    const artistRes = await fetch(`https://api.spotify.com/v1/artists/${spotifyTrack.artists[0].id}`, {
                        headers: { 'Authorization': `Bearer ${token}` }
                    })
                    const artistData = await artistRes.json()
                    if (artistData.genres) {
                        artistData.genres.forEach(g => genresSet.add(g))
                    }
                }
            }
        }

        // 2. Try MusicBrainz (Tags/Genres) - Only if ISRC exists
        if (iSrc) {
            const mbData = await getMusicBrainzGenre(iSrc)
            if (mbData && mbData.tags) {
                mbData.tags.forEach(t => tagsSet.add(t))
                // MB often has genre-like tags
                mbData.tags.forEach(t => genresSet.add(t))
            }
            // Rate limit
            await new Promise(r => setTimeout(r, 1100))
        }

        // 3. Try Last.fm (Tags)
        const lfmData = await getLastFmTags(artist, title)
        if (lfmData && lfmData.tags) {
            lfmData.tags.forEach(t => {
                tagsSet.add(t.name)
                // Last.fm top tags are often genres
                if (t.count > 50) genresSet.add(t.name)
            })
        }

        // Prepare Updates
        if (genresSet.size > 0) {
            // Simple logic: take top 5 distinct strings as 'genre'
            updates.genre = [...genresSet].slice(0, 5).join(', ')
        }

        // Merge Audio Features with Tags if exists
        // Current DB schema has `audio_features` as JSON. 
        // `training.js` mixed them, or used tags separately. 
        // Schema definition says `audio_features` mostly for Spotify features.
        // But `training.js` stored tags in `audio_features` for `collect-genres`. 
        // Let's optimize: Store clean Spotify features as main object keys.
        // Add `tags` array to it as well.

        let finalFeatures = audioFeaturesObj || {}
        if (tagsSet.size > 0) {
            finalFeatures.tags = [...tagsSet]
        }

        if (Object.keys(finalFeatures).length > 0) {
            updates.audio_features = JSON.stringify(finalFeatures)
        }

        // Perform DB Update
        if (Object.keys(updates).length > 0) {
            let sql = 'UPDATE tracks SET '
            let params = []
            if (updates.genre) {
                sql += 'genre = ?, '
                params.push(updates.genre)
            }
            if (updates.audio_features) {
                sql += 'audio_features = ?, '
                params.push(updates.audio_features)
            }
            sql += 'updated_at = CURRENT_TIMESTAMP WHERE track_id = ?'
            params.push(trackId)

            await query(sql, params)
            console.log(`[Metadata] Updated track ${trackId}`)
            return true
        }

        return false
    }
}

export default metadataService
