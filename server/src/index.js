import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import { testConnection, queryOne, insert } from './config/db.js'
import authRoutes from './routes/auth.js'
import tidalRoutes from './routes/tidal.js'
import playlistRoutes from './routes/playlists.js'
import analysisRoutes from './routes/analysis.js'
import itunesRoutes from './routes/itunes.js'
import youtubeRoutes from './routes/youtube.js'
import trainingRoutes from './routes/training.js'
import emsRoutes from './routes/ems.js'
import pmsRoutes from './routes/pms.js'
import genresRoutes from './routes/genres.js'

dotenv.config()

const app = express()
const PORT = process.env.PORT || 3001

// Seed default user if not exists
async function seedDefaultUser() {
    try {
        const existingUser = await queryOne('SELECT user_id FROM users WHERE user_id = 1')
        if (!existingUser) {
            await insert(
                'INSERT INTO users (user_id, email, password_hash, nickname) VALUES (1, ?, ?, ?)',
                ['default@musicspace.local', 'not_for_login', 'Default User']
            )
            console.log('✅ Default user created (user_id=1)')
        }
    } catch (error) {
        console.error('⚠️ Could not seed default user:', error.message)
    }
}

// Initialize database
async function initDatabase() {
    const connected = await testConnection()
    if (connected) {
        await seedDefaultUser()
    }
}

initDatabase()

// Middleware
app.use(cors({
    origin: ['http://localhost:5173', 'http://localhost:5610', 'http://host.docker.internal:5173'],
    credentials: true
}))
app.use(express.json())

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// Routes
app.use('/api/auth', authRoutes)
app.use('/api/tidal', tidalRoutes)
app.use('/api/playlists', playlistRoutes)
app.use('/api/analysis', analysisRoutes)
app.use('/api/itunes', itunesRoutes)
app.use('/api/youtube', youtubeRoutes)
app.use('/api/training', trainingRoutes)
app.use('/api/ems', emsRoutes)
app.use('/api/pms', pmsRoutes)
app.use('/api/genres', genresRoutes)

// Error handling
app.use((err, req, res, next) => {
    console.error('Error:', err.message)
    res.status(500).json({ error: err.message })
})

app.listen(PORT, () => {
    console.log(`🚀 MusicSpace Backend running on http://localhost:${PORT}`)
    console.log(`📡 API Health: http://localhost:${PORT}/api/health`)
})
