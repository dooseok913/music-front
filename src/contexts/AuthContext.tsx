import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { User, getStoredUser, getToken, logout as apiLogout, getCurrentUser } from '../services/api/auth'

interface AuthContextType {
    user: User | null
    isLoading: boolean
    isAuthenticated: boolean
    setUser: (user: User | null) => void
    logout: () => void
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null)
    const [isLoading, setIsLoading] = useState(true)

    useEffect(() => {
        // Check for existing session on mount
        const initAuth = async () => {
            const token = getToken()
            if (token) {
                try {
                    const { user } = await getCurrentUser()
                    setUser(user)
                } catch {
                    // Token invalid, clear it
                    apiLogout()
                }
            } else {
                // Try to get stored user
                const storedUser = getStoredUser()
                if (storedUser) {
                    setUser(storedUser)
                }
            }
            setIsLoading(false)
        }

        initAuth()
    }, [])

    const logout = () => {
        apiLogout()
        setUser(null)
    }

    return (
        <AuthContext.Provider value={{
            user,
            isLoading,
            isAuthenticated: !!user,
            setUser,
            logout
        }}>
            {children}
        </AuthContext.Provider>
    )
}

export function useAuth() {
    const context = useContext(AuthContext)
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider')
    }
    return context
}
