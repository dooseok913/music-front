import { db } from '../config/db.js'

// Simple in-memory store for demo purposes
// In production, this would be Redis or a UserProfile table
const userProfiles = new Map()

export const analysisService = {
    // Train: Aggregate data from connected platform playlists
    trainModel: async (userId) => {
        try {
            // 1. Fetch all tracks from user's "Platform" playlists (Tidal, YouTube)
            const [rows] = await db.query(`
                SELECT t.artist, t.external_metadata 
                FROM tracks t
                JOIN playlist_tracks pt ON t.track_id = pt.track_id
                JOIN playlists p ON pt.playlist_id = p.playlist_id
                WHERE p.user_id = ? AND p.source_type = 'Platform'
            `, [userId])

            if (rows.length === 0) {
                return { status: 'cold_start', message: 'No platform data found' }
            }

            // 2. Build Frequency Maps
            const artistFreq = {}
            const genreFreq = {}

            rows.forEach(track => {
                // Artist
                const artist = track.artist || 'Unknown'
                artistFreq[artist] = (artistFreq[artist] || 0) + 1

                // Genre (Mocking extraction from metadata or title if missing)
                // In real app, we'd have a genre column or fetch from metadata
                const meta = track.external_metadata || {}
                const genre = meta.genre || 'Pop' // Default to Pop for demo if missing
                genreFreq[genre] = (genreFreq[genre] || 0) + 1
            })

            // 3. Extract Top Tastes
            const topArtists = Object.entries(artistFreq)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 10)
                .map(([name, count]) => ({ name, count }))

            const topGenres = Object.entries(genreFreq)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5)
                .map(([name, count]) => ({ name, count }))

            // 4. Save Profile
            const profile = {
                userId,
                topArtists,
                topGenres,
                totalTracks: rows.length,
                lastTrained: new Date()
            }
            userProfiles.set(userId, profile)

            return { status: 'trained', profile }

        } catch (error) {
            console.error('Training Error:', error)
            throw error
        }
    },

    // Evaluate: Score a target playlist against the user's profile
    evaluatePlaylist: async (userId, playlistId) => {
        const profile = userProfiles.get(userId)

        // If no model, return default "Heuristic" score
        if (!profile) {
            return {
                score: 50,
                grade: 'B',
                reason: 'Model not trained yet. Based on general quality.'
            }
        }

        // Fetch playlist tracks
        const [tracks] = await db.query(`
            SELECT t.artist, t.title
            FROM tracks t
            JOIN playlist_tracks pt ON t.track_id = pt.track_id
            WHERE pt.playlist_id = ?
        `, [playlistId])

        if (tracks.length === 0) return { score: 0, grade: 'F', reason: 'Empty playlist' }

        let matchScore = 0
        const matches = []

        // Scoring Logic
        tracks.forEach(track => {
            // Artist Match
            const artistMatch = profile.topArtists.find(a => a.name === track.artist)
            if (artistMatch) {
                matchScore += 10
                if (!matches.includes(track.artist)) matches.push(track.artist)
            }

            // Random Genre Bonus (Simulated for demo since we don't have deep genre data on tracks yet)
            if (Math.random() > 0.7) matchScore += 5
        })

        // Normalize Score (0-100)
        // Cap at 100, ensure base quality
        let finalScore = Math.min(100, (matchScore / tracks.length) * 20 + 40) // Base 40 + matches

        // Grading
        let grade = 'C'
        if (finalScore >= 90) grade = 'S'
        else if (finalScore >= 80) grade = 'A'
        else if (finalScore >= 70) grade = 'B'

        // Determine "Taste Compatibility" text
        const topMatch = matches.slice(0, 3).join(', ')
        const reason = matches.length > 0
            ? `Matches your taste in: ${topMatch}`
            : 'New style for you, but looks high quality.'

        return {
            score: Math.round(finalScore),
            grade,
            reason,
            matchDetails: matches
        }
    }
}
