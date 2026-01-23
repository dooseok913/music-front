import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import { testConnection } from './config/db.js'
import tidalRoutes from './routes/tidal.js'
import playlistRoutes from './routes/playlists.js'

dotenv.config()

const app = express()
const PORT = process.env.PORT || 3001

// Test database connection
testConnection()

// Middleware
app.use(cors({
    origin: ['http://localhost:5173', 'http://localhost:5610'],
    credentials: true
}))
app.use(express.json())

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// Routes
app.use('/api/tidal', tidalRoutes)
app.use('/api/playlists', playlistRoutes)

// Error handling
app.use((err, req, res, next) => {
    console.error('Error:', err.message)
    res.status(500).json({ error: err.message })
})

app.listen(PORT, () => {
    console.log(`🚀 MusicSpace Backend running on http://localhost:${PORT}`)
    console.log(`📡 API Health: http://localhost:${PORT}/api/health`)
})
