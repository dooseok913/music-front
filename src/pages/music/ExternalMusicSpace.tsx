import MusicSidebar from '../../components/music/MusicSidebar'
import UploadZone from '../../components/music/UploadZone'
import PlaylistDetailModal from '../../components/music/PlaylistDetailModal'
import { Filter, Search, Brain, Eye, Trash2, ArrowRight, RefreshCw, Link as LinkIcon, CheckCircle, AlertCircle, Loader2, Music2, ExternalLink } from 'lucide-react'
import { useState, useEffect, useCallback } from 'react'
import { playlistsApi, analysisApi, Playlist as ApiPlaylist } from '../../services/api/playlists'
import { tidalApi } from '../../services/api/tidal'
import { youtubeApi, YoutubePlaylist } from '../../services/api/youtube'
import { itunesService, ItunesTrack, ItunesCollection } from '../../services/api/itunes'
import { Plus, DownloadCloud } from 'lucide-react'

interface Playlist {
    id: number
    name: string
    source: string
    trackCount: number
    status: 'unverified' | 'processing' | 'ready'
    addedDate: string
}

// Map API response to UI format
const mapApiPlaylist = (p: ApiPlaylist): Playlist => {
    let source = 'tidal'
    if (p.sourceType === 'Upload') source = 'file'
    else if (p.sourceType === 'Platform') {
        const lowerDesc = (p.description || '').toLowerCase()
        if (lowerDesc.includes('youtube')) source = 'youtube'
        else if (lowerDesc.includes('apple') || lowerDesc.includes('itunes')) source = 'apple'
        else source = 'tidal'
    } else {
        source = 'url'
    }

    return {
        id: p.id,
        name: p.title,
        source,
        trackCount: p.trackCount || 0,
        status: p.status === 'PTP' ? 'unverified' : p.status === 'PRP' ? 'processing' : 'ready',
        addedDate: new Date(p.createdAt).toLocaleDateString('ko-KR')
    }
}

const ExternalMusicSpace = () => {
    const [playlists, setPlaylists] = useState<Playlist[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [selectedIds, setSelectedIds] = useState<number[]>([])
    const [searchTerm, setSearchTerm] = useState('')
    const [tidalConnected, setTidalConnected] = useState(false)
    const [tidalUserLoggedIn, setTidalUserLoggedIn] = useState(false)
    const [youtubeConnected, setYoutubeConnected] = useState(false)
    const [syncing, setSyncing] = useState(false)
    const [selectedDetailId, setSelectedDetailId] = useState<number | null>(null)

    // Toast notification state
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

    const showToast = (message: string, type: 'success' | 'error' = 'success') => {
        setToast({ message, type })
        setTimeout(() => setToast(null), 3000)
    }

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

    // Check Connections
    const checkConnections = useCallback(async () => {
        try {
            const tidal = await tidalApi.getAuthStatus()
            setTidalConnected(tidal.authenticated)
            setTidalUserLoggedIn(tidal.userConnected || false)

            const youtube = await youtubeApi.getAuthStatus()
            setYoutubeConnected(youtube.authenticated)
        } catch (err) {
            console.error('Failed to check connection status:', err)
        }
    }, [])

    useEffect(() => {
        fetchPlaylists()
        checkConnections()
    }, [fetchPlaylists, checkConnections])

    // Tidal Web Auth Handler (BYPASS / SIMULATION MODE)
    const handleWebLogin = () => {
        // Mock Login for UX verification
        console.log('Bypassing Tidal Auth for UI Verification')
        handleTidalLoginSuccess({ username: 'Test User (Bypass)' })
        /* 
        // Real logic preserved for later:
        const width = 500
        const height = 700
        ...
        */
    }

    // Handle Tidal Login Success
    const handleTidalLoginSuccess = (user: any) => {
        setTidalUserLoggedIn(true)
        showToast(`Tidal 연결 성공! (${user?.username || 'User'})`, 'success')
        checkConnections() // Refresh status
        // Auto sync will trigger via useEffect
    }

    // Sync with Tidal
    const handleTidalSync = async () => {
        if (!tidalUserLoggedIn) return
        setSyncing(true)
        try {
            // 1. Fetch featured playlists from Tidal
            const response = await tidalApi.getFeatured()
            const featuredPlaylists = response.featured.flatMap(f => f.playlists)

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
                    if (err.response?.status !== 409) console.error(err)
                }
            }
            await fetchPlaylists()
        } catch (err) {
            console.error('Tidal Sync failed:', err)
        } finally {
            setSyncing(false)
        }
    }

    // Sync with YouTube
    const handleYoutubeSync = async () => {
        if (!youtubeConnected) return
        setSyncing(true)
        try {
            const response = await youtubeApi.getPlaylists()

            let importedCount = 0
            for (const p of response.playlists) {
                try {
                    await playlistsApi.importPlaylist({
                        platformPlaylistId: p.id,
                        title: p.title,
                        description: p.description,
                        coverImage: p.thumbnail,
                        platform: 'YouTube'
                    })
                    importedCount++
                } catch (err: any) {
                    if (err.response?.status !== 409) console.error(err)
                }
            }
            if (importedCount > 0) await fetchPlaylists()
        } catch (err) {
            console.error('YouTube Sync failed:', err)
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

    // --- YouTube Search Logic ---
    const [youtubeSearchTerm, setYoutubeSearchTerm] = useState('')
    const [youtubeResults, setYoutubeResults] = useState<YoutubePlaylist[]>([])
    const [isYoutubeSearching, setIsYoutubeSearching] = useState(false)
    const [importingYoutubeId, setImportingYoutubeId] = useState<string | null>(null)

    const handleYoutubeSearch = async () => {
        if (!youtubeSearchTerm.trim()) return
        setIsYoutubeSearching(true)
        try {
            const response = await youtubeApi.searchPlaylists(youtubeSearchTerm)
            setYoutubeResults(response.playlists)
        } catch (err) {
            console.error('YouTube search failed:', err)
            showToast('YouTube 검색 실패', 'error')
        } finally {
            setIsYoutubeSearching(false)
        }
    }

    const handleYoutubeImport = async (playlist: YoutubePlaylist) => {
        setImportingYoutubeId(playlist.id)
        try {
            await playlistsApi.importPlaylist({
                platformPlaylistId: playlist.id,
                title: playlist.title,
                description: playlist.description || `Imported from YouTube (${playlist.channelTitle})`,
                coverImage: playlist.thumbnail,
                platform: 'YouTube'
            })
            showToast(`'${playlist.title}' 플레이리스트를 가져왔습니다.`, 'success')
            fetchPlaylists()
            // Remove from results
            setYoutubeResults(prev => prev.filter(p => p.id !== playlist.id))
        } catch (err: any) {
            if (err.message?.includes('409')) {
                showToast('이미 가져온 플레이리스트입니다.', 'error')
            } else {
                console.error('YouTube import failed:', err)
                showToast('플레이리스트 가져오기 실패', 'error')
            }
        } finally {
            setImportingYoutubeId(null)
        }
    }

    // --- Music Search Logic ---
    const [trackSearchTerm, setTrackSearchTerm] = useState('')
    const [trackResults, setTrackResults] = useState<ItunesTrack[]>([])
    const [isSearching, setIsSearching] = useState(false)

    const handleSearch = async () => {
        if (!trackSearchTerm.trim()) return
        setIsSearching(true)
        try {
            const results = await itunesService.search(trackSearchTerm)
            setTrackResults(results)
        } catch (err) {
            console.error(err)
            showToast('음악 검색 실패', 'error')
        } finally {
            setIsSearching(false)
        }
    }

    const handleAddTrack = async (track: ItunesTrack) => {
        if (selectedIds.length === 0) {
            showToast('트랙을 추가할 플레이리스트를 먼저 선택해주세요', 'error')
            return
        }

        // Add to all selected playlists
        let successCount = 0
        for (const playlistId of selectedIds) {
            try {
                await playlistsApi.addTrack(playlistId, track)
                successCount++
            } catch (err) {
                console.error(`Failed to add to playlist ${playlistId}`, err)
            }
        }

        if (successCount > 0) {
            showToast(`${successCount}개 플레이리스트에 곡이 추가되었습니다.`, 'success')
            fetchPlaylists() // Refresh counts
        }
    }

    // --- Recommendations Logic ---
    const [recommendations, setRecommendations] = useState<ItunesCollection[]>([])
    const [classicRecs, setClassicRecs] = useState<ItunesCollection[]>([])
    const [jazzRecs, setJazzRecs] = useState<ItunesCollection[]>([])
    const [kpopRecs, setKpopRecs] = useState<ItunesCollection[]>([])
    const [importingId, setImportingId] = useState<number | null>(null)

    useEffect(() => {
        const fetchRecommendations = async () => {
            try {
                const [mixed, classic, jazz, kpop] = await Promise.all([
                    itunesService.getRecommendations(), // Mixed
                    itunesService.getRecommendations('Classical'),
                    itunesService.getRecommendations('Vocal Jazz'),
                    itunesService.getRecommendations('K-Pop')
                ])
                setRecommendations(mixed)
                setClassicRecs(classic)
                setJazzRecs(jazz)
                setKpopRecs(kpop)
            } catch (err) {
                console.error('Failed to load recommendations', err)
            }
        }
        fetchRecommendations()
    }, [])

    const handleImportAlbum = async (collection: ItunesCollection) => {
        setImportingId(collection.id)
        try {
            // 1. Get detailed tracks
            const albumDetails = await itunesService.getAlbum(collection.id)

            // 2. Create playlist and add tracks
            const result = await playlistsApi.importAlbumAsPlaylist({
                title: collection.title,
                artist: collection.artist,
                coverImage: collection.artwork,
                tracks: albumDetails.tracks
            })

            showToast(`'${collection.title}' (${result.count}곡) 가져오기 완료`, 'success')
            // Remove from recommendations (Optimistic update)
            setRecommendations(prev => prev.filter(r => r.id !== collection.id))
            setClassicRecs(prev => prev.filter(r => r.id !== collection.id))
            setJazzRecs(prev => prev.filter(r => r.id !== collection.id))
            setKpopRecs(prev => prev.filter(r => r.id !== collection.id))

            fetchPlaylists()
        } catch (err) {
            console.error('Import failed', err)
            showToast('앨범 가져오기 실패', 'error')
        } finally {
            setImportingId(null)
        }
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

    // AI State
    const [isTraining, setIsTraining] = useState(false)
    const [lastTrained, setLastTrained] = useState<Date | null>(null)
    const [analyzingId, setAnalyzingId] = useState<number | null>(null)

    // Train Model (simulated or real)
    const trainModel = async () => {
        setIsTraining(true)
        try {
            await analysisApi.train()
            setLastTrained(new Date())
            console.log('AI Model Retrained with new data')
        } catch (err) {
            console.error('Training failed', err)
        } finally {
            setIsTraining(false)
        }
    }

    // Auto-sync Tidal when connected
    useEffect(() => {
        const syncAndTrain = async () => {
            if (tidalConnected && !syncing) {
                await handleTidalSync()
                await trainModel() // Train after sync
            }
        }
        if (tidalUserLoggedIn) {
            syncAndTrain()
        }
    }, [tidalUserLoggedIn])

    // Analyze Playlist
    const handleAnalyze = async (id: number) => {
        setAnalyzingId(id)
        try {
            const result = await analysisApi.evaluate(id)
            showToast(`AI 분석 완료: ${result.grade}등급 (${result.score}점)`, 'success')
            fetchPlaylists() // Refresh to show new status
        } catch (err) {
            console.error('Analysis failed', err)
            showToast('분석 실패', 'error')
        } finally {
            setAnalyzingId(null)
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



                {/* Recommended Playlists (Auto Discovery - Genre Tiles) */}
                {[
                    { title: '오늘의 추천 믹스 (Auto Discovery)', data: recommendations, icon: <Brain className="w-5 h-5 text-hud-accent-primary" /> },
                    { title: 'Classical Essentials', data: classicRecs, icon: <Brain className="w-5 h-5 text-hud-accent-warning" /> },
                    { title: 'Vocal Jazz Collection', data: jazzRecs, icon: <Music2 className="w-5 h-5 text-hud-accent-info" /> },
                    { title: 'K-Pop Trends', data: kpopRecs, icon: <ExternalLink className="w-5 h-5 text-hud-accent-success" /> }
                ].map((section, idx) => section.data.length > 0 && (
                    <section key={idx} className="hud-card hud-card-bottom rounded-xl p-6 mb-6 mt-6">
                        <h2 className="text-xl font-bold text-hud-text-primary flex items-center gap-3 mb-6">
                            {section.icon}
                            {section.title}
                            <span className="text-sm font-normal text-hud-text-muted ml-2">
                                (iTunes Auto Discovery)
                            </span>
                        </h2>

                        <div className="flex overflow-x-auto gap-4 pb-4 custom-scrollbar">
                            {section.data.map((album) => (
                                <div key={album.id} className="min-w-[200px] w-[200px] bg-hud-bg-secondary border border-hud-border-secondary rounded-lg p-3 hover:border-hud-accent-warning/50 transition-all flex flex-col group">
                                    <div className="relative aspect-square mb-3 rounded-md overflow-hidden">
                                        <img src={album.artwork} alt={album.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                            <button
                                                onClick={() => handleImportAlbum(album)}
                                                disabled={importingId === album.id}
                                                className="bg-hud-accent-warning text-hud-bg-primary px-4 py-2 rounded-full font-bold flex items-center gap-2 transform translate-y-2 group-hover:translate-y-0 transition-all"
                                            >
                                                {importingId === album.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <DownloadCloud className="w-4 h-4" />}
                                                {importingId === album.id ? '가져오는 중...' : '가져오기'}
                                            </button>
                                        </div>
                                    </div>
                                    <div className="font-bold text-hud-text-primary truncate" title={album.title}>{album.title}</div>
                                    <div className="text-sm text-hud-text-secondary truncate">{album.artist}</div>
                                    <div className="text-xs text-hud-text-muted mt-1 flex justify-between">
                                        <span>{album.genre}</span>
                                        <span>{album.count}곡</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>
                ))}

                {/* Streaming Platforms */}
                <section className="hud-card hud-card-bottom rounded-xl p-6 mb-6 mt-6">
                    <h2 className="text-xl font-bold text-hud-text-primary flex items-center gap-3 mb-6">
                        <LinkIcon className="w-5 h-5 text-hud-accent-warning" />
                        스트리밍 플랫폼 연동
                    </h2>

                    <div className="grid md:grid-cols-3 gap-4">
                        {/* Tidal */}
                        <div
                            className={`hud-card rounded-lg p-4 flex items-center gap-4 border-l-4 transition-all ${tidalUserLoggedIn
                                ? 'border-hud-accent-success bg-hud-accent-success/5'
                                : 'border-hud-border-secondary'
                                }`}
                        >
                            <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-cyan-400 rounded-lg flex items-center justify-center text-white font-bold text-lg">T</div>
                            <div className="flex-1">
                                <div className="font-semibold text-hud-text-primary">Tidal</div>
                                <div className="text-xs mt-0.5">
                                    {tidalUserLoggedIn ? (
                                        <span className="text-hud-accent-success flex items-center gap-1">
                                            <CheckCircle className="w-3 h-3" /> 로그인됨 {syncing && '(동기화 중...)'}
                                        </span>
                                    ) : (
                                        <span className="text-hud-text-secondary">로그인이 필요합니다</span>
                                    )}
                                </div>
                            </div>
                            {!tidalUserLoggedIn && (
                                <button
                                    onClick={handleWebLogin}
                                    className="px-4 py-2 bg-hud-bg-secondary border border-hud-border-secondary rounded-lg text-sm font-bold text-hud-text-primary hover:bg-hud-bg-hover hover:border-hud-accent-info hover:text-hud-accent-info transition-all shadow-sm"
                                >
                                    Connect
                                </button>
                            )}
                        </div>

                        {/* YouTube Music */}
                        <div className={`hud-card rounded-lg p-4 flex items-center gap-4 border-l-4 ${youtubeConnected ? 'border-hud-accent-success' : 'border-hud-border-secondary'}`}>
                            <div className="w-12 h-12 bg-gradient-to-br from-red-500 to-red-600 rounded-lg flex items-center justify-center text-white">▶</div>
                            <div className="flex-1">
                                <div className="font-semibold text-hud-text-primary">YouTube Music</div>
                                <div className={`text-xs flex items-center gap-1 ${youtubeConnected ? 'text-hud-accent-success' : 'text-hud-text-muted'}`}>
                                    {youtubeConnected ? (
                                        <><CheckCircle className="w-3 h-3" /> 연결됨</>
                                    ) : (
                                        'API 연결 확인 중...'
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Apple Music */}
                        <div className="hud-card rounded-lg p-4 flex items-center gap-4 hover:border-hud-accent-primary transition-all cursor-pointer">
                            <div className="w-12 h-12 bg-gradient-to-br from-pink-500 to-rose-500 rounded-lg flex items-center justify-center text-white text-xl"></div>
                            <div className="flex-1">
                                <div className="font-semibold text-hud-text-primary">Apple Music</div>
                                <div className="text-xs text-hud-text-muted">연결되지 않음</div>
                            </div>
                        </div>
                    </div>
                </section>

                {/* YouTube Playlist Search Section */}
                {youtubeConnected && (
                    <section className="hud-card hud-card-bottom rounded-xl p-6 mb-6">
                        <h2 className="text-xl font-bold text-hud-text-primary flex items-center gap-3 mb-6">
                            <Search className="w-5 h-5 text-red-500" />
                            YouTube 플레이리스트 검색
                            <span className="text-sm font-normal text-hud-text-muted ml-2">
                                (공개 플레이리스트 검색 및 가져오기)
                            </span>
                        </h2>

                        <div className="flex gap-2 mb-6">
                            <input
                                type="text"
                                placeholder="플레이리스트 검색 (예: K-Pop, 운동 음악, 공부 BGM)"
                                value={youtubeSearchTerm}
                                onChange={(e) => setYoutubeSearchTerm(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleYoutubeSearch()}
                                className="flex-1 px-4 py-2 bg-hud-bg-secondary border border-hud-border-secondary rounded-lg text-hud-text-primary focus:outline-none focus:border-red-500 placeholder-hud-text-muted"
                            />
                            <button
                                onClick={handleYoutubeSearch}
                                disabled={isYoutubeSearching}
                                className="bg-red-500 text-white px-6 py-2 rounded-lg font-semibold hover:bg-red-600 transition-all flex items-center gap-2"
                            >
                                {isYoutubeSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                                검색
                            </button>
                        </div>

                        {youtubeResults.length > 0 && (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
                                {youtubeResults.map((playlist) => (
                                    <div key={playlist.id} className="bg-hud-bg-secondary border border-hud-border-secondary rounded-lg overflow-hidden group hover:border-red-500/50 transition-all">
                                        <div className="relative aspect-video">
                                            {playlist.thumbnail ? (
                                                <img src={playlist.thumbnail} alt={playlist.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                                            ) : (
                                                <div className="w-full h-full bg-hud-bg-primary flex items-center justify-center">
                                                    <span className="text-4xl">🎵</span>
                                                </div>
                                            )}
                                            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                                <button
                                                    onClick={() => handleYoutubeImport(playlist)}
                                                    disabled={importingYoutubeId === playlist.id}
                                                    className="bg-red-500 text-white px-4 py-2 rounded-full font-bold flex items-center gap-2 transform translate-y-2 group-hover:translate-y-0 transition-all hover:bg-red-600"
                                                >
                                                    {importingYoutubeId === playlist.id ? (
                                                        <><Loader2 className="w-4 h-4 animate-spin" /> 가져오는 중...</>
                                                    ) : (
                                                        <><DownloadCloud className="w-4 h-4" /> 가져오기</>
                                                    )}
                                                </button>
                                            </div>
                                        </div>
                                        <div className="p-3">
                                            <div className="font-bold text-hud-text-primary truncate" title={playlist.title}>{playlist.title}</div>
                                            <div className="text-sm text-hud-text-secondary truncate">{playlist.channelTitle}</div>
                                            <div className="text-xs text-hud-text-muted mt-1 truncate" title={playlist.description}>
                                                {playlist.description || '설명 없음'}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {youtubeResults.length === 0 && !isYoutubeSearching && youtubeSearchTerm && (
                            <div className="text-center py-8 text-hud-text-muted">
                                검색 결과가 없습니다. 다른 키워드로 검색해 보세요.
                            </div>
                        )}
                    </section>
                )}

                {/* Music Search Section */}
                <section className="hud-card hud-card-bottom rounded-xl p-6 mb-6">
                    <h2 className="text-xl font-bold text-hud-text-primary flex items-center gap-3 mb-6">
                        <Search className="w-5 h-5 text-hud-accent-info" />
                        음악 검색 및 추가
                        <span className="text-sm font-normal text-hud-text-muted ml-2">
                            (체크된 플레이리스트에 곡을 추가합니다)
                        </span>
                    </h2>

                    <div className="flex gap-2 mb-6">
                        <input
                            type="text"
                            placeholder="노래 제목, 아티스트 검색 (예: NewJeans)"
                            value={trackSearchTerm}
                            onChange={(e) => setTrackSearchTerm(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                            className="flex-1 px-4 py-2 bg-hud-bg-secondary border border-hud-border-secondary rounded-lg text-hud-text-primary focus:outline-none focus:border-hud-accent-info placeholder-hud-text-muted"
                        />
                        <button
                            onClick={handleSearch}
                            disabled={isSearching}
                            className="bg-hud-accent-info text-hud-bg-primary px-6 py-2 rounded-lg font-semibold hover:bg-hud-accent-info/90 transition-all flex items-center gap-2"
                        >
                            {isSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                            검색
                        </button>
                    </div>

                    {trackResults.length > 0 && (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                            {trackResults.map((track) => (
                                <div key={track.id} className="bg-hud-bg-secondary border border-hud-border-secondary rounded-lg p-3 flex items-center gap-3 group hover:border-hud-accent-info/50 transition-all">
                                    <img src={track.artwork} alt={track.title} className="w-16 h-16 rounded-md object-cover" />
                                    <div className="flex-1 min-w-0">
                                        <div className="font-bold text-hud-text-primary truncate">{track.title}</div>
                                        <div className="text-sm text-hud-text-secondary truncate">{track.artist}</div>
                                        <div className="text-xs text-hud-text-muted truncate">{track.album}</div>
                                    </div>
                                    <button
                                        onClick={() => handleAddTrack(track)}
                                        className="p-2 bg-hud-bg-primary border border-hud-border-secondary rounded-full text-hud-text-muted hover:text-hud-accent-success hover:border-hud-accent-success hover:bg-hud-accent-success/10 transition-all"
                                        title="선택된 플레이리스트에 추가"
                                    >
                                        <Plus className="w-5 h-5" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
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
                                                <span className={`text-xs px-2 py-1 rounded border ${playlist.source === 'tidal' ? 'bg-black/10 text-black border-black/20 dark:bg-white/10 dark:text-white dark:border-white/20' :
                                                    playlist.source === 'youtube' ? 'bg-red-500/10 text-red-600 border-red-500/20' :
                                                        playlist.source === 'apple' ? 'bg-pink-500/10 text-pink-600 border-pink-500/20' :
                                                            'bg-hud-bg-secondary text-hud-text-muted border-hud-border-secondary'
                                                    }`}>
                                                    {playlist.source === 'tidal' && '🎵 Tidal'}
                                                    {playlist.source === 'youtube' && '▶ YouTube'}
                                                    {playlist.source === 'apple' && '🍎 Apple'}
                                                    {playlist.source === 'file' && '📁 File'}
                                                    {playlist.source === 'url' && '🔗 URL'}
                                                </span>
                                            </td>
                                            <td className="p-3 text-hud-text-secondary text-sm">{playlist.trackCount}</td>
                                            <td className="p-3">{getStatusBadge(playlist.status)}</td>
                                            <td className="p-3 text-hud-text-muted text-sm">{playlist.addedDate}</td>
                                            <td className="p-3">
                                                <div className="flex gap-1">
                                                    <button
                                                        onClick={() => handleAnalyze(playlist.id)}
                                                        disabled={analyzingId === playlist.id || playlist.status === 'ready'}
                                                        className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${playlist.status === 'ready'
                                                            ? 'bg-hud-accent-success/20 text-hud-accent-success border border-hud-accent-success/30'
                                                            : 'bg-hud-bg-secondary border border-hud-border-secondary text-hud-text-muted hover:text-hud-accent-primary hover:border-hud-accent-primary/30'
                                                            }`}
                                                        title={playlist.status === 'ready' ? '검증 완료' : 'AI 분석 실행'}
                                                    >
                                                        {analyzingId === playlist.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Brain className="w-4 h-4" />}
                                                    </button>
                                                    <button
                                                        onClick={() => setSelectedDetailId(playlist.id)}
                                                        className="w-8 h-8 bg-hud-bg-secondary border border-hud-border-secondary rounded-lg flex items-center justify-center text-hud-text-muted hover:text-hud-accent-info hover:border-hud-accent-info/30 transition-all"
                                                        title="트랙 목록 보기"
                                                    >
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

                {/* Toast Notification */}
                {toast && (
                    <div className={`fixed top-6 right-6 z-50 px-6 py-4 rounded-xl shadow-lg backdrop-blur-md flex items-center gap-3 animate-slide-in-right ${toast.type === 'success'
                        ? 'bg-hud-accent-success/90 text-white border border-hud-accent-success'
                        : 'bg-hud-accent-danger/90 text-white border border-hud-accent-danger'
                        }`}>
                        {toast.type === 'success' ? (
                            <CheckCircle className="w-5 h-5" />
                        ) : (
                            <AlertCircle className="w-5 h-5" />
                        )}
                        <span className="font-medium">{toast.message}</span>
                        <button
                            onClick={() => setToast(null)}
                            className="ml-2 opacity-70 hover:opacity-100 transition-opacity"
                        >
                            ✕
                        </button>
                    </div>
                )}
            </main>

            <PlaylistDetailModal
                isOpen={!!selectedDetailId}
                onClose={() => setSelectedDetailId(null)}
                playlistId={selectedDetailId}
            />
        </div>
    )
}

export default ExternalMusicSpace
