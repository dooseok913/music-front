import { Play, SkipBack, SkipForward, Shuffle, Repeat, Volume2, VolumeX, Volume1, Music, Pause, Loader2, ChevronUp, ChevronDown, List, Heart } from 'lucide-react'
import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { useMusic } from '../../context/MusicContext'
import { audioService } from '../../services/audio/AudioService'
import { statsApi } from '../../services/api/stats'
import ReactPlayer from 'react-player'
import { useTheme } from '../../contexts/ThemeContext'

// Custom Repeat1 icon
// Custom Repeat1 icon
interface Repeat1IconProps {
    className?: string;
}

const Repeat1Icon = ({ className }: Repeat1IconProps) => (
    <div className={`relative ${className}`}>
        <Repeat className={className} />
        <span className="absolute inset-0 flex items-center justify-center text-[8px] font-bold">1</span>
    </div>
)

// Helper to parse externalMetadata
const parseMetadata = (metadata: any): any => {
    if (!metadata) return {}
    if (typeof metadata === 'string') {
        try {
            return JSON.parse(metadata)
        } catch {
            return {}
        }
    }
    return metadata
}

// Source badge component
const SourceBadge = ({ sourceType }: { sourceType: string }) => {
    const config: Record<string, { label: string; color: string }> = {
        'TIDAL': { label: 'TIDAL', color: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30' },
        'YOUTUBE': { label: 'YouTube', color: 'bg-red-500/20 text-red-400 border-red-500/30' },
        'ITUNES_PREVIEW': { label: 'Preview', color: 'bg-pink-500/20 text-pink-400 border-pink-500/30' },
    }
    const { label, color } = config[sourceType] || { label: 'Local', color: 'bg-gray-500/20 text-gray-400 border-gray-500/30' }

    return (
        <span className={`text-[9px] sm:text-[10px] uppercase font-bold px-1.5 sm:px-2 py-0.5 border rounded ${color}`}>
            {label}
        </span>
    )
}



const MusicPlayer = () => {
    const { theme } = useTheme()

    const {
        currentTrack, isPlaying, togglePlay, audioState, resolvedUrl,
        playNext, playPrevious, queue,
        isShuffled, repeatMode, toggleShuffle, toggleRepeat
    } = useMusic()

    // Local state
    const [isExpanded, setIsExpanded] = useState(false)
    const [isCollapsed, setIsCollapsed] = useState(false)
    const [showQueue, setShowQueue] = useState(false)
    const [isLiked, setIsLiked] = useState(false)
    const [volume, setVolume] = useState(100)
    const [isMuted, setIsMuted] = useState(false)
    const [lastVolume, setLastVolume] = useState(100)
    const [isDragging, setIsDragging] = useState(false)
    const [localProgress, setLocalProgress] = useState(0)

    // Refs
    const progressRef = useRef<HTMLDivElement>(null)
    const volumeRef = useRef<HTMLDivElement>(null)

    // Update local progress when not dragging
    useEffect(() => {
        if (!isDragging && audioState.duration > 0) {
            setLocalProgress((audioState.currentTime / audioState.duration) * 100)
        }
    }, [audioState.currentTime, audioState.duration, isDragging])

    // Helper to format time
    const formatTime = (seconds: number) => {
        if (!seconds || isNaN(seconds)) return '0:00'
        const mins = Math.floor(seconds / 60)
        const secs = Math.floor(seconds % 60)
        return `${mins}:${secs.toString().padStart(2, '0')}`
    }

    // Volume handlers
    const handleVolumeClick = (e: React.MouseEvent<HTMLDivElement>) => {
        if (!volumeRef.current) return
        const rect = volumeRef.current.getBoundingClientRect()
        const x = e.clientX - rect.left
        const width = rect.width
        const newVolume = Math.min(100, Math.max(0, (x / width) * 100))

        setVolume(newVolume)
        if (newVolume > 0) setIsMuted(false)
    }

    const toggleMute = () => {
        if (isMuted) {
            setVolume(lastVolume || 100)
            setIsMuted(false)
        } else {
            setLastVolume(volume)
            setVolume(0)
            setIsMuted(true)
        }
    }

    // Progress handlers
    const handleProgressMouseDown = (e: React.MouseEvent) => {
        setIsDragging(true)
        handleProgressChange(e)
        window.addEventListener('mousemove', handleProgressMouseMove)
        window.addEventListener('mouseup', handleProgressMouseUp)
    }

    const handleProgressMouseMove = (e: MouseEvent) => {
        if (!progressRef.current) return
        const rect = progressRef.current.getBoundingClientRect()
        const x = e.clientX - rect.left
        const width = rect.width
        const percentage = Math.min(100, Math.max(0, (x / width) * 100))
        setLocalProgress(percentage)
    }

    const handleProgressMouseUp = (e: MouseEvent) => {
        setIsDragging(false)
        if (progressRef.current) {
            const rect = progressRef.current.getBoundingClientRect()
            const x = e.clientX - rect.left
            const width = rect.width
            const percentage = Math.min(100, Math.max(0, (x / width) * 100))
            const time = (percentage / 100) * audioState.duration
            audioService.seekTo(time)
        }
        window.removeEventListener('mousemove', handleProgressMouseMove)
        window.removeEventListener('mouseup', handleProgressMouseUp)
    }

    const handleProgressChange = (e: React.MouseEvent) => {
        if (!progressRef.current) return
        const rect = progressRef.current.getBoundingClientRect()
        const x = e.clientX - rect.left
        const width = rect.width
        const percentage = Math.min(100, Math.max(0, (x / width) * 100))

        if (!isDragging) {
            const time = (percentage / 100) * audioState.duration
            audioService.seekTo(time)
        } else {
            setLocalProgress(percentage)
        }
    }

    // Volume icon helper
    const VolumeIcon = ({ className = "w-5 h-5 sm:w-6 sm:h-6" }: { className?: string }) => {
        if (isMuted || volume === 0) return <VolumeX className={className} />
        if (volume < 50) return <Volume1 className={className} />
        return <Volume2 className={className} />
    }

    // Listen for global volume changes (optional - if audioService emits events)
    // For now dealing with local volume state that controls the player

    const trackThumbnail = useMemo(() => {
        if (!currentTrack) return null
        // Standardize artwork access
        return currentTrack.artwork || (currentTrack as any).thumbnail || (currentTrack as any).coverImage || null
    }, [currentTrack])

    if (!currentTrack) return null

    return (
        <>
            {/* ===== MOBILE FULL SCREEN VIEW ===== */}
            {isExpanded && (
                <div className={`fixed inset-0 z-50 lg:hidden flex flex-col animate-in slide-in-from-bottom duration-300 ${theme === 'jazz'
                    ? 'bg-hud-bg-primary/95 backdrop-blur-xl'
                    : 'bg-gradient-to-b from-hud-bg-primary via-hud-bg-secondary to-hud-bg-primary'
                    }`}>
                    {/* Header */}
                    <div className="flex items-center justify-between px-4 py-3 sm:px-6 sm:py-4">
                        <button onClick={() => setIsExpanded(false)} className="p-2 -ml-2 text-hud-text-muted hover:text-hud-text-primary">
                            <ChevronDown className="w-6 h-6" />
                        </button>
                        <span className="text-xs text-hud-text-muted uppercase tracking-wider">Now Playing</span>
                        <button onClick={() => setShowQueue(!showQueue)} className={`p-2 -mr-2 ${showQueue ? 'text-hud-accent-primary' : 'text-hud-text-muted hover:text-hud-text-primary'}`}>
                            <List className="w-5 h-5" />
                        </button>
                    </div>

                    {/* Main Content */}
                    <div className="flex-1 flex flex-col items-center justify-center px-6 sm:px-12 overflow-hidden relative">
                        {/* Jazz Theme Background Glow */}
                        {theme === 'jazz' && (
                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-30">
                                <div className="w-[500px] h-[500px] bg-hud-accent-primary rounded-full blur-[100px] animate-pulse"></div>
                            </div>
                        )}
                        {/* Soul Theme Background Glow (Pastel Blue) */}
                        {theme === 'soul' && (
                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-40">
                                <div className="w-[500px] h-[500px] bg-[#93C5FD] rounded-full blur-[120px] animate-pulse"></div>
                            </div>
                        )}

                        {/* Album Art */}
                        <div className={`
                            relative z-10 w-full max-w-[280px] sm:max-w-[320px] md:max-w-[380px] aspect-square 
                            flex items-center justify-center shadow-2xl overflow-hidden mb-6 sm:mb-8
                            ${theme === 'jazz'
                                ? `rounded-full border-4 border-hud-bg-card ring-1 ring-hud-border-primary/30 ${isPlaying ? 'animate-vinyl-spin' : ''}`
                                : theme === 'soul'
                                    ? 'rounded-3xl border border-[#93C5FD]/50 shadow-[0_0_30px_rgba(147,197,253,0.4)]'
                                    : 'bg-gradient-to-br from-hud-accent-primary/20 to-hud-accent-info/20 rounded-2xl sm:rounded-3xl'
                            }
                        `}>
                            {trackThumbnail ? (
                                <img src={trackThumbnail} className="w-full h-full object-cover" alt="" />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center bg-hud-bg-secondary">
                                    <Music className="w-20 h-20 sm:w-24 sm:h-24 text-hud-text-muted/30" />
                                </div>
                            )}

                            {/* Vinyl Center Hole for Jazz Theme */}
                            {theme === 'jazz' && (
                                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                    <div className="w-16 h-16 bg-hud-bg-primary rounded-full border-2 border-hud-bg-card flex items-center justify-center">
                                        <div className="w-3 h-3 bg-black rounded-full"></div>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Track Info */}
                        <div className="w-full max-w-md text-center mb-4 sm:mb-6 relative z-10">
                            <div className="flex items-center justify-center gap-2 mb-1">
                                <SourceBadge sourceType={audioState.sourceType} />
                            </div>
                            <h2 className="text-lg sm:text-xl md:text-2xl font-bold text-hud-text-primary line-clamp-2 mb-1">{currentTrack.title}</h2>
                            <p className="text-sm sm:text-base text-hud-text-muted">{currentTrack.artist}</p>
                            {audioState.error && (
                                <p className="text-xs text-red-400 mt-2 animate-pulse">{audioState.error}</p>
                            )}
                        </div>
                    </div>

                    {/* Progress Bar */}
                    <div className="px-6 sm:px-12 pb-2">
                        <div
                            ref={progressRef}
                            className="h-1.5 sm:h-2 bg-hud-border-secondary rounded-full cursor-pointer group"
                            onMouseDown={handleProgressMouseDown}
                            onClick={(e) => !isDragging && handleProgressChange(e)}
                        >
                            <div className="h-full bg-hud-accent-primary rounded-full relative" style={{ width: `${localProgress}%` }}>
                                <div className="absolute right-0 top-1/2 -translate-y-1/2 w-4 h-4 sm:w-5 sm:h-5 bg-white rounded-full shadow-lg scale-0 group-hover:scale-100 group-active:scale-100 transition-transform"></div>
                            </div>
                        </div>
                        <div className="flex justify-between mt-1.5 text-[10px] sm:text-xs text-hud-text-muted">
                            <span>{formatTime(audioState.currentTime)}</span>
                            <span>{formatTime(audioState.duration)}</span>
                        </div>
                    </div>

                    {/* Controls */}
                    <div className="px-6 sm:px-12 py-4 sm:py-6 flex items-center justify-center gap-4 sm:gap-6 md:gap-8">
                        <button
                            onClick={toggleShuffle}
                            className={`w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center transition-all ${isShuffled ? 'text-hud-accent-primary bg-hud-accent-primary/10' : 'text-hud-text-muted hover:text-hud-text-primary'}`}
                        >
                            <Shuffle className="w-5 h-5 sm:w-6 sm:h-6" />
                        </button>
                        <button onClick={playPrevious} className="w-12 h-12 sm:w-14 sm:h-14 rounded-full flex items-center justify-center text-hud-text-secondary hover:text-hud-text-primary active:scale-95 transition-all">
                            <SkipBack className="w-6 h-6 sm:w-7 sm:h-7" fill="currentColor" />
                        </button>
                        <button
                            onClick={togglePlay}
                            disabled={audioState.isBuffering && !audioState.isPlaying}
                            className="w-16 h-16 sm:w-18 sm:h-18 md:w-20 md:h-20 bg-hud-accent-primary rounded-full flex items-center justify-center text-hud-bg-primary hover:bg-hud-accent-primary/90 active:scale-95 disabled:opacity-50 shadow-lg shadow-hud-accent-primary/30 transition-all"
                        >
                            {audioState.isBuffering ? (
                                <Loader2 className="w-7 h-7 sm:w-8 sm:h-8 animate-spin" />
                            ) : isPlaying ? (
                                <Pause className="w-7 h-7 sm:w-8 sm:h-8" fill="currentColor" />
                            ) : (
                                <Play className="w-7 h-7 sm:w-8 sm:h-8 ml-1" fill="currentColor" />
                            )}
                        </button>
                        <button onClick={playNext} className="w-12 h-12 sm:w-14 sm:h-14 rounded-full flex items-center justify-center text-hud-text-secondary hover:text-hud-text-primary active:scale-95 transition-all">
                            <SkipForward className="w-6 h-6 sm:w-7 sm:h-7" fill="currentColor" />
                        </button>
                        <button
                            onClick={toggleRepeat}
                            className={`w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center transition-all ${repeatMode !== 'off' ? 'text-hud-accent-primary bg-hud-accent-primary/10' : 'text-hud-text-muted hover:text-hud-text-primary'}`}
                        >
                            {repeatMode === 'one' ? <Repeat1Icon className="w-5 h-5 sm:w-6 sm:h-6" /> : <Repeat className="w-5 h-5 sm:w-6 sm:h-6" />}
                        </button>
                    </div>

                    {/* Volume (Mobile) */}
                    <div className="px-6 sm:px-12 pb-6 sm:pb-8 flex items-center gap-3">
                        <button onClick={toggleMute} className="text-hud-text-secondary hover:text-hud-text-primary">
                            <VolumeIcon className="w-5 h-5" />
                        </button>
                        <div
                            ref={volumeRef}
                            className="flex-1 h-1.5 bg-hud-border-secondary rounded-full cursor-pointer"
                            onClick={handleVolumeClick}
                        >
                            <div className="h-full bg-hud-accent-primary rounded-full transition-all" style={{ width: isMuted ? 0 : `${volume}%` }}></div>
                        </div>
                        <button onClick={() => setIsLiked(!isLiked)} className={`${isLiked ? 'text-red-500' : 'text-hud-text-secondary hover:text-red-500'} transition-colors`}>
                            <Heart className="w-5 h-5" fill={isLiked ? 'currentColor' : 'none'} />
                        </button>
                    </div>
                </div>
            )}

            {/* ===== COLLAPSED TAB (불룩 튀어나온 버튼) ===== */}
            {isCollapsed && (
                <button
                    onClick={() => setIsCollapsed(false)}
                    className="fixed bottom-0 right-6 z-[401] bg-hud-bg-secondary/95 backdrop-blur-xl border border-b-0 border-hud-border-secondary rounded-t-xl px-4 py-2 flex items-center gap-2 hover:bg-hud-bg-card transition-all shadow-lg"
                >
                    {trackThumbnail ? (
                        <img src={trackThumbnail} className="w-8 h-8 rounded-md object-cover" alt="" />
                    ) : (
                        <Music className="w-4 h-4 text-hud-text-muted" />
                    )}
                    <ChevronUp className="w-4 h-4 text-hud-text-muted" />
                </button>
            )}

            {/* ===== MAIN PLAYER BAR ===== */}
            <div className={`fixed left-0 right-0 bg-hud-bg-secondary/95 backdrop-blur-xl border-t border-hud-border-secondary z-[400] transition-all duration-300 ease-in-out ${isCollapsed ? 'translate-y-full' : 'bottom-0 translate-y-0'}`} style={{ bottom: 0 }}>
                {/* Collapse Button (내리기) */}
                <button
                    onClick={() => setIsCollapsed(true)}
                    className="absolute -top-10 right-6 z-10 bg-hud-bg-secondary/95 backdrop-blur-xl border border-b-0 border-hud-border-secondary rounded-t-lg px-3 py-0.5 hover:bg-hud-bg-card transition-colors"
                >
                    <ChevronDown className="w-4 h-4 text-hud-text-muted" />
                </button>

                {/* Mobile Progress Bar (Top) */}
                <div className="lg:hidden h-1 bg-hud-border-secondary">
                    <div className="h-full bg-hud-accent-primary transition-all" style={{ width: `${localProgress}%` }}></div>
                </div>

                <div className="h-14 sm:h-16 lg:h-20 px-2 sm:px-4 lg:px-6 flex items-center gap-2 sm:gap-3 lg:gap-6">
                    {/* Hidden ReactPlayer */}
                    <div className="hidden">
                        <ReactPlayer
                            ref={(player) => audioService.setPlayer(player)}
                            url={resolvedUrl === 'TIDAL_INTERNAL' ? '' : (resolvedUrl || '')}
                            playing={isPlaying && resolvedUrl !== 'TIDAL_INTERNAL'}
                            volume={isMuted ? 0 : volume / 100}
                            onProgress={audioService.onProgress}
                            onDuration={audioService.onDuration}
                            onBuffer={audioService.onBuffer}
                            onBufferEnd={audioService.onBufferEnd}
                            onError={audioService.onError}
                            onEnded={playNext}
                            width="0"
                            height="0"
                            config={{ youtube: { playerVars: { origin: window.location.origin } } }}
                        />
                    </div>

                    {/* Track Info */}
                    <div
                        className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1 lg:flex-none lg:w-[240px] xl:w-[280px] cursor-pointer lg:cursor-default"
                        onClick={() => window.innerWidth < 1024 && setIsExpanded(true)}
                    >
                        <div className="w-10 h-10 sm:w-11 sm:h-11 lg:w-14 lg:h-14 bg-gradient-to-br from-hud-accent-primary/20 to-hud-accent-info/20 rounded-md lg:rounded-lg flex items-center justify-center overflow-hidden flex-shrink-0 group">
                            {trackThumbnail ? (
                                <img src={trackThumbnail} className="w-full h-full object-cover" alt="" />
                            ) : (
                                <Music className="w-4 h-4 sm:w-5 sm:h-5 text-hud-text-muted" />
                            )}
                        </div>
                        <div className="flex-1 min-w-0">
                            <h4 className="text-xs sm:text-sm lg:text-base font-semibold text-hud-text-primary line-clamp-1">{currentTrack.title}</h4>
                            <div className="flex items-center gap-1.5">
                                <p className="text-[10px] sm:text-xs text-hud-text-muted line-clamp-1">{currentTrack.artist}</p>
                                <span className="hidden sm:inline lg:hidden">
                                    <SourceBadge sourceType={audioState.sourceType} />
                                </span>
                            </div>
                        </div>
                        {/* Mobile expand button */}
                        <button className="lg:hidden p-1.5 text-hud-text-muted hover:text-hud-text-primary" onClick={(e) => { e.stopPropagation(); setIsExpanded(true); }}>
                            <ChevronUp className="w-4 h-4 sm:w-5 sm:h-5" />
                        </button>
                    </div>

                    {/* Mobile Mini Controls */}
                    <div className="flex lg:hidden items-center gap-0.5 sm:gap-1">
                        <button onClick={(e) => { e.stopPropagation(); playPrevious(); }} className="w-8 h-8 sm:w-9 sm:h-9 rounded-full flex items-center justify-center text-hud-text-secondary active:scale-95">
                            <SkipBack className="w-4 h-4 sm:w-5 sm:h-5" />
                        </button>
                        <button
                            onClick={(e) => { e.stopPropagation(); togglePlay(); }}
                            disabled={audioState.isBuffering && !audioState.isPlaying}
                            className="w-10 h-10 sm:w-11 sm:h-11 bg-hud-accent-primary rounded-full flex items-center justify-center text-hud-bg-primary disabled:opacity-50 active:scale-95 transition-transform"
                        >
                            {audioState.isBuffering ? (
                                <Loader2 className="w-4 h-4 sm:w-5 sm:h-5 animate-spin" />
                            ) : isPlaying ? (
                                <Pause className="w-4 h-4 sm:w-5 sm:h-5" fill="currentColor" />
                            ) : (
                                <Play className="w-4 h-4 sm:w-5 sm:h-5 ml-0.5" fill="currentColor" />
                            )}
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); playNext(); }} className="w-8 h-8 sm:w-9 sm:h-9 rounded-full flex items-center justify-center text-hud-text-secondary active:scale-95">
                            <SkipForward className="w-4 h-4 sm:w-5 sm:h-5" />
                        </button>
                    </div>

                    {/* Desktop Center Controls */}
                    <div className="hidden lg:flex flex-1 flex-col gap-1.5 max-w-2xl mx-auto">
                        {/* Playback Controls */}
                        <div className="flex items-center justify-center gap-2 xl:gap-3">
                            <button
                                onClick={toggleShuffle}
                                className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${isShuffled ? 'text-hud-accent-primary' : 'text-hud-text-muted hover:text-hud-text-primary'}`}
                                title={isShuffled ? '셔플 켜짐' : '셔플 꺼짐'}
                            >
                                <Shuffle className="w-4 h-4" />
                            </button>
                            <button onClick={playPrevious} className="w-9 h-9 rounded-full flex items-center justify-center text-hud-text-secondary hover:text-hud-text-primary active:scale-95 transition-all">
                                <SkipBack className="w-5 h-5" />
                            </button>
                            <button
                                onClick={togglePlay}
                                disabled={audioState.isBuffering && !audioState.isPlaying}
                                className="w-10 h-10 xl:w-11 xl:h-11 bg-hud-accent-primary rounded-full flex items-center justify-center text-hud-bg-primary hover:bg-hud-accent-primary/90 active:scale-95 disabled:opacity-50 transition-all"
                            >
                                {audioState.isBuffering ? (
                                    <Loader2 className="w-5 h-5 animate-spin" />
                                ) : isPlaying ? (
                                    <Pause className="w-5 h-5" fill="currentColor" />
                                ) : (
                                    <Play className="w-5 h-5 ml-0.5" fill="currentColor" />
                                )}
                            </button>
                            <button onClick={playNext} className="w-9 h-9 rounded-full flex items-center justify-center text-hud-text-secondary hover:text-hud-text-primary active:scale-95 transition-all">
                                <SkipForward className="w-5 h-5" />
                            </button>
                            <button
                                onClick={toggleRepeat}
                                className={`w-8 h-8 rounded-full flex items-center justify-center transition-all relative ${repeatMode !== 'off' ? 'text-hud-accent-primary' : 'text-hud-text-muted hover:text-hud-text-primary'}`}
                                title={repeatMode === 'off' ? '반복 꺼짐' : repeatMode === 'all' ? '전체 반복' : '한 곡 반복'}
                            >
                                {repeatMode === 'one' ? <Repeat1Icon className="w-4 h-4" /> : <Repeat className="w-4 h-4" />}
                            </button>
                        </div>

                        {/* Progress Bar */}
                        <div className="flex items-center gap-2 xl:gap-3">
                            <span className="text-[10px] xl:text-xs text-hud-text-muted w-9 xl:w-10 text-right tabular-nums">{formatTime(audioState.currentTime)}</span>
                            <div
                                ref={progressRef}
                                className="flex-1 h-1 xl:h-1.5 bg-hud-border-secondary rounded-full cursor-pointer group"
                                onMouseDown={handleProgressMouseDown}
                            >
                                <div className="h-full bg-hud-accent-primary rounded-full relative transition-all" style={{ width: `${localProgress}%` }}>
                                    <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow"></div>
                                </div>
                            </div>
                            <span className="text-[10px] xl:text-xs text-hud-text-muted w-9 xl:w-10 tabular-nums">{formatTime(audioState.duration)}</span>
                        </div>
                    </div>

                    {/* Desktop Right Controls */}
                    <div className="hidden lg:flex items-center gap-1.5 xl:gap-2 w-auto justify-end flex-shrink-0">
                        <SourceBadge sourceType={audioState.sourceType} />
                        <button onClick={() => setIsLiked(!isLiked)} className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${isLiked ? 'text-red-500' : 'text-hud-text-muted hover:text-red-500'}`}>
                            <Heart className="w-4 h-4" fill={isLiked ? 'currentColor' : 'none'} />
                        </button>
                        <button onClick={toggleMute} className="w-8 h-8 rounded-full flex items-center justify-center text-hud-text-secondary hover:text-hud-text-primary transition-colors">
                            <VolumeIcon className="w-4 h-4" />
                        </button>
                        <div
                            ref={volumeRef}
                            className="w-20 xl:w-24 h-1 bg-hud-border-secondary rounded-full cursor-pointer group"
                            onClick={handleVolumeClick}
                        >
                            <div className="h-full bg-hud-accent-primary rounded-full relative transition-all" style={{ width: isMuted ? 0 : `${volume}%` }}>
                                <div className="absolute right-0 top-1/2 -translate-y-1/2 w-2.5 h-2.5 bg-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow"></div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Error Toast */}
                {audioState.error && (
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-4 py-2 bg-red-500/90 text-white text-xs sm:text-sm rounded-lg shadow-lg animate-in fade-in slide-in-from-bottom-2 whitespace-nowrap">
                        {audioState.error}
                    </div>
                )}
            </div>
        </>
    )
}

export default MusicPlayer
