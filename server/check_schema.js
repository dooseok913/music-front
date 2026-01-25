import { query } from './src/config/db.js'

async function checkSchema() {
    try {
        const columns = await query('SHOW COLUMNS FROM users')
        console.log('--- Users Table Columns ---')
        columns.forEach(col => {
            console.log(`${col.Field}: ${col.Type}`)
        })
    } catch (error) {
        console.error('Error checking schema:', error.message)
    } finally {
        process.exit()
    }
}

checkSchema()
