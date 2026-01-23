import React, { createContext, useContext, useState, ReactNode } from 'react'
import { Track } from '../services/api/playlists'

interface MusicContextType {
    currentTrack: Track | null
    isPlaying: boolean
    queue: Track[]
    playTrack: (track: Track) => void
    togglePlay: () => void
    setQueue: (tracks: Track[]) => void
    playPlaylist: (tracks: Track[], startIndex?: number) => void
}

const MusicContext = createContext<MusicContextType | undefined>(undefined)

export const MusicProvider = ({ children }: { children: ReactNode }) => {
    const [currentTrack, setCurrentTrack] = useState<Track | null>(null)
    const [isPlaying, setIsPlaying] = useState(false)
    const [queue, setQueueState] = useState<Track[]>([])

    const playTrack = (track: Track) => {
        setCurrentTrack(track)
        setIsPlaying(true)
    }

    const togglePlay = () => {
        if (currentTrack) {
            setIsPlaying((prev) => !prev)
        }
    }

    const setQueue = (tracks: Track[]) => {
        setQueueState(tracks)
    }

    const playPlaylist = (tracks: Track[], startIndex = 0) => {
        setQueue(tracks)
        if (tracks.length > startIndex) {
            playTrack(tracks[startIndex])
        }
    }

    return (
        <MusicContext.Provider
            value={{
                currentTrack,
                isPlaying,
                queue,
                playTrack,
                togglePlay,
                setQueue,
                playPlaylist
            }}
        >
            {children}
        </MusicContext.Provider>
    )
}

export const useMusic = () => {
    const context = useContext(MusicContext)
    if (context === undefined) {
        throw new Error('useMusic must be used within a MusicProvider')
    }
    return context
}
