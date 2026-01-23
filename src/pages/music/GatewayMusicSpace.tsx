import MusicSidebar from '../../components/music/MusicSidebar'
import { Brain, Check, X, Play, Pause, SkipForward, Music, Star, ArrowRight, Eye, ThumbsUp, ThumbsDown, Sparkles, Filter, Loader2 } from 'lucide-react'
import { useState, useEffect } from 'react'
import { playlistsApi } from '../../services/api/playlists'

interface AiPlaylist {
    id: number
    title: string
    trackCount: number
    aiScore: number
    source: string
    matchedTracks: number
}

const GatewayMusicSpace = () => {
    const [playlists, setPlaylists] = useState<AiPlaylist[]>([])
    const [loading, setLoading] = useState(true)
    const [previewMode, setPreviewMode] = useState(false)
    const [currentTrack, setCurrentTrack] = useState({ title: 'Super Shy', artist: 'NewJeans', isPlaying: false })

    useEffect(() => {
        fetchPlaylists()
    }, [])

    const fetchPlaylists = async () => {
        try {
            setLoading(true)
            // Fetch playlists with spaceType='GMS' (or 'EMS' for demo if GMS empty)
            const response = await playlistsApi.getPlaylists('GMS')

            const formatted = response.playlists.map(p => ({
                id: p.id,
                title: p.title,
                trackCount: p.trackCount || 0,
                // Use actual AI score from DB, default to random for demo if 0
                aiScore: p.aiScore > 0 ? p.aiScore : Math.floor(Math.random() * 20) + 70,
                source: p.sourceType,
                matchedTracks: Math.floor((p.trackCount || 0) * 0.8) // Mock matched count
            }))

            setPlaylists(formatted)
        } catch (error) {
            console.error('Failed to fetch GMS playlists:', error)
            // Mock data fallback
            setPlaylists([
                { id: 1, title: 'Summer Vibes 2024', trackCount: 32, aiScore: 95, source: 'Tidal', matchedTracks: 28 },
                { id: 2, title: 'K-POP Rising Stars', trackCount: 45, aiScore: 88, source: 'YouTube Music', matchedTracks: 35 },
            ])
        } finally {
            setLoading(false)
        }
    }

    const getScoreColor = (score: number) => {
        if (score >= 85) return 'text-hud-accent-success bg-hud-accent-success/20 border-hud-accent-success/30'
        if (score >= 70) return 'text-hud-accent-warning bg-hud-accent-warning/20 border-hud-accent-warning/30'
        return 'text-hud-text-muted bg-hud-bg-secondary border-hud-border-secondary'
    }

    const handleApprove = async (id: number) => {
        try {
            await playlistsApi.updateStatus(id, 'PRP') // Mark as processed/approved
            // In real app, maybe move to PMS
            await playlistsApi.movePlaylist(id, 'PMS')
            setPlaylists(prev => prev.filter(p => p.id !== id))
        } catch (error) {
            console.error('Approve failed:', error)
        }
    }

    return (
        <div className="min-h-screen bg-hud-bg-primary hud-grid-bg">
            <MusicSidebar />

            <main className="ml-0 md:ml-64 p-4 md:p-6">
                {/* Header */}
                <header className="mb-6">
                    <h1 className="text-2xl md:text-3xl font-bold text-hud-accent-warning mb-2">The Lab (GMS)</h1>
                    <p className="text-hud-text-secondary text-sm md:text-base">AI가 검증한 플레이리스트를 확인하고 승인하세요</p>
                </header>

                {/* Stats Row */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-6">
                    {[
                        { label: 'AI 검증 완료', value: playlists.length.toString(), color: 'hud-accent-success' },
                        { label: '고득점 (85+)', value: playlists.filter(p => p.aiScore >= 85).length.toString(), color: 'hud-accent-primary' },
                        { label: '검토 대기', value: playlists.length.toString(), color: 'hud-accent-warning' },
                        { label: '보류 중', value: '0', color: 'hud-text-muted' },
                    ].map((stat) => (
                        <div key={stat.label} className="hud-card hud-card-bottom rounded-xl p-4 text-center">
                            <div className={`text-2xl font-bold text-${stat.color}`}>{stat.value}</div>
                            <div className="text-xs text-hud-text-muted">{stat.label}</div>
                        </div>
                    ))}
                </div>

                {/* Quick Actions */}
                <div className="flex flex-wrap gap-3 mb-6">
                    <button
                        onClick={() => setPreviewMode(!previewMode)}
                        className={`px-4 py-2 rounded-lg font-medium flex items-center gap-2 transition-all ${previewMode
                            ? 'bg-hud-accent-primary text-hud-bg-primary'
                            : 'bg-hud-bg-secondary border border-hud-border-secondary text-hud-text-primary hover:bg-hud-bg-hover'
                            }`}
                    >
                        <Sparkles className="w-4 h-4" />
                        미리듣기 모드
                    </button>
                    <button className="px-4 py-2 rounded-lg font-medium flex items-center gap-2 bg-hud-bg-secondary border border-hud-border-secondary text-hud-text-primary hover:bg-hud-bg-hover transition-all">
                        <Filter className="w-4 h-4" />
                        필터
                    </button>
                    <button className="px-4 py-2 rounded-lg font-medium flex items-center gap-2 bg-hud-accent-success/20 border border-hud-accent-success/30 text-hud-accent-success hover:bg-hud-accent-success/30 transition-all">
                        <Check className="w-4 h-4" />
                        모두 승인
                    </button>
                </div>

                {/* Preview Mode Panel */}
                {previewMode && (
                    <div className="hud-card hud-card-bottom rounded-xl p-6 mb-6 border-l-4 border-hud-accent-primary">
                        <div className="flex flex-col md:flex-row items-center gap-6">
                            <div className="w-24 h-24 bg-gradient-to-br from-hud-accent-primary to-hud-accent-info rounded-xl flex items-center justify-center shrink-0">
                                <Music className="w-10 h-10 text-white" />
                            </div>
                            <div className="flex-1 text-center md:text-left">
                                <div className="text-sm text-hud-accent-primary mb-1">미리듣기 중...</div>
                                <div className="text-xl font-bold text-hud-text-primary">{currentTrack.title}</div>
                                <div className="text-hud-text-muted">{currentTrack.artist}</div>
                            </div>
                            <div className="flex items-center gap-3">
                                <button className="w-12 h-12 bg-hud-accent-danger/20 hover:bg-hud-accent-danger/30 border border-hud-accent-danger/30 rounded-full flex items-center justify-center text-hud-accent-danger transition-all">
                                    <ThumbsDown className="w-5 h-5" />
                                </button>
                                <button
                                    onClick={() => setCurrentTrack({ ...currentTrack, isPlaying: !currentTrack.isPlaying })}
                                    className="w-14 h-14 bg-hud-accent-primary rounded-full flex items-center justify-center text-hud-bg-primary hover:bg-hud-accent-primary/90 transition-all"
                                >
                                    {currentTrack.isPlaying ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6 ml-1" fill="currentColor" />}
                                </button>
                                <button className="w-12 h-12 bg-hud-accent-success/20 hover:bg-hud-accent-success/30 border border-hud-accent-success/30 rounded-full flex items-center justify-center text-hud-accent-success transition-all">
                                    <ThumbsUp className="w-5 h-5" />
                                </button>
                                <button className="w-10 h-10 bg-hud-bg-secondary border border-hud-border-secondary rounded-full flex items-center justify-center text-hud-text-muted hover:text-hud-text-primary transition-all">
                                    <SkipForward className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                        <div className="mt-4">
                            <div className="h-1 bg-hud-border-secondary rounded-full">
                                <div className="h-full w-1/3 bg-hud-accent-primary rounded-full"></div>
                            </div>
                        </div>
                    </div>
                )}

                {/* AI Verified Playlists */}
                <section className="hud-card hud-card-bottom rounded-xl p-4 md:p-6">
                    <h2 className="text-lg font-bold text-hud-text-primary flex items-center gap-2 mb-4">
                        <Brain className="w-5 h-5 text-hud-accent-warning" />
                        AI 검증 플레이리스트
                    </h2>

                    {loading ? (
                        <div className="flex justify-center py-12">
                            <Loader2 className="w-8 h-8 text-hud-accent-primary animate-spin" />
                        </div>
                    ) : playlists.length === 0 ? (
                        <div className="text-center py-12 text-hud-text-muted">
                            검증 대기 중인 플레이리스트가 없습니다.
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {playlists.map((playlist) => (
                                <div key={playlist.id} className="bg-hud-bg-secondary/50 rounded-lg p-4 hover:bg-hud-bg-hover transition-all">
                                    <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                                        {/* Cover */}
                                        <div className="w-16 h-16 bg-gradient-to-br from-hud-accent-warning to-orange-400 rounded-lg flex items-center justify-center shrink-0">
                                            <Music className="w-7 h-7 text-white" />
                                        </div>

                                        {/* Info */}
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <h3 className="font-semibold text-hud-text-primary">{playlist.title}</h3>
                                                <span className={`px-2 py-0.5 rounded-full text-xs font-semibold border flex items-center gap-1 ${getScoreColor(playlist.aiScore)}`}>
                                                    <Star className="w-3 h-3" fill="currentColor" />
                                                    {playlist.aiScore}%
                                                </span>
                                            </div>
                                            <div className="text-sm text-hud-text-muted mt-1">
                                                {playlist.source} • {playlist.trackCount} tracks • 매칭 {playlist.matchedTracks}곡
                                            </div>
                                        </div>

                                        {/* Actions */}
                                        <div className="flex items-center gap-2">
                                            <button className="w-9 h-9 bg-hud-bg-secondary border border-hud-border-secondary rounded-lg flex items-center justify-center text-hud-text-muted hover:text-hud-accent-info hover:border-hud-accent-info/30 transition-all">
                                                <Eye className="w-4 h-4" />
                                            </button>
                                            <button className="w-9 h-9 bg-hud-bg-secondary border border-hud-border-secondary rounded-lg flex items-center justify-center text-hud-text-muted hover:text-hud-accent-primary hover:border-hud-accent-primary/30 transition-all">
                                                <Play className="w-4 h-4" fill="currentColor" />
                                            </button>
                                            <button
                                                onClick={() => handleApprove(playlist.id)}
                                                className="px-4 py-2 bg-hud-accent-success/20 border border-hud-accent-success/30 rounded-lg text-hud-accent-success text-sm font-medium flex items-center gap-1.5 hover:bg-hud-accent-success/30 transition-all"
                                            >
                                                <Check className="w-4 h-4" /> 승인
                                            </button>
                                            <button className="w-9 h-9 bg-hud-bg-secondary border border-hud-border-secondary rounded-lg flex items-center justify-center text-hud-text-muted hover:text-hud-accent-danger hover:border-hud-accent-danger/30 transition-all">
                                                <X className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* View More */}
                    <div className="mt-4 text-center">
                        <button className="text-hud-accent-primary font-medium flex items-center gap-1 mx-auto hover:underline">
                            더 많은 플레이리스트 보기 <ArrowRight className="w-4 h-4" />
                        </button>
                    </div>
                </section>

                {/* High Score Tracks */}
                <section className="hud-card hud-card-bottom rounded-xl p-4 md:p-6 mt-6">
                    <h2 className="text-lg font-bold text-hud-text-primary flex items-center gap-2 mb-4">
                        <Star className="w-5 h-5 text-hud-accent-success" fill="currentColor" />
                        고득점 트랙 (85점 이상)
                    </h2>

                    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {[
                            { title: 'Super Shy', artist: 'NewJeans', score: 98 },
                            { title: 'Butter', artist: 'BTS', score: 96 },
                            { title: 'Celebrity', artist: 'IU', score: 94 },
                            { title: 'FLOWER', artist: 'JISOO', score: 92 },
                            { title: 'Ditto', artist: 'NewJeans', score: 90 },
                            { title: 'OMG', artist: 'NewJeans', score: 88 },
                        ].map((track) => (
                            <div key={track.title} className="flex items-center gap-3 bg-hud-bg-secondary/50 rounded-lg p-3 hover:bg-hud-bg-hover transition-all cursor-pointer group">
                                <div className="w-10 h-10 bg-gradient-to-br from-hud-accent-success to-hud-accent-primary rounded-lg flex items-center justify-center shrink-0">
                                    <Music className="w-4 h-4 text-white" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="font-medium text-hud-text-primary text-sm truncate group-hover:text-hud-accent-primary transition-colors">{track.title}</div>
                                    <div className="text-xs text-hud-text-muted truncate">{track.artist}</div>
                                </div>
                                <span className="text-xs font-semibold text-hud-accent-success">{track.score}%</span>
                            </div>
                        ))}
                    </div>
                </section>
            </main>
        </div>
    )
}

export default GatewayMusicSpace
