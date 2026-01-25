import jwt from 'jsonwebtoken'

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production'

export function authMiddleware(req, res, next) {
    try {
        const authHeader = req.headers.authorization
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: '인증이 필요합니다' })
        }

        const token = authHeader.split(' ')[1]
        const decoded = jwt.verify(token, JWT_SECRET)

        req.user = {
            userId: decoded.userId,
            email: decoded.email
        }

        next()
    } catch (error) {
        if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
            return res.status(401).json({ error: '유효하지 않은 토큰입니다' })
        }
        return res.status(500).json({ error: '서버 오류가 발생했습니다' })
    }
}

export function optionalAuth(req, res, next) {
    try {
        const authHeader = req.headers.authorization
        if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.split(' ')[1]
            const decoded = jwt.verify(token, JWT_SECRET)
            req.user = {
                userId: decoded.userId,
                email: decoded.email
            }
        }
        next()
    } catch (error) {
        // Token invalid, but continue without auth
        next()
    }
}
