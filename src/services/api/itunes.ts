import { get } from './index';

export interface ItunesTrack {
    id: number;
    title: string;
    artist: string;
    album: string;
    artwork: string;
    audio: string;
    url: string;
    date: string;
}

export interface ItunesCollection {
    id: number;
    title: string;
    artist: string;
    artwork: string;
    count: number;
    genre: string;
    date: string;
}

export const itunesService = {
    search: async (term: string) => {
        const response = await get<{ results: ItunesTrack[] }>(`/itunes/search?term=${term}`);
        return response.results;
    },

    getRecommendations: async (genre?: string) => {
        const query = genre ? `?genre=${encodeURIComponent(genre)}` : '';
        const response = await get<{ recommendations: ItunesCollection[] }>(`/itunes/recommendations${query}`);
        return response.recommendations;
    },

    getAlbum: async (id: number) => {
        return get<{ id: number; title: string; artist: string; tracks: ItunesTrack[] }>(`/itunes/album/${id}`);
    }
};
