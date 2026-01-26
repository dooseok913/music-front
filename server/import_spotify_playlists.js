/**
 * Spotify 플레이리스트를 EMS에 가져오기
 *
 * 실행: cd server && node import_spotify_playlists.js
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
    connectionLimit: 10
})

// 가져올 플레이리스트 목록
const PLAYLISTS_TO_IMPORT = [
    // 메인 페이지용
    { id: '2EoheVFjqIxgJMb8VnDRtZ', category: 'K-POP' },
    { id: '7DmYmaINse2wok7HB4MxLI', category: 'K-POP Classic' },
    { id: '61cyUEpHKKq8EWOOHnakvV', category: 'Korean R&B' },
    { id: '1p39yBnRodpwdsd3ByuTxc', category: 'Korean Hip-Hop' },
    { id: '78WV3Ue33z6RxgxsbhewTg', category: 'Global Hip-Hop' },
    { id: '5xS3Gi0fA3Uo6RScucyct6', category: 'Party' },

    // EMS 장르별
    { id: '2SM6rniZl84fEyMCB5KMQB', category: 'Workout' },
    { id: '07UHFyiPyJBz3AN4tqbnba', category: 'Study' },
    { id: '4Xv7w5RBLUz71sSzIs4C6b', category: 'Acoustic' },
    { id: '7dH5BChboIDJ9Zp5IUk18E', category: 'Cafe' },
    { id: '0x5sdZSd4GbYmAucCshEsO', category: 'Latin' },
    { id: '5PCv6afEatU3z9cq2fBPDs', category: 'EDM' },
    { id: '1DSEi0lvLOzTiKqnaYZBDh', category: 'Classical' },
    { id: '5TZkls9cEOzWDR6qCxwDot', category: 'Hip-Hop' },
]

// Spotify Token
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
    return spotifyToken
}

// Spotify API 호출
async function spotifyFetch(endpoint) {
    const token = await getSpotifyToken()
    const res = await fetch(`https://api.spotify.com/v1${endpoint}`, {
        headers: { 'Authorization': `Bearer ${token}` }
    })

    if (!res.ok) {
        console.error(`Spotify API Error: ${res.status} for ${endpoint}`)
        return null
    }

    return res.json()
}

// 플레이리스트 정보 가져오기
async function getPlaylistInfo(playlistId) {
    return spotifyFetch(`/playlists/${playlistId}?fields=id,name,description,images,owner,tracks.total`)
}

// 플레이리스트 트랙 가져오기 (페이지네이션 처리)
async function getPlaylistTracks(playlistId) {
    const tracks = []
    let offset = 0
    const limit = 100

    while (true) {
        const data = await spotifyFetch(`/playlists/${playlistId}/tracks?offset=${offset}&limit=${limit}&fields=items(track(id,name,artists,album,duration_ms,popularity,explicit,track_number,external_ids))`)

        if (!data || !data.items) break

        for (const item of data.items) {
            if (item.track && item.track.id) {
                tracks.push(item.track)
            }
        }

        if (data.items.length < limit) break
        offset += limit

        // Rate limit
        await new Promise(r => setTimeout(r, 100))
    }

    return tracks
}

// 트랙을 DB에 저장 (중복 체크)
async function saveTrack(track) {
    // 먼저 spotify_id로 기존 트랙 확인
    const [existing] = await pool.execute(
        'SELECT track_id FROM tracks WHERE spotify_id = ?',
        [track.id]
    )

    if (existing.length > 0) {
        return existing[0].track_id
    }

    // ISRC 추출
    const isrc = track.external_ids?.isrc || null

    // 아티스트 이름 (첫 번째 아티스트)
    const artist = track.artists?.map(a => a.name).join(', ') || 'Unknown'

    // 앨범 정보
    const album = track.album?.name || null

    // 발매일 처리
    let releaseDate = track.album?.release_date || null
    if (releaseDate) {
        if (releaseDate.length === 4) releaseDate += '-01-01'
        else if (releaseDate.length === 7) releaseDate += '-01'
    }

    // 트랙 삽입
    const [result] = await pool.execute(`
        INSERT INTO tracks (title, artist, album, duration, isrc, spotify_id, popularity, explicit, release_date, track_number, genre)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
        track.name,
        artist,
        album,
        track.duration_ms ? Math.round(track.duration_ms / 1000) : null,
        isrc,
        track.id,
        track.popularity || null,
        track.explicit ? 1 : 0,
        releaseDate,
        track.track_number || null,
        null // genre는 나중에 채움
    ])

    return result.insertId
}

// 플레이리스트를 DB에 저장
async function savePlaylist(playlistInfo, category, userId = 1) {
    // 기존 플레이리스트 확인 (external_id로)
    const [existing] = await pool.execute(
        'SELECT playlist_id FROM playlists WHERE external_id = ?',
        [playlistInfo.id]
    )

    if (existing.length > 0) {
        console.log(`  ⏭️  이미 존재: ${playlistInfo.name}`)
        return { playlistId: existing[0].playlist_id, isNew: false }
    }

    // 커버 이미지
    const coverImage = playlistInfo.images?.[0]?.url || null

    // 플레이리스트 삽입
    const [result] = await pool.execute(`
        INSERT INTO playlists (user_id, title, description, space_type, status_flag, source_type, external_id, cover_image)
        VALUES (?, ?, ?, 'EMS', 'PTP', 'Platform', ?, ?)
    `, [
        userId,
        playlistInfo.name,
        playlistInfo.description || `${category} playlist from Spotify`,
        playlistInfo.id,
        coverImage
    ])

    return { playlistId: result.insertId, isNew: true }
}

// 플레이리스트-트랙 매핑 저장
async function savePlaylistTracks(playlistId, trackIds) {
    // 기존 매핑 삭제
    await pool.execute('DELETE FROM playlist_tracks WHERE playlist_id = ?', [playlistId])

    // 새 매핑 삽입
    for (let i = 0; i < trackIds.length; i++) {
        await pool.execute(`
            INSERT INTO playlist_tracks (playlist_id, track_id, order_index)
            VALUES (?, ?, ?)
        `, [playlistId, trackIds[i], i + 1])
    }
}

// 메인 실행
async function main() {
    console.log('🎵 Spotify 플레이리스트 → EMS 가져오기\n')
    console.log('=' .repeat(50))

    const startTime = Date.now()
    let totalPlaylists = 0
    let totalTracks = 0
    let newTracks = 0

    for (const playlist of PLAYLISTS_TO_IMPORT) {
        console.log(`\n📁 [${playlist.category}] 가져오는 중...`)

        // 플레이리스트 정보 가져오기
        const info = await getPlaylistInfo(playlist.id)
        if (!info) {
            console.log(`  ❌ 플레이리스트를 찾을 수 없음: ${playlist.id}`)
            continue
        }

        console.log(`  📋 ${info.name} (${info.tracks?.total || 0}곡)`)

        // 플레이리스트 저장
        const { playlistId, isNew } = await savePlaylist(info, playlist.category)

        if (!isNew) {
            continue // 이미 존재하면 스킵
        }

        totalPlaylists++

        // 트랙 가져오기
        const tracks = await getPlaylistTracks(playlist.id)
        console.log(`  🎵 트랙 ${tracks.length}개 처리 중...`)

        const trackIds = []
        let playlistNewTracks = 0

        for (const track of tracks) {
            try {
                // 기존 트랙 확인
                const [existing] = await pool.execute(
                    'SELECT track_id FROM tracks WHERE spotify_id = ?',
                    [track.id]
                )

                let trackId
                if (existing.length > 0) {
                    trackId = existing[0].track_id
                } else {
                    trackId = await saveTrack(track)
                    playlistNewTracks++
                    newTracks++
                }

                trackIds.push(trackId)
                totalTracks++
            } catch (e) {
                console.error(`  ⚠️ 트랙 저장 실패: ${track.name} - ${e.message}`)
            }
        }

        // 플레이리스트-트랙 매핑 저장
        await savePlaylistTracks(playlistId, trackIds)

        console.log(`  ✅ 완료: ${trackIds.length}곡 (신규 ${playlistNewTracks}곡)`)

        // Rate limit
        await new Promise(r => setTimeout(r, 500))
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)

    console.log('\n' + '=' .repeat(50))
    console.log('🎉 가져오기 완료!')
    console.log(`   - 새 플레이리스트: ${totalPlaylists}개`)
    console.log(`   - 처리된 트랙: ${totalTracks}개`)
    console.log(`   - 신규 트랙: ${newTracks}개`)
    console.log(`   - 소요 시간: ${elapsed}초`)

    // 최종 통계
    const [stats] = await pool.execute(`
        SELECT
            (SELECT COUNT(*) FROM playlists WHERE space_type = 'EMS') as ems_playlists,
            (SELECT COUNT(*) FROM tracks) as total_tracks
    `)

    console.log(`\n📊 현재 DB 상태:`)
    console.log(`   - EMS 플레이리스트: ${stats[0].ems_playlists}개`)
    console.log(`   - 전체 트랙: ${stats[0].total_tracks}개`)

    await pool.end()
}

main().catch(e => {
    console.error('❌ 오류:', e)
    process.exit(1)
})
