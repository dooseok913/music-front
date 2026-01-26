import express from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { query, queryOne, insert } from '../config/db.js'
import { fetchTidalPlaylists, fetchTidalPlaylistTracks } from './tidal.js'

const router = express.Router()

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production'
const JWT_EXPIRES_IN = '7d'

// Register
router.post('/register', async (req, res) => {
    try {
        const { name, email, password, streamingServices, genres } = req.body

        // Validation
        if (!name || !email || !password) {
            return res.status(400).json({ error: '모든 필드를 입력해주세요' })
        }

        if (password.length < 6) {
            return res.status(400).json({ error: '비밀번호는 최소 6자 이상이어야 합니다' })
        }

        // 장르 최소 1개 선택 확인
        if (!genres || genres.length === 0) {
            return res.status(400).json({ error: '최소 1개 이상의 음악 장르를 선택해주세요' })
        }

        // Check if email already exists
        const existingUser = await queryOne('SELECT user_id FROM users WHERE email = ?', [email])
        if (existingUser) {
            return res.status(400).json({ error: '이미 등록된 이메일입니다' })
        }

        // Hash password
        const salt = await bcrypt.genSalt(10)
        const passwordHash = await bcrypt.hash(password, salt)

        // Convert streaming services to JSON string
        const streamingServicesJson = streamingServices ? JSON.stringify(streamingServices) : '[]'

        // Insert user
        const userId = await insert(
            'INSERT INTO users (email, password_hash, nickname, streaming_services) VALUES (?, ?, ?, ?)',
            [email, passwordHash, name, streamingServicesJson]
        )

        // 사용자 선호 장르 저장
        if (genres && genres.length > 0) {
            for (const genreCode of genres) {
                try {
                    // 장르 ID 조회
                    const genre = await queryOne(
                        'SELECT genre_id FROM music_genres WHERE genre_code = ?',
                        [genreCode]
                    )
                    if (genre) {
                        await insert(
                            'INSERT INTO user_genres (user_id, genre_id, preference_level) VALUES (?, ?, 1)',
                            [userId, genre.genre_id]
                        )
                    }
                } catch (genreError) {
                    console.error(`Genre insert error for ${genreCode}:`, genreError.message)
                    // 장르 저장 실패해도 회원가입은 계속 진행
                }
            }
        }

        // Generate JWT
        const tokenToken = jwt.sign({ userId, email }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN })

        res.status(201).json({
            message: '회원가입이 완료되었습니다',
            user: {
                id: userId,
                email,
                name,
                streamingServices: streamingServices || [],
                genres: genres || []
            },
            token: tokenToken
        })
    } catch (error) {
        console.error('Register error:', error)
        res.status(500).json({ error: '서버 오류가 발생했습니다' })
    }
})

// Sync Tidal (Post-registration)
router.post('/sync/tidal', async (req, res) => {
    try {
        const { tidalAuthData } = req.body
        const authHeader = req.headers.authorization

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: '인증이 필요합니다' })
        }

        const jwtToken = authHeader.split(' ')[1]
        const decoded = jwt.verify(jwtToken, JWT_SECRET)
        const userId = decoded.userId

        if (!tidalAuthData || !tidalAuthData.access_token) {
            return res.status(400).json({ error: 'Tidal 인증 데이터가 필요합니다' })
        }

        const token = tidalAuthData.access_token
        const providedUserId = tidalAuthData.user?.userId || tidalAuthData.user?.id
        const playlists = await fetchTidalPlaylists(token, providedUserId)
        console.log(`[Sync] Found ${playlists.length} playlists for user ${userId}`)

        let syncedCount = 0
        for (const p of playlists) {
            try {
                const playlistId = await insert(`
                    INSERT INTO playlists (user_id, title, description, space_type, status_flag, source_type, external_id, cover_image)
                    VALUES (?, ?, ?, 'PMS', 'PRP', 'Platform', ?, ?)
                `, [userId, p.title, p.description || 'Tidal Playlist', p.uuid, p.squareImage || null])

                // Use virtual tracks if available (for favorites), otherwise fetch from API
                const tracks = p._virtualTracks || await fetchTidalPlaylistTracks(token, p.uuid)
                for (let i = 0; i < tracks.length; i++) {
                    const item = tracks[i]?.item || tracks[i] // Handle both direct track and playlist item wrapper
                    if (!item || (!item.title && !item.name)) continue

                    try {
                        const trackId = await insert(`
                            INSERT INTO tracks (title, artist, album, duration, external_metadata)
                            VALUES (?, ?, ?, ?, ?)
                        `, [
                            item.title || item.name,
                            item.artist?.name || item.artists?.[0]?.name || 'Unknown',
                            item.album?.title || 'Unknown',
                            item.duration || 0,
                            JSON.stringify({ tidalId: item.id, isrc: item.isrc })
                        ])

                        await insert(`
                            INSERT INTO playlist_tracks (playlist_id, track_id, order_index)
                            VALUES (?, ?, ?)
                        `, [playlistId, trackId, i])
                    } catch (err) {
                        console.error(`[Sync] Track insert failed: ${err.message}`)
                    }
                }
                syncedCount++
            } catch (err) {
                console.error(`[Sync] Playlist insert failed: ${err.message}`)
            }
        }

        res.json({ success: true, syncedCount })
    } catch (error) {
        console.error('Tidal Sync Error:', error)
        res.status(500).json({ error: `동기화 중 오류가 발생했습니다: ${error.message}` })
    }
})

// Login
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body

        // Validation
        if (!email || !password) {
            return res.status(400).json({ error: '이메일과 비밀번호를 입력해주세요' })
        }

        // Find user
        const user = await queryOne('SELECT user_id, email, password_hash, nickname FROM users WHERE email = ?', [email])
        if (!user) {
            return res.status(401).json({ error: '이메일 또는 비밀번호가 올바르지 않습니다' })
        }

        // Check password
        const isMatch = await bcrypt.compare(password, user.password_hash)
        if (!isMatch) {
            return res.status(401).json({ error: '이메일 또는 비밀번호가 올바르지 않습니다' })
        }

        // Generate JWT
        const token = jwt.sign({ userId: user.user_id, email: user.email }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN })

        res.json({
            message: '로그인 성공',
            user: {
                id: user.user_id,
                email: user.email,
                name: user.nickname
            },
            token
        })
    } catch (error) {
        console.error('Login error:', error)
        res.status(500).json({ error: '서버 오류가 발생했습니다' })
    }
})

// Get current user (protected route)
router.get('/me', async (req, res) => {
    try {
        const authHeader = req.headers.authorization
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: '인증이 필요합니다' })
        }

        const token = authHeader.split(' ')[1]
        const decoded = jwt.verify(token, JWT_SECRET)

        const user = await queryOne('SELECT user_id, email, nickname FROM users WHERE user_id = ?', [decoded.userId])
        if (!user) {
            return res.status(404).json({ error: '사용자를 찾을 수 없습니다' })
        }

        res.json({
            user: {
                id: user.user_id,
                email: user.email,
                name: user.nickname
            }
        })
    } catch (error) {
        if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
            return res.status(401).json({ error: '유효하지 않은 토큰입니다' })
        }
        console.error('Get me error:', error)
        res.status(500).json({ error: '서버 오류가 발생했습니다' })
    }
})

export default router
