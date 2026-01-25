import mysql from 'mysql2/promise'
import dotenv from 'dotenv'

dotenv.config()

// Create connection pool
const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'music_space_db',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0
})

// Test connection
export async function testConnection() {
    try {
        const connection = await pool.getConnection()
        console.log('✅ Database connected successfully')
        connection.release()
        return true
    } catch (error) {
        console.error('❌ Database connection failed:', error.message)
        return false
    }
}

// Query helper
export async function query(sql, params = []) {
    const [rows] = await pool.execute(sql, params)
    return rows
}

// Get single row
export async function queryOne(sql, params = []) {
    const rows = await query(sql, params)
    return rows[0] || null
}

// Insert and get ID
export async function insert(sql, params = []) {
    const [result] = await pool.execute(sql, params)
    return result.insertId
}

// Update/Delete and get affected rows
export async function execute(sql, params = []) {
    const [result] = await pool.execute(sql, params)
    return result.affectedRows
}

export default pool
