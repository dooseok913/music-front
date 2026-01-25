import { query } from './src/config/db.js'

async function updateSchema() {
    try {
        console.log('--- Updating Users Table Schema ---')
        await query('ALTER TABLE users ADD COLUMN streaming_services JSON NULL AFTER nickname')
        console.log('✅ Column streaming_services added successfully')
    } catch (error) {
        console.error('Error updating schema:', error.message)
    } finally {
        process.exit()
    }
}

updateSchema()
