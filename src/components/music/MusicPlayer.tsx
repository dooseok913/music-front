import { Play, SkipBack, SkipForward, Shuffle, Repeat, Volume2, List, Music, Pause } from 'lucide-react'
import { useState } from 'react'
import { useMusic } from '../../context/MusicContext'

const MusicPlayer = () => {
    const { currentTrack, isPlaying, togglePlay } = useMusic()
    const [progress, setProgress] = useState(35)
    const [volume, setVolume] = useState(70)

    const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
        const rect = e.currentTarget.getBoundingClientRect()
        const percent = ((e.clientX - rect.left) / rect.width) * 100
        setProgress(percent)
    }

    const handleVolumeClick = (e: React.MouseEvent<HTMLDivElement>) => {
        const rect = e.currentTarget.getBoundingClientRect()
        const percent = ((e.clientX - rect.left) / rect.width) * 100
        setVolume(percent)
    }

    if (!currentTrack) {
        return null
    }

    return (
        <div className="fixed bottom-0 left-64 right-0 h-20 bg-hud-bg-secondary/80 backdrop-blur-md border-t border-hud-border-secondary z-40 px-6 flex items-center gap-6 animate-in slide-in-from-bottom duration-300">
            {/* Track Info */}
            <div className="flex items-center gap-4 min-w-[200px]">
                <div className="w-12 h-12 bg-gradient-to-br from-hud-accent-primary to-hud-accent-info rounded-lg flex items-center justify-center text-white/50">
                    <Music className="w-5 h-5" />
                </div>
                <div>
                    <h4 className="text-sm font-semibold text-hud-text-primary">{currentTrack.title}</h4>
                    <p className="text-xs text-hud-text-muted">{currentTrack.artist}</p>
                </div>
            </div>

            {/* Player Controls */}
            <div className="flex-1 flex flex-col gap-2 max-w-xl mx-auto">
                <div className="flex items-center justify-center gap-4">
                    <button className="w-8 h-8 rounded-full flex items-center justify-center text-hud-text-muted hover:text-hud-accent-primary transition-colors">
                        <Shuffle className="w-4 h-4" />
                    </button>
                    <button className="w-8 h-8 rounded-full flex items-center justify-center text-hud-text-secondary hover:text-hud-accent-primary transition-colors">
                        <SkipBack className="w-4 h-4" />
                    </button>
                    <button
                        onClick={togglePlay}
                        className="w-10 h-10 bg-hud-accent-primary rounded-full flex items-center justify-center text-hud-bg-primary hover:bg-hud-accent-primary/90 transition-all"
                    >
                        {isPlaying ? (
                            <Pause className="w-4 h-4" fill="currentColor" />
                        ) : (
                            <Play className="w-4 h-4 ml-0.5" fill="currentColor" />
                        )}
                    </button>
                    <button className="w-8 h-8 rounded-full flex items-center justify-center text-hud-text-secondary hover:text-hud-accent-primary transition-colors">
                        <SkipForward className="w-4 h-4" />
                    </button>
                    <button className="w-8 h-8 rounded-full flex items-center justify-center text-hud-text-muted hover:text-hud-accent-primary transition-colors">
                        <Repeat className="w-4 h-4" />
                    </button>
                </div>

                {/* Progress Bar */}
                <div className="flex items-center gap-3">
                    <span className="text-xs text-hud-text-muted w-10 text-right">1:23</span>
                    <div
                        className="flex-1 h-1 bg-hud-border-secondary rounded-full cursor-pointer group"
                        onClick={handleProgressClick}
                    >
                        <div
                            className="h-full bg-hud-accent-primary rounded-full relative"
                            style={{ width: `${progress}%` }}
                        >
                            <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-hud-accent-primary rounded-full opacity-0 group-hover:opacity-100 transition-opacity"></div>
                        </div>
                    </div>
                    <span className="text-xs text-hud-text-muted w-10">3:45</span>
                </div>
            </div>

            {/* Volume */}
            <div className="flex items-center gap-3 min-w-[150px]">
                <button className="w-8 h-8 rounded-full flex items-center justify-center text-hud-text-secondary hover:text-hud-accent-primary transition-colors">
                    <List className="w-4 h-4" />
                </button>
                <button className="w-8 h-8 rounded-full flex items-center justify-center text-hud-text-secondary hover:text-hud-accent-primary transition-colors">
                    <Volume2 className="w-4 h-4" />
                </button>
                <div
                    className="w-20 h-1 bg-hud-border-secondary rounded-full cursor-pointer"
                    onClick={handleVolumeClick}
                >
                    <div className="h-full bg-hud-accent-primary rounded-full" style={{ width: `${volume}%` }}></div>
                </div>
            </div>
        </div>
    )
}

export default MusicPlayer
