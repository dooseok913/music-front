import { query } from './src/config/db.js'

async function checkSchema() {
    try {
        const playlistsCols = await query('SHOW COLUMNS FROM playlists')
        console.log('--- Playlists Table Columns ---')
        playlistsCols.forEach(col => console.log(`${col.Field}: ${col.Type}`))

        const tracksCols = await query('SHOW COLUMNS FROM tracks')
        console.log('\n--- Tracks Table Columns ---')
        tracksCols.forEach(col => console.log(`${col.Field}: ${col.Type}`))
    } catch (error) {
        console.error('Error checking schema:', error.message)
    } finally {
        process.exit()
    }
}

checkSchema()
