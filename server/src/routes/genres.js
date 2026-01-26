import express from 'express'
import { query } from '../config/db.js'

const router = express.Router()

// 카테고리별로 그룹핑된 장르 목록 조회
router.get('/', async (req, res) => {
    try {
        // 카테고리 조회
        const categories = await query(`
            SELECT 
                category_id as id,
                category_code as code,
                category_name_ko as nameKo,
                category_name_en as nameEn,
                category_icon as icon,
                display_order as displayOrder
            FROM genre_categories 
            WHERE is_active = 1 
            ORDER BY display_order
        `)

        // 장르 조회
        const genres = await query(`
            SELECT 
                g.genre_id as id,
                g.category_id as categoryId,
                g.genre_code as code,
                g.genre_name_ko as nameKo,
                g.genre_name_en as nameEn,
                g.genre_icon as icon,
                g.genre_color as color,
                g.display_order as displayOrder
            FROM music_genres g
            WHERE g.is_active = 1
            ORDER BY g.display_order
        `)

        // 카테고리별로 그룹핑
        const groupedGenres = categories.map(category => ({
            ...category,
            genres: genres.filter(g => g.categoryId === category.id)
        }))

        res.json({
            success: true,
            categories: groupedGenres,
            // 플랫 리스트도 함께 제공 (필요시 사용)
            genres: genres
        })
    } catch (error) {
        console.error('Get genres error:', error)
        res.status(500).json({ error: '장르 목록을 불러오는데 실패했습니다' })
    }
})

// 단일 장르 목록 조회 (플랫 리스트)
router.get('/flat', async (req, res) => {
    try {
        const genres = await query(`
            SELECT 
                g.genre_id as id,
                g.genre_code as code,
                g.genre_name_ko as nameKo,
                g.genre_name_en as nameEn,
                g.genre_icon as icon,
                g.genre_color as color,
                c.category_name_ko as categoryNameKo
            FROM music_genres g
            LEFT JOIN genre_categories c ON g.category_id = c.category_id
            WHERE g.is_active = 1
            ORDER BY g.display_order
        `)

        res.json({ success: true, genres })
    } catch (error) {
        console.error('Get flat genres error:', error)
        res.status(500).json({ error: '장르 목록을 불러오는데 실패했습니다' })
    }
})

// 사용자의 선호 장르 조회
router.get('/user/:userId', async (req, res) => {
    try {
        const { userId } = req.params

        const userGenres = await query(`
            SELECT 
                g.genre_code as code,
                g.genre_name_ko as nameKo,
                g.genre_name_en as nameEn,
                g.genre_icon as icon,
                ug.preference_level as preferenceLevel
            FROM user_genres ug
            JOIN music_genres g ON ug.genre_id = g.genre_id
            WHERE ug.user_id = ?
            ORDER BY ug.preference_level DESC, g.display_order
        `, [userId])

        res.json({ success: true, genres: userGenres })
    } catch (error) {
        console.error('Get user genres error:', error)
        res.status(500).json({ error: '사용자 장르를 불러오는데 실패했습니다' })
    }
})

export default router
