/**
 * Spotify에서 앨범 아트워크 가져와서 tracks 테이블 채우기
 *
 * 실행: cd server && node fill_artwork.js
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

// Batch get tracks (up to 50 at a time)
async function getBatchTracks(spotifyIds) {
    if (!spotifyIds.length) return []
    const token = await getSpotifyToken()

    try {
        const res = await fetch(`https://api.spotify.com/v1/tracks?ids=${spotifyIds.join(',')}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        })

        if (!res.ok) {
            console.error(`API Error: ${res.status}`)
            return []
        }

        const data = await res.json()
        return data.tracks || []
    } catch (e) {
        console.error('Fetch error:', e.message)
        return []
    }
}

async function main() {
    console.log('🎨 앨범 아트워크 채우기 시작\n')

    // Get tracks with spotify_id but no artwork
    const [tracks] = await pool.execute(`
        SELECT track_id, spotify_id
        FROM tracks
        WHERE spotify_id IS NOT NULL AND artwork IS NULL
        ORDER BY track_id
    `)

    console.log(`📊 처리할 트랙 수: ${tracks.length}\n`)

    if (tracks.length === 0) {
        console.log('✅ 모든 트랙에 아트워크가 있습니다.')
        await pool.end()
        return
    }

    let processed = 0
    let success = 0
    let failed = 0
    const batchSize = 50 // Spotify allows up to 50 for /tracks endpoint
    const startTime = Date.now()

    for (let i = 0; i < tracks.length; i += batchSize) {
        const batch = tracks.slice(i, i + batchSize)
        const spotifyIds = batch.map(t => t.spotify_id)

        const spotifyTracks = await getBatchTracks(spotifyIds)

        // Create map for quick lookup
        const trackMap = {}
        spotifyTracks.forEach(t => {
            if (t && t.id) {
                trackMap[t.id] = t
            }
        })

        // Update each track
        for (const track of batch) {
            processed++
            const spotifyTrack = trackMap[track.spotify_id]

            if (spotifyTrack && spotifyTrack.album?.images?.[0]?.url) {
                const artworkUrl = spotifyTrack.album.images[0].url
                await pool.execute(
                    'UPDATE tracks SET artwork = ? WHERE track_id = ?',
                    [artworkUrl, track.track_id]
                )
                success++
            } else {
                failed++
            }

            process.stdout.write(`\r✅ ${processed}/${tracks.length} 처리 중... (성공: ${success}, 실패: ${failed})`)
        }

        // Rate limit between batches
        await new Promise(r => setTimeout(r, 300))
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
            SUM(IF(artwork IS NOT NULL, 1, 0)) as has_artwork
        FROM tracks
    `)
    console.log(`\n📊 최종 상태:`)
    console.log(`   - 전체 트랙: ${summary[0].total}`)
    console.log(`   - Spotify ID 있음: ${summary[0].has_spotify}`)
    console.log(`   - 아트워크 있음: ${summary[0].has_artwork}`)

    await pool.end()
}

main().catch(e => {
    console.error('❌ 오류:', e)
    process.exit(1)
})
