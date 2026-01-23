import { get } from './index'

export interface YoutubePlaylist {
    id: string
    title: string
    description: string
    thumbnail: string
    channelTitle: string
    itemCount?: number
    publishedAt: string
}

export interface YoutubeTrack {
    id: string
    title: string
    channelTitle: string
    thumbnail: string
    duration: number
    position: number
}

export interface YoutubeProfile {
    name: string
    email: string
}

export interface YoutubeAuthStatus {
    authenticated: boolean
    message?: string
    error?: string
}

export interface YoutubePlaylistItemsResponse {
    items: YoutubeTrack[]
    nextPageToken: string | null
    totalResults: number
}

export const youtubeApi = {
    // Check if YouTube API is connected (API key valid)
    getAuthStatus: () => get<YoutubeAuthStatus>('/youtube/status'),

    // Search for playlists by query
    searchPlaylists: (query: string, maxResults = 10) =>
        get<{ playlists: YoutubePlaylist[] }>(
            `/youtube/search?q=${encodeURIComponent(query)}&maxResults=${maxResults}`
        ),

    // Get featured/trending playlists (for auto-discovery)
    getPlaylists: (maxResults = 10) =>
        get<{ playlists: YoutubePlaylist[] }>(`/youtube/playlists?maxResults=${maxResults}`),

    // Get playlist details by ID
    getPlaylist: (id: string) =>
        get<YoutubePlaylist>(`/youtube/playlist/${id}`),

    // Get playlist items (tracks/videos)
    getPlaylistItems: (id: string, pageToken?: string) =>
        get<YoutubePlaylistItemsResponse>(
            `/youtube/playlist/${id}/items${pageToken ? `?pageToken=${pageToken}` : ''}`
        )
}
