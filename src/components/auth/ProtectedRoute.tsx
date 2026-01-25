import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'

interface ProtectedRouteProps {
    children: React.ReactNode
}

const ProtectedRoute = ({ children }: ProtectedRouteProps) => {
    const { isAuthenticated, isLoading } = useAuth()
    const location = useLocation()

    // Show loading while checking auth state
    if (isLoading) {
        return (
            <div className="min-h-screen bg-hud-bg-primary flex items-center justify-center">
                <div className="animate-spin w-8 h-8 border-2 border-hud-accent-primary border-t-transparent rounded-full" />
            </div>
        )
    }

    if (!isAuthenticated) {
        // Redirect to login with return URL
        return <Navigate to="/login" state={{ from: location }} replace />
    }

    return <>{children}</>
}

export default ProtectedRoute
