import { useState, useEffect } from 'react'
import { X, Loader2, Music2, Clock, Calendar, Hash } from 'lucide-react'
import { playlistsApi, PlaylistWithTracks } from '../../services/api/playlists'

interface PlaylistDetailModalProps {
    isOpen: boolean
    onClose: () => void
    playlistId: number | null
}

const PlaylistDetailModal = ({ isOpen, onClose, playlistId }: PlaylistDetailModalProps) => {
    const [playlist, setPlaylist] = useState<PlaylistWithTracks | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        if (isOpen && playlistId) {
            fetchDetails(playlistId)
        } else {
            setPlaylist(null)
            setLoading(true)
        }
    }, [isOpen, playlistId])

    const fetchDetails = async (id: number) => {
        try {
            setLoading(true)
            setError(null)
            // Fix: Cast response to unknown then to PlaylistWithTracks because getById might return just Playlist in types
            const data = await playlistsApi.getById(id) as unknown as PlaylistWithTracks
            setPlaylist(data)
        } catch (err) {
            console.error('Failed to load playlist details:', err)
            setError('플레이리스트 정보를 불러오는데 실패했습니다.')
        } finally {
            setLoading(false)
        }
    }

    if (!isOpen) return null

    // Format duration helper
    const formatDuration = (seconds: number) => {
        const min = Math.floor(seconds / 60)
        const sec = seconds % 60
        return `${min}:${sec.toString().padStart(2, '0')}`
    }

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in">
            <div className="bg-hud-bg-card border border-hud-border-secondary rounded-xl w-full max-w-4xl h-[80vh] flex flex-col shadow-2xl relative overflow-hidden animate-scale-up">

                {/* Header */}
                <div className="p-6 border-b border-hud-border-secondary flex items-start justify-between bg-hud-bg-primary/50">
                    {loading ? (
                        <div className="h-20 animate-pulse bg-hud-bg-secondary w-full rounded-lg"></div>
                    ) : playlist ? (
                        <div className="flex gap-6">
                            <div className="w-32 h-32 rounded-lg overflow-hidden shadow-lg border border-hud-border-secondary shrink-0 relative group">
                                {playlist.coverImage ? (
                                    <img src={playlist.coverImage} alt={playlist.title} className="w-full h-full object-cover" />
                                ) : (
                                    <div className="w-full h-full bg-hud-bg-secondary flex items-center justify-center">
                                        <Music2 className="w-12 h-12 text-hud-text-muted" />
                                    </div>
                                )}
                            </div>
                            <div className="flex flex-col justify-center">
                                <span className="text-xs font-bold text-hud-accent-primary uppercase tracking-wider mb-1">Playlist</span>
                                <h2 className="text-3xl font-bold text-hud-text-primary mb-2">{playlist.title}</h2>
                                <p className="text-hud-text-secondary text-sm mb-4 line-clamp-2 max-w-xl">
                                    {playlist.description || '설명 없음'}
                                </p>
                                <div className="flex items-center gap-4 text-xs text-hud-text-muted">
                                    <span className="flex items-center gap-1.5 bg-hud-bg-secondary px-2 py-1 rounded">
                                        <Hash className="w-3 h-3" /> {playlist.tracks?.length || 0} tracks
                                    </span>
                                    <span className="flex items-center gap-1.5 bg-hud-bg-secondary px-2 py-1 rounded">
                                        <Calendar className="w-3 h-3" /> {new Date(playlist.createdAt).toLocaleDateString()}
                                    </span>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div></div>
                    )}

                    <button
                        onClick={onClose}
                        className="p-2 text-hud-text-muted hover:text-hud-text-primary hover:bg-hud-bg-secondary rounded-lg transition-all"
                    >
                        <X size={24} />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-0 custom-scrollbar">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center h-full gap-4 text-hud-text-muted">
                            <Loader2 className="w-10 h-10 animate-spin text-hud-accent-primary" />
                            <p>Loading tracks...</p>
                        </div>
                    ) : error ? (
                        <div className="flex flex-col items-center justify-center h-full gap-4 text-red-500">
                            <p className="font-bold">{error}</p>
                            <button
                                onClick={() => playlistId && fetchDetails(playlistId)}
                                className="px-4 py-2 bg-hud-bg-secondary rounded-lg text-hud-text-primary text-sm hover:bg-hud-bg-hover"
                            >
                                Retry
                            </button>
                        </div>
                    ) : (
                        <table className="w-full text-left border-collapse">
                            <thead className="bg-hud-bg-secondary sticky top-0 z-10 shadow-sm">
                                <tr>
                                    <th className="p-4 w-12 text-center text-xs font-bold text-hud-text-muted uppercase">#</th>
                                    <th className="p-4 text-xs font-bold text-hud-text-muted uppercase">Title</th>
                                    <th className="p-4 text-xs font-bold text-hud-text-muted uppercase hidden md:table-cell">Artist</th>
                                    <th className="p-4 text-xs font-bold text-hud-text-muted uppercase hidden lg:table-cell">Album</th>
                                    <th className="p-4 w-20 text-right text-xs font-bold text-hud-text-muted uppercase">
                                        <Clock className="w-4 h-4 ml-auto" />
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-hud-border-secondary/50">
                                {playlist?.tracks && playlist.tracks.length > 0 ? (
                                    playlist.tracks.map((track, index) => (
                                        <tr
                                            key={track.id}
                                            className="group hover:bg-hud-accent-primary/5 transition-colors cursor-default"
                                        >
                                            <td className="p-4 text-center text-sm text-hud-text-muted group-hover:text-hud-accent-primary font-medium">
                                                {index + 1}
                                            </td>
                                            <td className="p-4">
                                                <div className="font-medium text-hud-text-primary">{track.title}</div>
                                                <div className="text-xs text-hud-text-secondary md:hidden">{track.artist}</div>
                                            </td>
                                            <td className="p-4 text-sm text-hud-text-secondary hidden md:table-cell font-medium">
                                                {track.artist}
                                            </td>
                                            <td className="p-4 text-sm text-hud-text-muted hidden lg:table-cell truncate max-w-[200px]">
                                                {track.album}
                                            </td>
                                            <td className="p-4 text-right text-sm text-hud-text-muted font-mono">
                                                {formatDuration(track.duration)}
                                            </td>
                                        </tr>
                                    ))
                                ) : (
                                    <tr>
                                        <td colSpan={5} className="p-12 text-center text-hud-text-muted">
                                            No tracks found in this playlist.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>
        </div>
    )
}

export default PlaylistDetailModal
