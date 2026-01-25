import { query } from './src/config/db.js'

async function checkSchema() {
    try {
        const playlists = await query("SHOW CREATE TABLE playlists")
        console.log('--- Playlists Definition ---')
        console.log(playlists[0]['Create Table'])

        const tracks = await query("SHOW CREATE TABLE tracks")
        console.log('\n--- Tracks Definition ---')
        console.log(tracks[0]['Create Table'])

        const pt = await query("SHOW CREATE TABLE playlist_tracks")
        console.log('\n--- Playlist Tracks Definition ---')
        console.log(pt[0]['Create Table'])
    } catch (error) {
        console.error('Error checking schema:', error.message)
    } finally {
        process.exit()
    }
}

checkSchema()
