import { get, post } from './index'

export interface BestPlaylist {
    id: number
    title: string
    description?: string
    coverImage?: string
    spaceType: string
    viewCount: number
    playCount: number
    trackCount: number
}

export interface BestTrack {
    id: number
    title: string
    artist: string
    album?: string
    duration?: number
    externalMetadata?: {
        artwork?: string
        youtubeId?: string
        previewUrl?: string
    }
    viewCount: number
    playCount: number
}

export interface BestArtist {
    name: string
    image?: string
    viewCount: number
    playCount: number
    likeCount: number
}

export interface BestAlbum {
    title: string
    artist: string
    coverImage?: string
    playCount: number
    viewCount: number
    trackCount: number
}

export interface HomeStats {
    totalPlaylists: number
    totalTracks: number
    aiPending: number
    likes: number
}

export const statsApi = {
    // 홈 통계 (실 데이터)
    getHomeStats: () =>
        get<HomeStats>('/stats/home'),

    // 조회수 기록
    recordView: (contentType: 'playlist' | 'track' | 'album' | 'artist', contentId?: number, artistName?: string) =>
        post<{ success: boolean }>('/stats/view', { contentType, contentId, artistName }),

    // 재생수 기록
    recordPlay: (contentType: 'playlist' | 'track' | 'album' | 'artist', contentId?: number, artistName?: string) =>
        post<{ success: boolean }>('/stats/play', { contentType, contentId, artistName }),

    // 좋아요 토글
    toggleLike: (contentType: 'playlist' | 'track' | 'album' | 'artist', isLiked: boolean, contentId?: number, artistName?: string) =>
        post<{ success: boolean }>('/stats/like', { contentType, contentId, artistName, isLiked }),

    // 베스트 플레이리스트
    getBestPlaylists: (limit = 5, sortBy: 'play_count' | 'view_count' = 'play_count') =>
        get<{ playlists: BestPlaylist[] }>(`/stats/best/playlists?limit=${limit}&sortBy=${sortBy}`),

    // 베스트 트랙
    getBestTracks: (limit = 10, sortBy: 'play_count' | 'view_count' = 'play_count') =>
        get<{ tracks: BestTrack[] }>(`/stats/best/tracks?limit=${limit}&sortBy=${sortBy}`),

    // 베스트 아티스트
    getBestArtists: (limit = 5, sortBy: 'play_count' | 'view_count' = 'play_count') =>
        get<{ artists: BestArtist[] }>(`/stats/best/artists?limit=${limit}&sortBy=${sortBy}`),

    // 베스트 앨범
    getBestAlbums: (limit = 5) =>
        get<{ albums: BestAlbum[] }>(`/stats/best/albums?limit=${limit}`)
}
