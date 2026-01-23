import { X, Play, Clock, Music } from 'lucide-react'
import { PlaylistWithTracks } from '../../services/api/playlists'
import { useMusic } from '../../context/MusicContext'

interface TrackListOverlayProps {
    playlist: PlaylistWithTracks
    onClose: () => void
}

const TrackListOverlay = ({ playlist, onClose }: TrackListOverlayProps) => {
    const { playPlaylist, currentTrack, isPlaying, togglePlay } = useMusic()

    const formatDuration = (seconds: number) => {
        const min = Math.floor(seconds / 60)
        const sec = seconds % 60
        return `${min}:${sec.toString().padStart(2, '0')}`
    }

    const handlePlayClick = (index: number) => {
        playPlaylist(playlist.tracks, index)
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-hud-bg-secondary w-full max-w-2xl max-h-[80vh] rounded-2xl shadow-2xl overflow-hidden flex flex-col border border-hud-border-primary animate-in fade-in zoom-in duration-200">
                {/* Header */}
                <div className="p-6 border-b border-hud-border-secondary flex items-start gap-6 relative">
                    <button
                        onClick={onClose}
                        className="absolute right-4 top-4 w-8 h-8 rounded-full bg-hud-bg-primary flex items-center justify-center text-hud-text-secondary hover:text-hud-accent-primary transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>

                    <div className="w-32 h-32 rounded-lg bg-gradient-to-br from-hud-accent-primary to-hud-accent-info flex items-center justify-center shadow-lg shrink-0">
                        {playlist.coverImage ? (
                            <img src={playlist.coverImage} alt={playlist.title} className="w-full h-full object-cover rounded-lg" />
                        ) : (
                            <Music className="w-16 h-16 text-white/50" />
                        )}
                    </div>

                    <div className="flex-1 mt-2">
                        <h2 className="text-2xl font-bold text-hud-text-primary mb-2 line-clamp-1">{playlist.title}</h2>
                        <p className="text-hud-text-secondary text-sm mb-4 line-clamp-2">{playlist.description || 'No description'}</p>
                        <div className="flex items-center gap-4 text-sm text-hud-text-muted">
                            <span>{playlist.tracks.length} Tracks</span>
                            <span>•</span>
                            <span>{playlist.spaceType} Space</span>
                        </div>
                    </div>
                </div>

                {/* Track List */}
                <div className="flex-1 overflow-y-auto p-2">
                    {playlist.tracks.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-40 text-hud-text-muted">
                            <Music className="w-12 h-12 mb-3 opacity-20" />
                            <p>No tracks in this playlist</p>
                        </div>
                    ) : (
                        <div className="space-y-1">
                            {playlist.tracks.map((track, idx) => {
                                const isCurrent = currentTrack?.id === track.id
                                return (
                                    <div
                                        key={track.id}
                                        className={`group flex items-center gap-4 p-3 rounded-lg hover:bg-hud-accent-primary/10 transition-all cursor-pointer ${isCurrent ? 'bg-hud-accent-primary/5' : ''
                                            }`}
                                        onClick={() => handlePlayClick(idx)}
                                    >
                                        <div className="w-8 text-center text-sm font-medium text-hud-text-muted group-hover:text-hud-accent-primary">
                                            {isCurrent && isPlaying ? (
                                                <div className="flex gap-0.5 justify-center h-4 items-end">
                                                    <div className="w-1 bg-hud-accent-primary animate-[bounce_1s_infinite] h-2"></div>
                                                    <div className="w-1 bg-hud-accent-primary animate-[bounce_1.2s_infinite] h-4"></div>
                                                    <div className="w-1 bg-hud-accent-primary animate-[bounce_0.8s_infinite] h-3"></div>
                                                </div>
                                            ) : (
                                                idx + 1
                                            )}
                                        </div>

                                        <div className="flex-1 min-w-0">
                                            <h4 className={`text-sm font-medium truncate ${isCurrent ? 'text-hud-accent-primary' : 'text-hud-text-primary'}`}>
                                                {track.title}
                                            </h4>
                                            <p className="text-xs text-hud-text-muted truncate">
                                                {track.artist}
                                            </p>
                                        </div>

                                        <div className="text-xs text-hud-text-muted flex items-center gap-1">
                                            <Clock className="w-3 h-3" />
                                            {formatDuration(track.duration)}
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </div>

                {/* Footer Action */}
                <div className="p-4 border-t border-hud-border-secondary flex justify-center">
                    <button
                        onClick={() => playPlaylist(playlist.tracks)}
                        className="bg-hud-accent-primary text-hud-bg-primary px-8 py-3 rounded-full font-bold flex items-center gap-2 hover:bg-hud-accent-primary/90 transition-all hover:scale-105"
                    >
                        <Play className="w-5 h-5 fill-current" />
                        Play All
                    </button>
                </div>
            </div>
        </div>
    )
}

export default TrackListOverlay
