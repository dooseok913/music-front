import MusicSidebar from '../../components/music/MusicSidebar'
import UploadZone from '../../components/music/UploadZone'
import { Filter, Search, Brain, Eye, Trash2, ArrowRight, RefreshCw, Link as LinkIcon, CheckCircle, AlertCircle, Loader2 } from 'lucide-react'
import { useState, useEffect, useCallback } from 'react'
import { playlistsApi, Playlist as ApiPlaylist } from '../../services/api/playlists'
import { tidalApi } from '../../services/api/tidal'

interface Playlist {
    id: number
    name: string
    source: string
    trackCount: number
    status: 'unverified' | 'processing' | 'ready'
    addedDate: string
}

// Map API response to UI format
const mapApiPlaylist = (p: ApiPlaylist): Playlist => ({
    id: p.id,
    name: p.title,
    source: p.sourceType === 'Platform' ? 'tidal' : p.sourceType === 'Upload' ? 'file' : 'url',
    trackCount: p.trackCount || 0,
    status: p.status === 'PTP' ? 'unverified' : p.status === 'PRP' ? 'processing' : 'ready',
    addedDate: new Date(p.createdAt).toLocaleDateString('ko-KR')
})

const ExternalMusicSpace = () => {
    const [playlists, setPlaylists] = useState<Playlist[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [selectedIds, setSelectedIds] = useState<number[]>([])
    const [searchTerm, setSearchTerm] = useState('')
    const [tidalConnected, setTidalConnected] = useState(false)
    const [syncing, setSyncing] = useState(false)

    // Fetch playlists from API
    const fetchPlaylists = useCallback(async () => {
        try {
            setLoading(true)
            setError(null)
            const response = await playlistsApi.getPlaylists('EMS')
            setPlaylists(response.playlists.map(mapApiPlaylist))
        } catch (err) {
            console.error('Failed to fetch playlists:', err)
            setError('플레이리스트를 불러오는데 실패했습니다')
            // Fallback to mock data
            setPlaylists([
                { id: 1, name: 'Summer Hits 2024', source: 'tidal', trackCount: 45, status: 'unverified', addedDate: '2024-01-20' },
                { id: 2, name: 'Chill Vibes Collection', source: 'file', trackCount: 32, status: 'processing', addedDate: '2024-01-21' },
                { id: 3, name: 'Rock Classics Mix', source: 'url', trackCount: 58, status: 'ready', addedDate: '2024-01-22' },
            ])
        } finally {
            setLoading(false)
        }
    }, [])

    // Check Tidal connection status
    const checkTidalStatus = useCallback(async () => {
        try {
            const status = await tidalApi.getAuthStatus()
            setTidalConnected(status.authenticated)
        } catch (err) {
            console.error('Failed to check Tidal status:', err)
            setTidalConnected(false)
        }
    }, [])

    useEffect(() => {
        fetchPlaylists()
        checkTidalStatus()
    }, [fetchPlaylists, checkTidalStatus])

    // Sync with Tidal
    const handleTidalSync = async () => {
        if (!tidalConnected) return
        setSyncing(true)
        try {
            // 1. Fetch featured playlists from Tidal
            const response = await tidalApi.getFeatured()
            const featuredPlaylists = response.featured.flatMap(f => f.playlists)

            console.log(`Found ${featuredPlaylists.length} playlists to sync`)

            // 2. Import each playlist to our backend
            let importedCount = 0
            for (const p of featuredPlaylists) {
                try {
                    await playlistsApi.importPlaylist({
                        platformPlaylistId: p.uuid,
                        title: p.title,
                        description: p.description || `Imported from Tidal (${p.creator?.name || 'Unknown'})`,
                        coverImage: p.squareImage,
                        platform: 'Tidal'
                    })
                    importedCount++
                } catch (err: any) {
                    // Ignore already imported errors (409)
                    if (err.response?.status !== 409) {
                        console.error(`Failed to import ${p.title}:`, err)
                    }
                }
            }

            console.log(`Successfully imported ${importedCount} playlists`)

            // 3. Refresh list
            await fetchPlaylists()
        } catch (err) {
            console.error('Sync failed:', err)
            setError('Tidal 동기화 중 오류가 발생했습니다')
        } finally {
            setSyncing(false)
        }
    }

    // Delete playlist
    const handleDelete = async (id: number) => {
        try {
            await playlistsApi.deletePlaylist(id)
            setPlaylists(prev => prev.filter(p => p.id !== id))
            setSelectedIds(prev => prev.filter(sid => sid !== id))
        } catch (err) {
            console.error('Delete failed:', err)
        }
    }

    // Move to GMS
    const handleMoveToGMS = async (id: number) => {
        try {
            await playlistsApi.movePlaylist(id, 'GMS')
            setPlaylists(prev => prev.filter(p => p.id !== id))
        } catch (err) {
            console.error('Move failed:', err)
        }
    }

    const handleSelectAll = (checked: boolean) => {
        setSelectedIds(checked ? playlists.map(p => p.id) : [])
    }

    const handleSelectRow = (id: number, checked: boolean) => {
        setSelectedIds(checked ? [...selectedIds, id] : selectedIds.filter(sid => sid !== id))
    }

    const filteredPlaylists = playlists.filter(p =>
        p.name.toLowerCase().includes(searchTerm.toLowerCase())
    )

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'unverified':
                return (
                    <span className="bg-hud-accent-warning/20 text-hud-accent-warning border border-hud-accent-warning/30 flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold">
                        <AlertCircle className="w-3.5 h-3.5" />
                        검증 필요
                    </span>
                )
            case 'processing':
                return (
                    <span className="bg-hud-accent-info/20 text-hud-accent-info border border-hud-accent-info/30 flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold">
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        처리 중
                    </span>
                )
            case 'ready':
                return (
                    <span className="bg-hud-accent-success/10 text-hud-accent-success border border-hud-accent-success/30 flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold">
                        <CheckCircle className="w-3.5 h-3.5" />
                        GMS 준비완료
                    </span>
                )
        }
    }

    return (
        <div className="min-h-screen bg-hud-bg-primary hud-grid-bg">
            <MusicSidebar />

            <main className="ml-0 md:ml-64 p-4 md:p-6">
                {/* Header */}
                <header className="mb-8">
                    <h1 className="text-3xl font-bold text-hud-accent-warning mb-2">The Cargo</h1>
                    <p className="text-hud-text-secondary mb-6">외부에서 가져온 검증되지 않은 플레이리스트를 수집하고 관리합니다</p>

                    <div className="flex gap-3">
                        <button className="bg-hud-bg-secondary border border-hud-border-secondary text-hud-text-primary px-4 py-2 rounded-lg font-medium flex items-center gap-2 hover:bg-hud-bg-hover transition-all">
                            <Filter className="w-4 h-4" />
                            Advanced Filter
                        </button>
                        <button className="bg-hud-accent-warning text-hud-bg-primary px-4 py-2 rounded-lg font-semibold flex items-center gap-2 hover:bg-hud-accent-warning/90 transition-all">
                            <LinkIcon className="w-4 h-4" />
                            Upload Files
                        </button>
                    </div>
                </header>

                {/* Upload Section */}
                <UploadZone />

                {/* Streaming Platforms */}
                <section className="hud-card hud-card-bottom rounded-xl p-6 mb-6 mt-6">
                    <h2 className="text-xl font-bold text-hud-text-primary flex items-center gap-3 mb-6">
                        <LinkIcon className="w-5 h-5 text-hud-accent-warning" />
                        스트리밍 플랫폼 연동
                    </h2>

                    <div className="grid md:grid-cols-3 gap-4">
                        {/* Tidal */}
                        <div className={`hud-card rounded-lg p-4 flex items-center gap-4 border-l-4 ${tidalConnected ? 'border-hud-accent-success' : 'border-hud-border-secondary'}`}>
                            <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-cyan-400 rounded-lg flex items-center justify-center text-white font-bold text-lg">T</div>
                            <div className="flex-1">
                                <div className="font-semibold text-hud-text-primary">Tidal</div>
                                <div className={`text-xs flex items-center gap-1 ${tidalConnected ? 'text-hud-accent-success' : 'text-hud-text-muted'}`}>
                                    {tidalConnected ? (
                                        <><CheckCircle className="w-3 h-3" /> 연결됨</>
                                    ) : (
                                        '연결되지 않음'
                                    )}
                                </div>
                            </div>
                            <button
                                onClick={handleTidalSync}
                                disabled={!tidalConnected || syncing}
                                className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all ${tidalConnected
                                    ? 'bg-hud-accent-success/20 border border-hud-accent-success/30 text-hud-accent-success hover:bg-hud-accent-success/30'
                                    : 'bg-hud-bg-secondary border border-hud-border-secondary text-hud-text-muted cursor-not-allowed'
                                    }`}
                            >
                                {syncing ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                                {syncing ? '동기화 중...' : '동기화'}
                            </button>
                        </div>

                        {/* YouTube Music */}
                        <div className="hud-card rounded-lg p-4 flex items-center gap-4 hover:border-hud-accent-primary transition-all cursor-pointer">
                            <div className="w-12 h-12 bg-gradient-to-br from-red-500 to-red-600 rounded-lg flex items-center justify-center text-white">▶</div>
                            <div className="flex-1">
                                <div className="font-semibold text-hud-text-primary">YouTube Music</div>
                                <div className="text-xs text-hud-text-muted">연결되지 않음</div>
                            </div>
                            <button className="px-3 py-1.5 bg-hud-accent-primary/20 border border-hud-accent-primary/30 rounded-lg text-hud-accent-primary text-xs font-medium hover:bg-hud-accent-primary/30 transition-all">
                                연결하기
                            </button>
                        </div>

                        {/* Apple Music */}
                        <div className="hud-card rounded-lg p-4 flex items-center gap-4 hover:border-hud-accent-primary transition-all cursor-pointer">
                            <div className="w-12 h-12 bg-gradient-to-br from-pink-500 to-rose-500 rounded-lg flex items-center justify-center text-white text-xl"></div>
                            <div className="flex-1">
                                <div className="font-semibold text-hud-text-primary">Apple Music</div>
                                <div className="text-xs text-hud-text-muted">연결되지 않음</div>
                            </div>
                            <button className="px-3 py-1.5 bg-hud-accent-primary/20 border border-hud-accent-primary/30 rounded-lg text-hud-accent-primary text-xs font-medium hover:bg-hud-accent-primary/30 transition-all">
                                연결하기
                            </button>
                        </div>
                    </div>
                </section>

                {/* Playlist Table */}
                <section className="hud-card hud-card-bottom rounded-xl p-6">
                    <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
                        <h2 className="text-xl font-bold text-hud-text-primary flex items-center gap-2">
                            외부 플레이리스트 목록
                            <span className="text-sm font-normal text-hud-text-muted">({filteredPlaylists.length}개)</span>
                        </h2>

                        <div className="relative">
                            <input
                                type="text"
                                placeholder="플레이리스트 검색..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="pl-10 pr-4 py-2 bg-hud-bg-secondary border border-hud-border-secondary rounded-lg text-hud-text-primary text-sm w-64 focus:outline-none focus:border-hud-accent-primary transition-colors placeholder-hud-text-muted"
                            />
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-hud-text-muted" />
                        </div>
                    </div>

                    {/* Loading/Error States */}
                    {loading && (
                        <div className="flex items-center justify-center py-12">
                            <Loader2 className="w-8 h-8 text-hud-accent-primary animate-spin" />
                        </div>
                    )}

                    {error && !loading && (
                        <div className="bg-hud-accent-warning/10 border border-hud-accent-warning/30 rounded-lg p-4 mb-4">
                            <p className="text-hud-accent-warning text-sm">{error} (Mock 데이터 표시 중)</p>
                        </div>
                    )}

                    {/* Table */}
                    {!loading && (
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead>
                                    <tr className="border-b border-hud-border-secondary">
                                        <th className="p-3 text-left w-10">
                                            <input
                                                type="checkbox"
                                                checked={selectedIds.length === filteredPlaylists.length && filteredPlaylists.length > 0}
                                                onChange={(e) => handleSelectAll(e.target.checked)}
                                                className="accent-hud-accent-primary"
                                            />
                                        </th>
                                        <th className="p-3 text-left text-xs font-semibold text-hud-accent-primary uppercase tracking-wider">이름</th>
                                        <th className="p-3 text-left text-xs font-semibold text-hud-accent-primary uppercase tracking-wider">소스</th>
                                        <th className="p-3 text-left text-xs font-semibold text-hud-accent-primary uppercase tracking-wider">트랙</th>
                                        <th className="p-3 text-left text-xs font-semibold text-hud-accent-primary uppercase tracking-wider">상태</th>
                                        <th className="p-3 text-left text-xs font-semibold text-hud-accent-primary uppercase tracking-wider">추가일</th>
                                        <th className="p-3 text-left text-xs font-semibold text-hud-accent-primary uppercase tracking-wider">작업</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-hud-border-secondary">
                                    {filteredPlaylists.map((playlist) => (
                                        <tr key={playlist.id} className="hover:bg-hud-accent-primary/5 transition-colors">
                                            <td className="p-3">
                                                <input
                                                    type="checkbox"
                                                    checked={selectedIds.includes(playlist.id)}
                                                    onChange={(e) => handleSelectRow(playlist.id, e.target.checked)}
                                                    className="accent-hud-accent-primary"
                                                />
                                            </td>
                                            <td className="p-3 font-medium text-hud-text-primary">{playlist.name}</td>
                                            <td className="p-3">
                                                <span className="text-xs text-hud-text-muted bg-hud-bg-secondary px-2 py-1 rounded">
                                                    {playlist.source === 'tidal' && '🎵 Tidal'}
                                                    {playlist.source === 'file' && '📁 File'}
                                                    {playlist.source === 'url' && '🔗 URL'}
                                                </span>
                                            </td>
                                            <td className="p-3 text-hud-text-secondary text-sm">{playlist.trackCount}</td>
                                            <td className="p-3">{getStatusBadge(playlist.status)}</td>
                                            <td className="p-3 text-hud-text-muted text-sm">{playlist.addedDate}</td>
                                            <td className="p-3">
                                                <div className="flex gap-1">
                                                    <button className="w-8 h-8 bg-hud-bg-secondary border border-hud-border-secondary rounded-lg flex items-center justify-center text-hud-text-muted hover:text-hud-accent-primary hover:border-hud-accent-primary/30 transition-all">
                                                        <Brain className="w-4 h-4" />
                                                    </button>
                                                    <button className="w-8 h-8 bg-hud-bg-secondary border border-hud-border-secondary rounded-lg flex items-center justify-center text-hud-text-muted hover:text-hud-accent-info hover:border-hud-accent-info/30 transition-all">
                                                        <Eye className="w-4 h-4" />
                                                    </button>
                                                    {playlist.status === 'ready' && (
                                                        <button
                                                            onClick={() => handleMoveToGMS(playlist.id)}
                                                            className="w-8 h-8 bg-hud-accent-success/20 border border-hud-accent-success/30 rounded-lg flex items-center justify-center text-hud-accent-success hover:bg-hud-accent-success/30 transition-all"
                                                        >
                                                            <ArrowRight className="w-4 h-4" />
                                                        </button>
                                                    )}
                                                    <button
                                                        onClick={() => handleDelete(playlist.id)}
                                                        className="w-8 h-8 bg-hud-bg-secondary border border-hud-border-secondary rounded-lg flex items-center justify-center text-hud-text-muted hover:text-hud-accent-danger hover:border-hud-accent-danger/30 transition-all"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </section>

                {/* Bulk Action Bar */}
                {selectedIds.length > 0 && (
                    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-hud-bg-secondary/95 backdrop-blur-md border border-hud-accent-primary/30 rounded-xl px-6 py-4 flex items-center gap-6 z-50 shadow-hud-glow">
                        <span className="text-hud-text-secondary text-sm">
                            <strong className="text-hud-accent-primary">{selectedIds.length}</strong>개 선택됨
                        </span>
                        <div className="flex gap-3">
                            <button className="px-4 py-2 bg-hud-accent-success/20 border border-hud-accent-success/30 rounded-lg text-hud-accent-success text-sm font-medium flex items-center gap-2 hover:bg-hud-accent-success/30 transition-all">
                                <Brain className="w-4 h-4" /> AI 분석
                            </button>
                            <button className="px-4 py-2 bg-hud-accent-danger/20 border border-hud-accent-danger/30 rounded-lg text-hud-accent-danger text-sm font-medium flex items-center gap-2 hover:bg-hud-accent-danger/30 transition-all">
                                <Trash2 className="w-4 h-4" /> 삭제
                            </button>
                            <button onClick={() => setSelectedIds([])} className="px-4 py-2 bg-hud-bg-secondary border border-hud-border-secondary rounded-lg text-hud-text-secondary text-sm font-medium hover:bg-hud-bg-hover transition-all">
                                선택 해제
                            </button>
                        </div>
                    </div>
                )}
            </main>
        </div>
    )
}

export default ExternalMusicSpace
