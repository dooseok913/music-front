import { query } from './src/config/db.js'
import fs from 'fs'

async function exportSchema() {
    try {
        let output = ''
        const tables = ['users', 'playlists', 'tracks', 'playlist_tracks']

        for (const table of tables) {
            const result = await query(`SHOW CREATE TABLE ${table}`)
            output += `--- ${table} ---\n${result[0]['Create Table']}\n\n`
        }

        fs.writeFileSync('schema_definitions.txt', output)
        console.log('✅ Schema definitions exported to schema_definitions.txt')
    } catch (error) {
        console.error('Error exporting schema:', error.message)
    } finally {
        process.exit()
    }
}

exportSchema()
