/**
 * 개인 플레이리스트 기반 AI 모델 학습
 *
 * 실행: cd server && node train_user_model.js [userId]
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

// 사용자 ID (기본값: 3)
const TARGET_USER_ID = parseInt(process.argv[2]) || 3

async function main() {
    console.log('🧠 개인 플레이리스트 AI 학습 시작\n')
    console.log(`👤 대상 사용자: ${TARGET_USER_ID}`)
    console.log('='.repeat(60))

    const startTime = Date.now()

    // 1. 사용자의 PMS 플레이리스트에서 학습 데이터 수집
    console.log('\n📊 1단계: 학습 데이터 수집')

    const [playlists] = await pool.execute(`
        SELECT playlist_id, title, description
        FROM playlists
        WHERE user_id = ? AND space_type = 'PMS'
    `, [TARGET_USER_ID])

    console.log(`   - PMS 플레이리스트: ${playlists.length}개`)

    // 모든 트랙 수집
    const [tracks] = await pool.execute(`
        SELECT DISTINCT
            t.track_id,
            t.title,
            t.artist,
            t.album,
            t.duration,
            t.genre,
            t.popularity,
            t.explicit,
            t.release_date,
            p.title as playlist_title
        FROM tracks t
        JOIN playlist_tracks pt ON t.track_id = pt.track_id
        JOIN playlists p ON pt.playlist_id = p.playlist_id
        WHERE p.user_id = ? AND p.space_type = 'PMS'
    `, [TARGET_USER_ID])

    console.log(`   - 총 트랙 수: ${tracks.length}개`)

    if (tracks.length === 0) {
        console.log('❌ 학습할 트랙이 없습니다.')
        await pool.end()
        return
    }

    // 2. 특성 추출
    console.log('\n📈 2단계: 특성 추출')

    // 아티스트 빈도
    const artistFreq = {}
    tracks.forEach(t => {
        const artist = t.artist || 'Unknown'
        artistFreq[artist] = (artistFreq[artist] || 0) + 1
    })
    const topArtists = Object.entries(artistFreq)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 30)
        .map(([name, count]) => ({ name, count, weight: count / tracks.length }))

    console.log(`   - 고유 아티스트: ${Object.keys(artistFreq).length}명`)
    console.log(`   - Top 5: ${topArtists.slice(0, 5).map(a => a.name).join(', ')}`)

    // 앨범 빈도
    const albumFreq = {}
    tracks.forEach(t => {
        const album = t.album || 'Unknown'
        albumFreq[album] = (albumFreq[album] || 0) + 1
    })
    const topAlbums = Object.entries(albumFreq)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 20)
        .map(([name, count]) => ({ name, count }))

    console.log(`   - 고유 앨범: ${Object.keys(albumFreq).length}개`)

    // 장르 추론 (플레이리스트 제목/설명에서)
    const genreKeywords = {
        'Jazz': ['jazz', 'jaz', '재즈', 'swing', 'bebop', 'bossa'],
        'K-Pop': ['kpop', 'k-pop', '케이팝', 'korean pop'],
        'R&B': ['r&b', 'rnb', 'soul', '알앤비'],
        'Classical': ['classical', 'classic', '클래식', 'orchestra'],
        'Hip-Hop': ['hip-hop', 'hiphop', 'rap', '힙합'],
        'EDM': ['edm', 'electronic', 'house', 'techno'],
        'Rock': ['rock', 'metal', '락'],
        'Pop': ['pop', '팝'],
        'Acoustic': ['acoustic', '어쿠스틱', 'unplugged'],
        'Blues': ['blues', '블루스']
    }

    const inferredGenres = {}
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
    const topGenres = Object.entries(inferredGenres)
        .sort((a, b) => b[1] - a[1])
        .map(([name, count]) => ({ name, count }))

    console.log(`   - 추론된 장르: ${topGenres.map(g => g.name).join(', ') || 'None'}`)

    // 인기도 분포
    const popularityStats = {
        avg: 0,
        min: 100,
        max: 0,
        distribution: { low: 0, medium: 0, high: 0 }
    }
    let popCount = 0
    tracks.forEach(t => {
        if (t.popularity != null) {
            popCount++
            popularityStats.avg += t.popularity
            popularityStats.min = Math.min(popularityStats.min, t.popularity)
            popularityStats.max = Math.max(popularityStats.max, t.popularity)
            if (t.popularity < 40) popularityStats.distribution.low++
            else if (t.popularity < 70) popularityStats.distribution.medium++
            else popularityStats.distribution.high++
        }
    })
    popularityStats.avg = popCount > 0 ? Math.round(popularityStats.avg / popCount) : 0

    console.log(`   - 평균 인기도: ${popularityStats.avg}`)

    // 재생시간 분포
    const durationStats = {
        avg: 0,
        min: Infinity,
        max: 0,
        short: 0,  // < 3분
        medium: 0, // 3-5분
        long: 0    // > 5분
    }
    let durCount = 0
    tracks.forEach(t => {
        if (t.duration) {
            durCount++
            durationStats.avg += t.duration
            durationStats.min = Math.min(durationStats.min, t.duration)
            durationStats.max = Math.max(durationStats.max, t.duration)
            if (t.duration < 180) durationStats.short++
            else if (t.duration < 300) durationStats.medium++
            else durationStats.long++
        }
    })
    durationStats.avg = durCount > 0 ? Math.round(durationStats.avg / durCount) : 0

    console.log(`   - 평균 재생시간: ${Math.floor(durationStats.avg / 60)}분 ${durationStats.avg % 60}초`)

    // Explicit 비율
    const explicitCount = tracks.filter(t => t.explicit).length
    const explicitRatio = tracks.length > 0 ? explicitCount / tracks.length : 0

    console.log(`   - Explicit 비율: ${(explicitRatio * 100).toFixed(1)}%`)

    // 3. 사용자 프로필 모델 생성
    console.log('\n🎯 3단계: 사용자 프로필 모델 생성')

    const userProfile = {
        userId: TARGET_USER_ID,
        trainedAt: new Date().toISOString(),
        dataStats: {
            totalPlaylists: playlists.length,
            totalTracks: tracks.length,
            uniqueArtists: Object.keys(artistFreq).length,
            uniqueAlbums: Object.keys(albumFreq).length
        },
        preferences: {
            topArtists: topArtists,
            topAlbums: topAlbums,
            inferredGenres: topGenres,
            popularityProfile: popularityStats,
            durationProfile: durationStats,
            explicitTolerance: explicitRatio
        },
        weights: {
            artistMatch: 0.35,      // 아티스트 매칭 가중치
            genreMatch: 0.25,       // 장르 매칭 가중치
            popularityMatch: 0.15,  // 인기도 유사성 가중치
            durationMatch: 0.10,    // 재생시간 유사성 가중치
            albumMatch: 0.15        // 앨범 매칭 가중치
        }
    }

    // 4. 모델 저장
    console.log('\n💾 4단계: 모델 저장')

    // user_profiles 테이블 확인 및 생성
    await pool.execute(`
        CREATE TABLE IF NOT EXISTS user_profiles (
            user_id INT PRIMARY KEY,
            profile_data JSON,
            model_version VARCHAR(20) DEFAULT 'v1.0',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )
    `)

    // 프로필 저장
    await pool.execute(`
        INSERT INTO user_profiles (user_id, profile_data, model_version)
        VALUES (?, ?, 'v1.0')
        ON DUPLICATE KEY UPDATE
            profile_data = VALUES(profile_data),
            model_version = 'v1.0',
            updated_at = CURRENT_TIMESTAMP
    `, [TARGET_USER_ID, JSON.stringify(userProfile)])

    console.log(`   ✅ 사용자 ${TARGET_USER_ID} 프로필 저장 완료`)

    // 5. 학습 결과 요약
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)

    console.log('\n' + '='.repeat(60))
    console.log('🎉 학습 완료!')
    console.log('='.repeat(60))
    console.log('\n📋 학습 결과 요약:')
    console.log(`   - 사용자 ID: ${TARGET_USER_ID}`)
    console.log(`   - 학습 플레이리스트: ${playlists.length}개`)
    console.log(`   - 학습 트랙: ${tracks.length}개`)
    console.log(`   - 학습 시간: ${elapsed}초`)

    console.log('\n🎵 선호 아티스트 TOP 10:')
    topArtists.slice(0, 10).forEach((a, i) => {
        console.log(`   ${i + 1}. ${a.name} (${a.count}곡, ${(a.weight * 100).toFixed(1)}%)`)
    })

    console.log('\n🎸 추론된 장르 선호도:')
    if (topGenres.length > 0) {
        topGenres.forEach(g => {
            console.log(`   - ${g.name}: ${g.count}회 언급`)
        })
    } else {
        console.log('   - (장르 정보 없음)')
    }

    console.log('\n📊 인기도 선호도:')
    console.log(`   - 평균: ${popularityStats.avg}`)
    console.log(`   - 범위: ${popularityStats.min} ~ ${popularityStats.max}`)
    console.log(`   - 분포: 낮음(${popularityStats.distribution.low}) / 중간(${popularityStats.distribution.medium}) / 높음(${popularityStats.distribution.high})`)

    // 6. 테스트: EMS 플레이리스트 평가
    console.log('\n🧪 테스트: EMS 플레이리스트 평가')

    const [emsPlaylists] = await pool.execute(`
        SELECT p.playlist_id, p.title, COUNT(pt.track_id) as track_count
        FROM playlists p
        JOIN playlist_tracks pt ON p.playlist_id = pt.playlist_id
        WHERE p.space_type = 'EMS'
        GROUP BY p.playlist_id
        HAVING track_count > 10
        ORDER BY RAND()
        LIMIT 5
    `)

    for (const ems of emsPlaylists) {
        const score = await evaluatePlaylist(ems.playlist_id, userProfile)
        console.log(`   - ${ems.title.substring(0, 30)}... : ${score.score}점 (${score.grade})`)
    }

    await pool.end()
    console.log('\n✅ 완료!')
}

// 플레이리스트 평가 함수
async function evaluatePlaylist(playlistId, profile) {
    const [tracks] = await pool.execute(`
        SELECT t.artist, t.album, t.popularity, t.duration, t.genre
        FROM tracks t
        JOIN playlist_tracks pt ON t.track_id = pt.track_id
        WHERE pt.playlist_id = ?
    `, [playlistId])

    if (tracks.length === 0) {
        return { score: 0, grade: 'F', reason: 'Empty playlist' }
    }

    let totalScore = 0
    const weights = profile.weights
    const prefs = profile.preferences

    // 1. 아티스트 매칭 점수
    const topArtistNames = prefs.topArtists.map(a => a.name.toLowerCase())
    let artistMatches = 0
    tracks.forEach(t => {
        if (t.artist && topArtistNames.includes(t.artist.toLowerCase())) {
            artistMatches++
        }
    })
    const artistScore = (artistMatches / tracks.length) * 100
    totalScore += artistScore * weights.artistMatch

    // 2. 앨범 매칭 점수
    const topAlbumNames = prefs.topAlbums.map(a => a.name.toLowerCase())
    let albumMatches = 0
    tracks.forEach(t => {
        if (t.album && topAlbumNames.includes(t.album.toLowerCase())) {
            albumMatches++
        }
    })
    const albumScore = (albumMatches / tracks.length) * 100
    totalScore += albumScore * weights.albumMatch

    // 3. 인기도 유사성 점수
    let popDiff = 0
    let popCount = 0
    tracks.forEach(t => {
        if (t.popularity != null) {
            popCount++
            popDiff += Math.abs(t.popularity - prefs.popularityProfile.avg)
        }
    })
    const avgPopDiff = popCount > 0 ? popDiff / popCount : 50
    const popularityScore = Math.max(0, 100 - avgPopDiff * 2)
    totalScore += popularityScore * weights.popularityMatch

    // 4. 재생시간 유사성 점수
    let durDiff = 0
    let durCount = 0
    tracks.forEach(t => {
        if (t.duration) {
            durCount++
            durDiff += Math.abs(t.duration - prefs.durationProfile.avg)
        }
    })
    const avgDurDiff = durCount > 0 ? durDiff / durCount : 60
    const durationScore = Math.max(0, 100 - avgDurDiff / 3)
    totalScore += durationScore * weights.durationMatch

    // 5. 기본 품질 점수 (최소 보장)
    const baseScore = 30
    const finalScore = Math.min(100, Math.max(0, totalScore + baseScore))

    // 등급 결정
    let grade = 'C'
    if (finalScore >= 85) grade = 'S'
    else if (finalScore >= 75) grade = 'A'
    else if (finalScore >= 65) grade = 'B'
    else if (finalScore >= 50) grade = 'C'
    else grade = 'D'

    return {
        score: Math.round(finalScore),
        grade,
        details: {
            artistScore: Math.round(artistScore),
            albumScore: Math.round(albumScore),
            popularityScore: Math.round(popularityScore),
            durationScore: Math.round(durationScore),
            artistMatches,
            albumMatches
        }
    }
}

main().catch(e => {
    console.error('❌ 오류:', e)
    process.exit(1)
})
