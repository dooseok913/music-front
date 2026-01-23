import { get, post, patch, del } from './index'

// Types
// Types matching Backend Response
export interface Playlist {
    id: number
    title: string
    description?: string
    spaceType: 'EMS' | 'GMS' | 'PMS'
    status: 'PTP' | 'PRP' | 'PFP'
    sourceType: 'Platform' | 'Upload' | 'System'
    externalId?: string
    coverImage?: string
    createdAt: string
    updatedAt: string
    trackCount: number
    aiScore?: number
}

export interface Track {
    id: number
    title: string
    artist: string
    album: string
    duration: number // in seconds
    isrc?: string
    orderIndex: number
}

export interface PlaylistWithTracks extends Playlist {
    tracks: Track[]
}

export interface PlaylistsResponse {
    playlists: Playlist[]
    total: number
}

export interface ImportTidalRequest {
    playlists: {
        uuid?: string
        id?: string
        title?: string
        name?: string
        numberOfTracks?: number
        trackCount?: number
        squareImage?: string
    }[]
}

// Playlists API Service
export const playlistsApi = {
    // Get all playlists with optional filters
    getAll: (filters?: { spaceType?: string; status?: string; source?: string }) => {
        const params = new URLSearchParams()
        if (filters?.spaceType) params.append('spaceType', filters.spaceType)
        if (filters?.status) params.append('status', filters.status)
        if (filters?.source) params.append('source', filters.source)

        const query = params.toString()
        return get<PlaylistsResponse>(`/playlists${query ? `?${query}` : ''}`)
    },

    // Get single playlist
    getById: (id: number) => get<Playlist>(`/playlists/${id}`),

    // Create playlist
    create: (data: Partial<Playlist>) => post<Playlist>('/playlists', data),

    // Import from Tidal (Single Playlist)
    importPlaylist: (data: {
        platformPlaylistId: string;
        title: string;
        description?: string;
        coverImage?: string;
        platform?: string;
    }) => post<{ message: string; playlist: Playlist }>('/playlists/import', data),

    // Update status
    updateStatus: (id: number, status: Playlist['status']) =>
        patch<Playlist>(`/playlists/${id}/status`, { status }),

    // Move to different space (EMS -> GMS -> PMS)
    moveToSpace: (id: number, spaceType: Playlist['spaceType']) =>
        patch<Playlist>(`/playlists/${id}/move`, { spaceType }),

    // Delete playlist
    delete: (id: number) => del<{ message: string; playlist: Playlist }>(`/playlists/${id}`),

    // Aliases for component compatibility
    getPlaylists: (spaceType?: string) => playlistsApi.getAll({ spaceType }),
    deletePlaylist: (id: number) => playlistsApi.delete(id),
    movePlaylist: (id: number, spaceType: Playlist['spaceType']) => playlistsApi.moveToSpace(id, spaceType),

    // Tracks
    addTrack: (playlistId: number, track: any) => post<{ message: string; trackId: number }>(`/playlists/${playlistId}/tracks`, { track }),
    removeTrack: (playlistId: number, trackId: number) => del<{ message: string }>(`/playlists/${playlistId}/tracks/${trackId}`),

    // Import Album as Playlist (Backend handles tracks in batch)
    importAlbumAsPlaylist: (album: { title: string; artist: string; tracks: any[]; coverImage: string }) =>
        post<{ message: string; playlist: Playlist; count: number }>('/playlists/import-album', album)
}

export const analysisApi = {
    train: () => post<{ status: string; profile: any }>('/analysis/train', {}),
    evaluate: (playlistId: number) => post<{ score: number; grade: string; reason: string }>(`/analysis/evaluate/${playlistId}`, {})
}
