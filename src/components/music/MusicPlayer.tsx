import { Play, SkipBack, SkipForward, Shuffle, Repeat, Volume2, List, Music, Pause, Loader2 } from 'lucide-react'
import { useState, useRef, useEffect } from 'react'
import { useMusic } from '../../context/MusicContext'
import { audioService } from '../../services/audio/AudioService'
import { statsApi } from '../../services/api/stats'
import ReactPlayer from 'react-player'

const MusicPlayer = () => {
    const { currentTrack, isPlaying, togglePlay, audioState, resolvedUrl, playNext, playPrevious } = useMusic()
    const [localProgress, setLocalProgress] = useState(0)
    const [isDragging, setIsDragging] = useState(false)
    const [volume, setVolume] = useState(70)

    // Sync progress bar with audio state unless dragging
    useEffect(() => {
        if (!isDragging && audioState.duration > 0) {
            setLocalProgress((audioState.currentTime / audioState.duration) * 100)
        }
    }, [audioState.currentTime, audioState.duration, isDragging])

    const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
        const rect = e.currentTarget.getBoundingClientRect()
        const percent = ((e.clientX - rect.left) / rect.width) * 100
        const time = (percent / 100) * audioState.duration
        audioService.seekTo(time)
    }

    const handleVolumeClick = (e: React.MouseEvent<HTMLDivElement>) => {
        const rect = e.currentTarget.getBoundingClientRect()
        const percent = ((e.clientX - rect.left) / rect.width) * 100
        const newVol = Math.max(0, Math.min(100, percent))
        setVolume(newVol)
        audioService.setVolume(newVol / 100)
    }

    const formatTime = (seconds: number) => {
        if (!seconds || isNaN(seconds)) return '0:00'
        const mins = Math.floor(seconds / 60)
        const secs = Math.floor(seconds % 60)
        return `${mins}:${secs.toString().padStart(2, '0')}`
    }

    // Record play count
    useEffect(() => {
        if (isPlaying && currentTrack) {
            // Debounce or ensure single call per track play session could be improved here, 
            // but for now we record when playing starts for a new track.
            // A robust solution might need a 'hasRecorded' state reset on track change.
            const recordStats = async () => {
                try {
                    // Assuming 'track' type for now, but could be extended
                    await statsApi.recordPlay('track', currentTrack.id, currentTrack.artist)
                    console.log(`[Stats] Recorded play for: ${currentTrack.title}`)
                } catch (e) {
                    console.error('[Stats] Failed to record play:', e)
                }
            }

            // Allow a small delay to ensure it's not just a skip
            const timer = setTimeout(recordStats, 5000)
            return () => clearTimeout(timer)
        }
    }, [currentTrack?.id, isPlaying])

    if (!currentTrack) {
        return null
    }

    return (
        <div className="fixed bottom-0 left-64 right-0 h-20 bg-hud-bg-secondary/80 backdrop-blur-md border-t border-hud-border-secondary z-40 px-6 flex items-center gap-6 animate-in slide-in-from-bottom duration-300">
            {/* Hidden Player */}
            <div className="hidden">
                <ReactPlayer
                    ref={(player) => audioService.setPlayer(player)}
                    url={resolvedUrl || ''}
                    playing={isPlaying}
                    volume={volume / 100}
                    onProgress={audioService.onProgress}
                    onDuration={audioService.onDuration}
                    onBuffer={audioService.onBuffer}
                    onBufferEnd={audioService.onBufferEnd}
                    onError={audioService.onError}
                    onEnded={playNext}
                    width="0"
                    height="0"
                    config={{
                        youtube: {
                            playerVars: { origin: window.location.origin }
                        }
                    }}
                />
            </div>

            {/* Track Info */}
            <div className="flex items-center gap-4 min-w-[200px]">
                <div className="w-12 h-12 bg-gradient-to-br from-hud-accent-primary to-hud-accent-info rounded-lg flex items-center justify-center text-white/50 relative overflow-hidden">
                    {currentTrack.externalMetadata?.thumbnail ? (
                        <img src={currentTrack.externalMetadata.thumbnail} className="w-full h-full object-cover" alt="" />
                    ) : (
                        <Music className="w-5 h-5" />
                    )}
                </div>
                <div>
                    <h4 className="text-sm font-semibold text-hud-text-primary line-clamp-1">{currentTrack.title}</h4>
                    <p className="text-xs text-hud-text-muted line-clamp-1">{currentTrack.artist}</p>
                </div>
            </div>

            {/* Player Controls */}
            <div className="flex-1 flex flex-col gap-2 max-w-xl mx-auto">
                <div className="flex items-center justify-center gap-4">
                    <button className="w-8 h-8 rounded-full flex items-center justify-center text-hud-text-muted hover:text-hud-accent-primary transition-colors">
                        <Shuffle className="w-4 h-4" />
                    </button>
                    <button
                        onClick={playPrevious}
                        className="w-8 h-8 rounded-full flex items-center justify-center text-hud-text-secondary hover:text-hud-accent-primary transition-colors">
                        <SkipBack className="w-4 h-4" />
                    </button>
                    <button
                        onClick={togglePlay}
                        disabled={audioState.isBuffering && !audioState.isPlaying}
                        className="w-10 h-10 bg-hud-accent-primary rounded-full flex items-center justify-center text-hud-bg-primary hover:bg-hud-accent-primary/90 transition-all disabled:opacity-50"
                    >
                        {audioState.isBuffering ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                        ) : isPlaying ? (
                            <Pause className="w-4 h-4" fill="currentColor" />
                        ) : (
                            <Play className="w-4 h-4 ml-0.5" fill="currentColor" />
                        )}
                    </button>
                    <button
                        onClick={playNext}
                        className="w-8 h-8 rounded-full flex items-center justify-center text-hud-text-secondary hover:text-hud-accent-primary transition-colors">
                        <SkipForward className="w-4 h-4" />
                    </button>
                    <button className="w-8 h-8 rounded-full flex items-center justify-center text-hud-text-muted hover:text-hud-accent-primary transition-colors">
                        <Repeat className="w-4 h-4" />
                    </button>
                </div>

                {/* Progress Bar */}
                <div className="flex items-center gap-3">
                    <span className="text-xs text-hud-text-muted w-10 text-right">{formatTime(audioState.currentTime)}</span>
                    <div
                        className="flex-1 h-1 bg-hud-border-secondary rounded-full cursor-pointer group"
                        onClick={handleProgressClick}
                    >
                        <div
                            className="h-full bg-hud-accent-primary rounded-full relative transition-all duration-100 ease-linear"
                            style={{ width: `${localProgress}%` }}
                        >
                            <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-hud-accent-primary rounded-full opacity-0 group-hover:opacity-100 transition-opacity"></div>
                        </div>
                    </div>
                    <span className="text-xs text-hud-text-muted w-10">{formatTime(audioState.duration)}</span>
                </div>
            </div>

            {/* Volume */}
            <div className="flex items-center gap-3 min-w-[150px]">
                <div className="ml-auto flex items-center gap-3">
                    {/* Source Indicator */}
                    <div className="text-[10px] uppercase font-bold text-hud-text-muted px-2 py-0.5 border border-hud-border-secondary rounded">
                        {audioState.sourceType === 'YOUTUBE' ? 'YouTube' : audioState.sourceType === 'ITUNES_PREVIEW' ? 'Preview' : 'Local'}
                    </div>
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
        </div>
    )
}

export default MusicPlayer
