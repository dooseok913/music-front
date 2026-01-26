/**
 * Spotify Audio Features로 tracks 테이블 채우기 (2차 패스)
 *
 * 실행: cd server && node fill_audio_features.js
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

let spotifyToken = null
let spotifyTokenExpiry = 0

async function getSpotifyToken() {
    if (spotifyToken && Date.now() < spotifyTokenExpiry) {
        return spotifyToken
    }

    const clientId = process.env.SPOTIFY_CLIENT_ID
    const clientSecret = process.env.SPOTIFY_CLIENT_SECRET

    const response = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': 'Basic ' + Buffer.from(clientId + ':' + clientSecret).toString('base64')
        },
        body: 'grant_type=client_credentials'
    })

    const data = await response.json()
    spotifyToken = data.access_token
    spotifyTokenExpiry = Date.now() + (data.expires_in - 60) * 1000
    console.log('✅ Spotify 토큰 획득')
    return spotifyToken
}

// Batch get audio features (up to 100 at a time)
async function getBatchAudioFeatures(spotifyIds) {
    if (!spotifyIds.length) return []
    const token = await getSpotifyToken()

    try {
        const res = await fetch(`https://api.spotify.com/v1/audio-features?ids=${spotifyIds.join(',')}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        })

        if (!res.ok) {
            console.error(`API Error: ${res.status}`)
            return []
        }

        const data = await res.json()
        return data.audio_features || []
    } catch (e) {
        console.error('Fetch error:', e.message)
        return []
    }
}

async function updateTrackFeatures(trackId, features) {
    if (!features) return false

    const sql = `UPDATE tracks SET
        tempo = ?,
        music_key = ?,
        mode = ?,
        time_signature = ?,
        danceability = ?,
        energy = ?,
        valence = ?,
        acousticness = ?,
        instrumentalness = ?,
        liveness = ?,
        speechiness = ?,
        loudness = ?
    WHERE track_id = ?`

    await pool.execute(sql, [
        features.tempo,
        features.key,
        features.mode,
        features.time_signature,
        features.danceability,
        features.energy,
        features.valence,
        features.acousticness,
        features.instrumentalness,
        features.liveness,
        features.speechiness,
        features.loudness,
        trackId
    ])
    return true
}

async function main() {
    console.log('🎵 Audio Features 채우기 시작\n')

    // Get tracks with spotify_id but no audio features
    const [tracks] = await pool.execute(`
        SELECT track_id, spotify_id
        FROM tracks
        WHERE spotify_id IS NOT NULL AND tempo IS NULL
        ORDER BY track_id
    `)

    console.log(`📊 처리할 트랙 수: ${tracks.length}\n`)

    if (tracks.length === 0) {
        console.log('✅ 모든 트랙에 Audio Features가 있습니다.')
        await pool.end()
        return
    }

    let processed = 0
    let success = 0
    let failed = 0
    const batchSize = 100 // Spotify allows up to 100
    const startTime = Date.now()

    for (let i = 0; i < tracks.length; i += batchSize) {
        const batch = tracks.slice(i, i + batchSize)
        const spotifyIds = batch.map(t => t.spotify_id)

        const features = await getBatchAudioFeatures(spotifyIds)

        // Create map for quick lookup
        const featuresMap = {}
        features.forEach(f => {
            if (f) featuresMap[f.id] = f
        })

        // Update each track
        for (const track of batch) {
            processed++
            const trackFeatures = featuresMap[track.spotify_id]

            if (trackFeatures) {
                await updateTrackFeatures(track.track_id, trackFeatures)
                success++
            } else {
                failed++
            }

            process.stdout.write(`\r✅ ${processed}/${tracks.length} 처리 중... (성공: ${success}, 실패: ${failed})`)
        }

        // Rate limit between batches (avoid 429)
        await new Promise(r => setTimeout(r, 500))
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
    console.log(`\n\n🎉 완료!`)
    console.log(`   - 총 처리: ${processed}`)
    console.log(`   - 성공: ${success}`)
    console.log(`   - 실패: ${failed}`)
    console.log(`   - 소요 시간: ${elapsed}초`)

    // Show final stats
    const [summary] = await pool.execute(`
        SELECT
            COUNT(*) as total,
            SUM(IF(spotify_id IS NOT NULL, 1, 0)) as has_spotify,
            SUM(IF(tempo IS NOT NULL, 1, 0)) as has_tempo,
            SUM(IF(energy IS NOT NULL, 1, 0)) as has_energy
        FROM tracks
    `)
    console.log(`\n📊 최종 상태:`)
    console.log(`   - 전체 트랙: ${summary[0].total}`)
    console.log(`   - Spotify ID 있음: ${summary[0].has_spotify}`)
    console.log(`   - Tempo 있음: ${summary[0].has_tempo}`)
    console.log(`   - Energy 있음: ${summary[0].has_energy}`)

    await pool.end()
}

main().catch(e => {
    console.error('❌ 오류:', e)
    process.exit(1)
})
