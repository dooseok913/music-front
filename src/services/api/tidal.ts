import { get, post } from './index'

// Types
export interface TidalPlaylist {
    uuid: string
    title: string
    numberOfTracks: number
    squareImage?: string
    description?: string
    creator?: {
        name: string
    }
}

export interface TidalSearchResponse {
    playlists?: TidalPlaylist[]
}

export interface TidalFeaturedResponse {
    featured: {
        genre: string
        playlists: TidalPlaylist[]
    }[]
}

export interface TidalAuthStatus {
    authenticated: boolean
    userConnected?: boolean
    expiresAt?: number
    error?: string
}

// Tidal API Service
export const tidalApi = {
    // Check authentication status
    getAuthStatus: () => get<TidalAuthStatus>('/tidal/auth/status'),

    // Search playlists
    searchPlaylists: (query: string = 'K-POP', limit: number = 10) =>
        get<TidalSearchResponse>(`/tidal/search/playlists?query=${encodeURIComponent(query)}&limit=${limit}`),

    // Get featured playlists by genre
    getFeatured: () => get<TidalFeaturedResponse>('/tidal/featured'),

    // Get playlist details
    getPlaylist: (id: string) => get<TidalPlaylist>(`/tidal/playlists/${id}`),

    // Get playlist tracks
    getPlaylistTracks: (id: string, limit: number = 50) =>
        get(`/tidal/playlists/${id}/items?limit=${limit}`),

    // Alias for getPlaylistTracks
    getPlaylistItems: (id: string, limit: number = 50) =>
        get(`/tidal/playlists/${id}/items?limit=${limit}`),

    // --- Device Auth Flow ---
    initDeviceAuth: () => post<any>('/tidal/auth/device', {}),

    pollToken: (deviceCode: string) => post<any>('/tidal/auth/token', { deviceCode }),

    // --- Web Auth Flow ---
    exchangeCode: (code: string) => post<any>('/tidal/auth/exchange', { code })
}
