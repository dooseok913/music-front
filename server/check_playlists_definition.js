import { query } from './src/config/db.js'

async function checkSchema() {
    try {
        const result = await query("SHOW CREATE TABLE playlists")
        console.log('--- Playlists Table Definition ---')
        console.log(result[0]['Create Table'])
    } catch (error) {
        console.error('Error checking schema:', error.message)
    } finally {
        process.exit()
    }
}

checkSchema()
