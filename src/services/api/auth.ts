import { post, API_BASE_URL } from './index'

export interface User {
    id: number
    email: string
    name: string
}

export interface AuthResponse {
    message: string
    user: User
    token: string
}

export interface LoginRequest {
    email: string
    password: string
}

export interface RegisterRequest {
    name: string
    email: string
    password: string
    streamingServices?: string[]
}

// Token management
const TOKEN_KEY = 'auth_token'
const USER_KEY = 'auth_user'

export function getToken(): string | null {
    return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token: string): void {
    localStorage.setItem(TOKEN_KEY, token)
}

export function removeToken(): void {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
}

export function getStoredUser(): User | null {
    const userStr = localStorage.getItem(USER_KEY)
    if (!userStr) return null
    try {
        return JSON.parse(userStr)
    } catch {
        return null
    }
}

export function setStoredUser(user: User): void {
    localStorage.setItem(USER_KEY, JSON.stringify(user))
}

// API calls
export async function login(data: LoginRequest): Promise<AuthResponse> {
    const response = await post<AuthResponse>('/auth/login', data)
    setToken(response.token)
    setStoredUser(response.user)
    return response
}

export async function register(data: RegisterRequest): Promise<AuthResponse> {
    const response = await post<AuthResponse>('/auth/register', data)
    setToken(response.token)
    setStoredUser(response.user)
    return response
}

export async function getCurrentUser(): Promise<{ user: User }> {
    const token = getToken()
    if (!token) {
        throw new Error('No token')
    }

    const response = await fetch(`${API_BASE_URL}/auth/me`, {
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        }
    })

    if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Unknown error' }))
        throw new Error(error.error || 'Failed to get user')
    }

    return response.json()
}

export function logout(): void {
    removeToken()
}

export function isAuthenticated(): boolean {
    return !!getToken()
}
