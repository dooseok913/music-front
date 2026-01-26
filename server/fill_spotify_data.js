/**
 * Spotify 데이터로 tracks 테이블의 빈 필드 채우기
 *
 * 실행: cd server && node fill_spotify_data.js
 */

import 'dotenv/config'
import mysql from 'mysql2/promise'

const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 3307,
    user: process.env.DB_USER || 'musicspace',
    password: process.env.DB_PASSWORD || 'musicspace123',
    database: process.env.DB_NAME || 'music_space_db',
    waitForConnections: true,
    connectionLimit: 5
})

// Spotify Token Management
let spotifyToken = null
let spotifyTokenExpiry = 0

async function getSpotifyToken() {
    if (spotifyToken && Date.now() < spotifyTokenExpiry) {
        return spotifyToken
    }

    const clientId = process.env.SPOTIFY_CLIENT_ID
    const clientSecret = process.env.SPOTIFY_CLIENT_SECRET

    if (!clientId || !clientSecret) {
        console.error('❌ SPOTIFY_CLIENT_ID 또는 SPOTIFY_CLIENT_SECRET이 설정되지 않았습니다.')
        process.exit(1)
    }

    const response = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': 'Basic ' + Buffer.from(clientId + ':' + clientSecret).toString('base64')
        },
        body: 'grant_type=client_credentials'
    })

    if (!response.ok) {
        console.error('❌ Spotify 인증 실패:', await response.text())
        process.exit(1)
    }

    const data = await response.json()
    spotifyToken = data.access_token
    spotifyTokenExpiry = Date.now() + (data.expires_in - 60) * 1000
    console.log('✅ Spotify 토큰 획득 완료')
    return spotifyToken
}

// Search track on Spotify
async function searchSpotifyTrack(title, artist, isrc) {
    const token = await getSpotifyToken()

    // Try ISRC first
    if (isrc) {
        try {
            const res = await fetch(`https://api.spotify.com/v1/search?q=isrc:${isrc}&type=track&limit=1`, {
                headers: { 'Authorization': `Bearer ${token}` }
            })
            const data = await res.json()
            if (data.tracks?.items?.[0]) {
                return data.tracks.items[0]
            }
        } catch (e) {
            // Fallback to text search
        }
    }

    // Text search fallback
    try {
        const query = encodeURIComponent(`track:${title} artist:${artist}`)
        const res = await fetch(`https://api.spotify.com/v1/search?q=${query}&type=track&limit=1`, {
            headers: { 'Authorization': `Bearer ${token}` }
        })
        const data = await res.json()
        return data.tracks?.items?.[0] || null
    } catch (e) {
        return null
    }
}

// Get audio features
async function getAudioFeatures(spotifyId) {
    const token = await getSpotifyToken()
    try {
        const res = await fetch(`https://api.spotify.com/v1/audio-features/${spotifyId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        })
        const data = await res.json()
        if (data.error) return null
        return data
    } catch (e) {
        return null
    }
}

// Batch get audio features (up to 100 at a time)
async function getBatchAudioFeatures(spotifyIds) {
    if (!spotifyIds.length) return []
    const token = await getSpotifyToken()
    try {
        const res = await fetch(`https://api.spotify.com/v1/audio-features?ids=${spotifyIds.join(',')}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        })
        const data = await res.json()
        return data.audio_features || []
    } catch (e) {
        return []
    }
}

// Update track in database
async function updateTrack(trackId, spotifyData, features) {
    const updates = []
    const values = []

    if (spotifyData) {
        updates.push('spotify_id = ?')
        values.push(spotifyData.id)

        updates.push('popularity = ?')
        values.push(spotifyData.popularity)

        updates.push('explicit = ?')
        values.push(spotifyData.explicit ? 1 : 0)

        if (spotifyData.album?.release_date) {
            updates.push('release_date = ?')
            // Handle partial dates (YYYY or YYYY-MM)
            let releaseDate = spotifyData.album.release_date
            if (releaseDate.length === 4) releaseDate += '-01-01'
            else if (releaseDate.length === 7) releaseDate += '-01'
            values.push(releaseDate)
        }

        updates.push('track_number = ?')
        values.push(spotifyData.track_number)

        // Update duration if missing
        if (spotifyData.duration_ms) {
            updates.push('duration = ?')
            values.push(Math.round(spotifyData.duration_ms / 1000))
        }
    }

    if (features) {
        updates.push('tempo = ?')
        values.push(features.tempo)

        updates.push('music_key = ?')
        values.push(features.key)

        updates.push('mode = ?')
        values.push(features.mode)

        updates.push('time_signature = ?')
        values.push(features.time_signature)

        updates.push('danceability = ?')
        values.push(features.danceability)

        updates.push('energy = ?')
        values.push(features.energy)

        updates.push('valence = ?')
        values.push(features.valence)

        updates.push('acousticness = ?')
        values.push(features.acousticness)

        updates.push('instrumentalness = ?')
        values.push(features.instrumentalness)

        updates.push('liveness = ?')
        values.push(features.liveness)

        updates.push('speechiness = ?')
        values.push(features.speechiness)

        updates.push('loudness = ?')
        values.push(features.loudness)
    }

    if (updates.length === 0) return false

    values.push(trackId)
    const sql = `UPDATE tracks SET ${updates.join(', ')} WHERE track_id = ?`

    await pool.execute(sql, values)
    return true
}

// Main function
async function main() {
    console.log('🎵 Spotify 데이터로 트랙 정보 채우기 시작\n')

    // Get tracks without Spotify data
    const [tracks] = await pool.execute(`
        SELECT track_id, title, artist, isrc
        FROM tracks
        WHERE spotify_id IS NULL
        ORDER BY track_id
    `)

    console.log(`📊 처리할 트랙 수: ${tracks.length}\n`)

    if (tracks.length === 0) {
        console.log('✅ 모든 트랙에 Spotify 데이터가 있습니다.')
        await pool.end()
        return
    }

    let processed = 0
    let success = 0
    let failed = 0
    const batchSize = 50
    const startTime = Date.now()

    // Process in batches
    for (let i = 0; i < tracks.length; i += batchSize) {
        const batch = tracks.slice(i, i + batchSize)
        const spotifyResults = []

        // Search Spotify for each track
        for (const track of batch) {
            const spotifyTrack = await searchSpotifyTrack(track.title, track.artist, track.isrc)
            spotifyResults.push({ track, spotifyTrack })

            // Rate limit: 30 requests per second max
            await new Promise(r => setTimeout(r, 50))
        }

        // Get audio features in batch
        const spotifyIds = spotifyResults
            .filter(r => r.spotifyTrack)
            .map(r => r.spotifyTrack.id)

        let featuresMap = {}
        if (spotifyIds.length > 0) {
            const features = await getBatchAudioFeatures(spotifyIds)
            features.forEach(f => {
                if (f) featuresMap[f.id] = f
            })
        }

        // Update database
        for (const { track, spotifyTrack } of spotifyResults) {
            processed++

            if (spotifyTrack) {
                const features = featuresMap[spotifyTrack.id]
                await updateTrack(track.track_id, spotifyTrack, features)
                success++
                process.stdout.write(`\r✅ ${processed}/${tracks.length} 처리 중... (성공: ${success}, 실패: ${failed})`)
            } else {
                failed++
                process.stdout.write(`\r✅ ${processed}/${tracks.length} 처리 중... (성공: ${success}, 실패: ${failed})`)
            }
        }

        // Rate limit between batches
        await new Promise(r => setTimeout(r, 1000))
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
    console.log(`\n\n🎉 완료!`)
    console.log(`   - 총 처리: ${processed}`)
    console.log(`   - 성공: ${success}`)
    console.log(`   - 실패 (Spotify에서 찾지 못함): ${failed}`)
    console.log(`   - 소요 시간: ${elapsed}초`)

    // Show summary
    const [summary] = await pool.execute(`
        SELECT
            COUNT(*) as total,
            SUM(IF(spotify_id IS NOT NULL, 1, 0)) as has_spotify,
            SUM(IF(tempo IS NOT NULL, 1, 0)) as has_features
        FROM tracks
    `)
    console.log(`\n📊 최종 상태:`)
    console.log(`   - 전체 트랙: ${summary[0].total}`)
    console.log(`   - Spotify ID 있음: ${summary[0].has_spotify}`)
    console.log(`   - Audio Features 있음: ${summary[0].has_features}`)

    await pool.end()
}

main().catch(e => {
    console.error('❌ 오류 발생:', e)
    process.exit(1)
})
