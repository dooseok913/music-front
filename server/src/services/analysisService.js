import { query, queryOne } from '../config/db.js'

// In-memory cache for user profiles
const profileCache = new Map()
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

export const analysisService = {
    // Load user profile from database
    loadProfile: async (userId) => {
        // Check cache first
        const cached = profileCache.get(userId)
        if (cached && Date.now() - cached.loadedAt < CACHE_TTL) {
            return cached.profile
        }

        // Load from database
        const row = await queryOne(
            'SELECT profile_data FROM user_profiles WHERE user_id = ?',
            [userId]
        )

        if (row && row.profile_data) {
            const profile = typeof row.profile_data === 'string'
                ? JSON.parse(row.profile_data)
                : row.profile_data
            profileCache.set(userId, { profile, loadedAt: Date.now() })
            return profile
        }

        return null
    },

    // Train: Build user profile from PMS playlists
    trainModel: async (userId) => {
        try {
            // 1. Fetch all tracks from user's PMS playlists
            const rows = await query(`
                SELECT DISTINCT
                    t.track_id,
                    t.title,
                    t.artist,
                    t.album,
                    t.duration,
                    t.genre,
                    t.popularity,
                    t.explicit,
                    p.title as playlist_title,
                    p.description as playlist_desc
                FROM tracks t
                JOIN playlist_tracks pt ON t.track_id = pt.track_id
                JOIN playlists p ON pt.playlist_id = p.playlist_id
                WHERE p.user_id = ? AND p.space_type = 'PMS'
            `, [userId])

            if (rows.length === 0) {
                // Try Platform playlists as fallback
                const platformRows = await query(`
                    SELECT t.artist, t.album, t.popularity, t.duration
                    FROM tracks t
                    JOIN playlist_tracks pt ON t.track_id = pt.track_id
                    JOIN playlists p ON pt.playlist_id = p.playlist_id
                    WHERE p.user_id = ? AND p.source_type = 'Platform'
                `, [userId])

                if (platformRows.length === 0) {
                    return { status: 'cold_start', message: 'No personal data found' }
                }
            }

            // 2. Build Frequency Maps
            const artistFreq = {}
            const albumFreq = {}
            let totalPop = 0, popCount = 0
            let totalDur = 0, durCount = 0
            let explicitCount = 0

            rows.forEach(track => {
                // Artist frequency
                const artist = track.artist || 'Unknown'
                artistFreq[artist] = (artistFreq[artist] || 0) + 1

                // Album frequency
                const album = track.album || 'Unknown'
                albumFreq[album] = (albumFreq[album] || 0) + 1

                // Popularity stats
                if (track.popularity != null) {
                    totalPop += track.popularity
                    popCount++
                }

                // Duration stats
                if (track.duration) {
                    totalDur += track.duration
                    durCount++
                }

                // Explicit count
                if (track.explicit) explicitCount++
            })

            // 3. Extract Top Preferences
            const topArtists = Object.entries(artistFreq)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 30)
                .map(([name, count]) => ({ name, count, weight: count / rows.length }))

            const topAlbums = Object.entries(albumFreq)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 20)
                .map(([name, count]) => ({ name, count }))

            // 4. Infer genres from playlist titles
            const genreKeywords = {
                'Jazz': ['jazz', '재즈', 'swing', 'bebop', 'bossa'],
                'K-Pop': ['kpop', 'k-pop', '케이팝'],
                'R&B': ['r&b', 'rnb', 'soul', '알앤비'],
                'Classical': ['classical', 'classic', '클래식'],
                'Hip-Hop': ['hip-hop', 'hiphop', 'rap', '힙합'],
                'EDM': ['edm', 'electronic', 'house'],
                'Rock': ['rock', 'metal', '락'],
                'Pop': ['pop', '팝'],
                'Acoustic': ['acoustic', '어쿠스틱'],
                'Blues': ['blues', '블루스']
            }

            const [playlists] = await query(`
                SELECT title, description FROM playlists
                WHERE user_id = ? AND space_type = 'PMS'
            `, [userId])

            const inferredGenres = {}
            if (Array.isArray(playlists)) {
                playlists.forEach(p => {
                    const text = `${p.title} ${p.description || ''}`.toLowerCase()
                    for (const [genre, keywords] of Object.entries(genreKeywords)) {
                        for (const kw of keywords) {
                            if (text.includes(kw)) {
                                inferredGenres[genre] = (inferredGenres[genre] || 0) + 1
                            }
                        }
                    }
                })
            }

            const topGenres = Object.entries(inferredGenres)
                .sort((a, b) => b[1] - a[1])
                .map(([name, count]) => ({ name, count }))

            // 5. Build Profile
            const profile = {
                userId,
                trainedAt: new Date().toISOString(),
                dataStats: {
                    totalTracks: rows.length,
                    uniqueArtists: Object.keys(artistFreq).length,
                    uniqueAlbums: Object.keys(albumFreq).length
                },
                preferences: {
                    topArtists,
                    topAlbums,
                    inferredGenres: topGenres,
                    popularityProfile: {
                        avg: popCount > 0 ? Math.round(totalPop / popCount) : 50
                    },
                    durationProfile: {
                        avg: durCount > 0 ? Math.round(totalDur / durCount) : 240
                    },
                    explicitTolerance: rows.length > 0 ? explicitCount / rows.length : 0.5
                },
                weights: {
                    artistMatch: 0.35,
                    genreMatch: 0.25,
                    popularityMatch: 0.15,
                    durationMatch: 0.10,
                    albumMatch: 0.15
                }
            }

            // 6. Save to database
            await query(`
                CREATE TABLE IF NOT EXISTS user_profiles (
                    user_id INT PRIMARY KEY,
                    profile_data JSON,
                    model_version VARCHAR(20) DEFAULT 'v1.0',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
                )
            `)

            await query(`
                INSERT INTO user_profiles (user_id, profile_data, model_version)
                VALUES (?, ?, 'v1.0')
                ON DUPLICATE KEY UPDATE
                    profile_data = VALUES(profile_data),
                    model_version = 'v1.0',
                    updated_at = CURRENT_TIMESTAMP
            `, [userId, JSON.stringify(profile)])

            // Update cache
            profileCache.set(userId, { profile, loadedAt: Date.now() })

            return {
                status: 'trained',
                profile: {
                    totalTracks: profile.dataStats.totalTracks,
                    topArtists: topArtists.slice(0, 10),
                    topGenres: topGenres.slice(0, 5),
                    avgPopularity: profile.preferences.popularityProfile.avg
                }
            }

        } catch (error) {
            console.error('Training Error:', error)
            throw error
        }
    },

    // Evaluate: Score a target playlist against the user's profile
    evaluatePlaylist: async (userId, playlistId) => {
        // Load profile from database
        let profile = await analysisService.loadProfile(userId)

        // If no trained model, return heuristic score
        if (!profile) {
            return {
                score: 50,
                grade: 'B',
                reason: 'Model not trained yet. Train with personal playlists first.',
                needsTraining: true
            }
        }

        // Fetch playlist tracks
        const tracks = await query(`
            SELECT t.artist, t.album, t.title, t.popularity, t.duration, t.genre
            FROM tracks t
            JOIN playlist_tracks pt ON t.track_id = pt.track_id
            WHERE pt.playlist_id = ?
        `, [playlistId])

        if (tracks.length === 0) {
            return { score: 0, grade: 'F', reason: 'Empty playlist' }
        }

        const weights = profile.weights
        const prefs = profile.preferences
        let totalScore = 0
        const matches = []

        // 1. Artist Match Score
        const topArtistNames = prefs.topArtists.map(a => a.name.toLowerCase())
        let artistMatches = 0
        tracks.forEach(t => {
            if (t.artist && topArtistNames.includes(t.artist.toLowerCase())) {
                artistMatches++
                if (!matches.includes(t.artist)) matches.push(t.artist)
            }
        })
        const artistScore = (artistMatches / tracks.length) * 100
        totalScore += artistScore * weights.artistMatch

        // 2. Album Match Score
        const topAlbumNames = prefs.topAlbums.map(a => a.name.toLowerCase())
        let albumMatches = 0
        tracks.forEach(t => {
            if (t.album && topAlbumNames.includes(t.album.toLowerCase())) {
                albumMatches++
            }
        })
        const albumScore = (albumMatches / tracks.length) * 100
        totalScore += albumScore * weights.albumMatch

        // 3. Popularity Similarity Score
        let popDiff = 0, popCount = 0
        tracks.forEach(t => {
            if (t.popularity != null) {
                popCount++
                popDiff += Math.abs(t.popularity - prefs.popularityProfile.avg)
            }
        })
        const avgPopDiff = popCount > 0 ? popDiff / popCount : 50
        const popularityScore = Math.max(0, 100 - avgPopDiff * 2)
        totalScore += popularityScore * weights.popularityMatch

        // 4. Duration Similarity Score
        let durDiff = 0, durCount = 0
        tracks.forEach(t => {
            if (t.duration) {
                durCount++
                durDiff += Math.abs(t.duration - prefs.durationProfile.avg)
            }
        })
        const avgDurDiff = durCount > 0 ? durDiff / durCount : 60
        const durationScore = Math.max(0, 100 - avgDurDiff / 3)
        totalScore += durationScore * weights.durationMatch

        // 5. Genre Match (if available)
        const topGenreNames = prefs.inferredGenres.map(g => g.name.toLowerCase())
        let genreMatches = 0
        tracks.forEach(t => {
            if (t.genre) {
                const trackGenres = t.genre.toLowerCase().split(',').map(g => g.trim())
                if (trackGenres.some(g => topGenreNames.includes(g))) {
                    genreMatches++
                }
            }
        })
        const genreScore = tracks.length > 0 ? (genreMatches / tracks.length) * 100 : 50
        totalScore += genreScore * weights.genreMatch

        // Base quality score
        const baseScore = 30
        const finalScore = Math.min(100, Math.max(0, totalScore + baseScore))

        // Grading
        let grade = 'C'
        if (finalScore >= 85) grade = 'S'
        else if (finalScore >= 75) grade = 'A'
        else if (finalScore >= 65) grade = 'B'
        else if (finalScore >= 50) grade = 'C'
        else grade = 'D'

        // Reason text
        const topMatch = matches.slice(0, 3).join(', ')
        const reason = matches.length > 0
            ? `Matches your taste: ${topMatch}`
            : finalScore >= 60
                ? 'Good quality, new style for you'
                : 'Different from your usual preferences'

        return {
            score: Math.round(finalScore),
            grade,
            reason,
            matchDetails: {
                artistMatches,
                albumMatches,
                genreMatches,
                matchedArtists: matches.slice(0, 5)
            }
        }
    },

    // Get user's trained profile summary
    getProfileSummary: async (userId) => {
        const profile = await analysisService.loadProfile(userId)
        if (!profile) {
            return { trained: false, message: 'No trained model found' }
        }

        return {
            trained: true,
            trainedAt: profile.trainedAt,
            stats: profile.dataStats,
            topArtists: profile.preferences.topArtists.slice(0, 10),
            topGenres: profile.preferences.inferredGenres.slice(0, 5),
            avgPopularity: profile.preferences.popularityProfile.avg
        }
    }
}
