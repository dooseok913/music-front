import MusicSidebar from '../../components/music/MusicSidebar'
import UploadZone from '../../components/music/UploadZone'
import PlaylistDetailModal from '../../components/music/PlaylistDetailModal'
import { Filter, Search, Brain, Eye, Trash2, ArrowRight, RefreshCw, Link as LinkIcon, CheckCircle, AlertCircle, Loader2, Music2, ExternalLink, Sparkles, ShoppingBag, X, Save } from 'lucide-react'
import { useState, useEffect, useCallback } from 'react'
import { playlistsApi, analysisApi, Playlist as ApiPlaylist } from '../../services/api/playlists'
import { tidalApi } from '../../services/api/tidal'
import { youtubeApi, YoutubePlaylist } from '../../services/api/youtube'
import { itunesService, ItunesTrack, ItunesCollection } from '../../services/api/itunes'
import { appleMusicApi, AppleMusicItem } from '../../services/api/apple'
import { Plus, DownloadCloud, Disc3, TrendingUp, Headphones } from 'lucide-react'

const getStatusBadge = (status: string) => {
    switch (status) {
        case 'ready':
            return <span className="inline-flex px-2 py-1 rounded bg-hud-accent-success/20 text-hud-accent-success text-xs font-medium border border-hud-accent-success/30">Ready</span>
        case 'processing':
            return <span className="inline-flex px-2 py-1 rounded bg-hud-accent-info/20 text-hud-accent-info text-xs font-medium border border-hud-accent-info/30">Processing</span>
        case 'unverified':
        default:
            return <span className="inline-flex px-2 py-1 rounded bg-hud-accent-warning/20 text-hud-accent-warning text-xs font-medium border border-hud-accent-warning/30">Unverified</span>
    }
}

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

    // Music Search & Apple Music State
    const [trackSearchTerm, setTrackSearchTerm] = useState('')
    const [trackResults, setTrackResults] = useState<ItunesTrack[]>([])
    const [isSearching, setIsSearching] = useState(false)
    const [newReleases, setNewReleases] = useState<{ songs: AppleMusicItem[], playlists: AppleMusicItem[], albums: AppleMusicItem[] }>({ songs: [], playlists: [], albums: [] })
    const [importingAppleId, setImportingAppleId] = useState<string | null>(null)
    const [isAutoImporting, setIsAutoImporting] = useState(false)

    // Recommendations State
    const [recommendations, setRecommendations] = useState<ItunesCollection[]>([])
    const [classicRecs, setClassicRecs] = useState<ItunesCollection[]>([])
    const [jazzRecs, setJazzRecs] = useState<ItunesCollection[]>([])
    const [kpopRecs, setKpopRecs] = useState<ItunesCollection[]>([])
    const [importingId, setImportingId] = useState<number | null>(null)

    // Toast notification state
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

    // Spotify Special Event State
    const [spotifySpecial, setSpotifySpecial] = useState<{
        event: { title: string; subtitle: string; description: string };
        stats: { totalPlaylists: number; totalTracks: number; hotTracks: number };
        categories: Record<string, any[]>;
        hotTracks: any[];
        playlists: any[];
    } | null>(null)

    const showToast = (message: string, type: 'success' | 'error' = 'success') => {
        setToast({ message, type })
        setTimeout(() => setToast(null), 3000)
    }

    // Fetch playlists from API
    const fetchPlaylists = useCallback(async () => {
        try {
            setLoading(true)
            setError(null)

            // Auto-seed on first load (imports Tidal/iTunes playlists if empty)
            try {
                const seedResult = await playlistsApi.seedPlaylists()
                if (seedResult.imported > 0) {
                    showToast(`${seedResult.imported}개 플레이리스트 자동 로드 완료!`, 'success')
                }
            } catch (seedErr) {
                console.log('Seed skipped:', seedErr)
            }

            const response = await playlistsApi.getPlaylists('EMS')
            setPlaylists(response.playlists.map(mapApiPlaylist))
        } catch (err) {
            console.error('Failed to fetch playlists:', err)
            setError('플레이리스트를 불러오는데 실패했습니다')
            setPlaylists([])
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

    // Load Spotify Special Event
    useEffect(() => {
        const fetchSpotifySpecial = async () => {
            try {
                const res = await fetch('/api/ems/spotify-special')
                if (res.ok) {
                    const data = await res.json()
                    setSpotifySpecial(data)
                }
            } catch (e) {
                console.error('Failed to load Spotify Special:', e)
            }
        }
        fetchSpotifySpecial()
    }, [])

    // Load Apple Music New Releases AND Auto-Import to DB
    useEffect(() => {
        const loadAndImportAppleNew = async () => {
            try {
                // 1. Fetch Real Data from Apple Music
                const data = await appleMusicApi.getNewReleases()
                setNewReleases(data as any)

                // 2. Auto-Import Everything to DB (Batch Process)
                if (data.songs.length > 0 || data.playlists.length > 0) {
                    setIsAutoImporting(true)
                    showToast('Apple Music 데이터를 DB에 자동 저장 중...', 'success')

                    let importedCount = 0

                    // Import Playlists
                    for (const playlist of data.playlists) {
                        try {
                            // Create Playlist PTP
                            const createResult = await playlistsApi.importPlaylist({
                                platformPlaylistId: playlist.id,
                                title: playlist.attributes.name,
                                description: playlist.attributes.editorialNotes?.short || 'Apple Music Auto-Import',
                                coverImage: playlist.attributes.artwork?.url.replace('{w}', '600').replace('{h}', '600'),
                                platform: 'Apple Music'
                            })
                            importedCount++

                            // Import Tracks for this playlist (Best effort)
                            try {
                                const tracksData = await appleMusicApi.getTracks(playlist.id, 'playlists')
                                for (const t of tracksData) {
                                    if (t.type === 'songs') {
                                        await playlistsApi.addTrack(createResult.playlist.id, {
                                            title: t.attributes.name,
                                            artist: t.attributes.artistName,
                                            album: t.attributes.albumName || '',
                                            artwork: t.attributes.artwork?.url.replace('{w}', '300').replace('{h}', '300'),
                                            externalMetadata: {
                                                appleMusicId: t.id,
                                                previewUrl: (t.attributes.previews && t.attributes.previews[0]) ? t.attributes.previews[0].url : undefined
                                            }
                                        })
                                    }
                                }
                            } catch (e) { console.warn('Track import failed for playlist', playlist.id) }

                        } catch (e) {
                            // Ignore duplicates (409)
                        }
                    }

                    // Import Top Songs as a Single "Apple Music Top Chart" Playlist
                    if (data.songs.length > 0) {
                        try {
                            const today = new Date().toLocaleDateString('ko-KR')
                            const chartPlaylist = await playlistsApi.create({
                                title: `Apple Music Top 20 (${today})`,
                                description: 'Auto-imported Top Charts',
                                sourceType: 'Platform',
                                spaceType: 'EMS',
                                status: 'PTP',
                                coverImage: data.songs[0].attributes.artwork?.url.replace('{w}', '600').replace('{h}', '600')
                            })

                            for (const song of data.songs) {
                                await playlistsApi.addTrack(chartPlaylist.id, {
                                    title: song.attributes.name,
                                    artist: song.attributes.artistName,
                                    album: song.attributes.albumName,
                                    artwork: song.attributes.artwork?.url.replace('{w}', '300').replace('{h}', '300'),
                                    externalMetadata: {
                                        appleMusicId: song.id,
                                        previewUrl: (song.attributes.previews && song.attributes.previews[0]) ? song.attributes.previews[0].url : undefined
                                    }
                                })
                            }
                            importedCount++
                        } catch (e) { console.warn('Chart playlist creation failed', e) }
                    }

                    if (importedCount > 0) {
                        showToast(`Apple Music 데이터 ${importedCount}개 세트 DB 저장 완료`, 'success')
                        fetchPlaylists() // Refresh UI list
                    }
                    setIsAutoImporting(false)
                }

            } catch (e) {
                console.error('Failed to load/import Apple Music:', e)
                setIsAutoImporting(false)
            }
        }
        loadAndImportAppleNew()
    }, [])

    // Load Recommendations
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

    // Tidal Web Auth Handler
    const handleWebLogin = () => {
        const width = 500
        const height = 700
        const left = window.screenX + (window.outerWidth - width) / 2
        const top = window.screenY + (window.outerHeight - height) / 2

        const popup = window.open(
            `${window.location.origin}/api/tidal/auth/login`,
            'TidalLogin',
            `width=${width},height=${height},left=${left},top=${top},toolbar=no,menubar=no`
        )

        const handleMessage = (event: MessageEvent) => {
            if (event.data?.type === 'TIDAL_LOGIN_SUCCESS') {
                handleTidalLoginSuccess(event.data.user)
                window.removeEventListener('message', handleMessage)
            }
        }
        window.addEventListener('message', handleMessage)

        const checkPopup = setInterval(() => {
            if (popup?.closed) {
                clearInterval(checkPopup)
                window.removeEventListener('message', handleMessage)
            }
        }, 1000)
    }

    const handleTidalLoginSuccess = (user: any) => {
        setTidalUserLoggedIn(true)
        showToast(`Tidal 연결 성공! (${user?.username || 'User'})`, 'success')
        checkConnections()
    }

    const handleTidalSync = async () => {
        if (!tidalUserLoggedIn) return
        setSyncing(true)
        try {
            const response = await tidalApi.getFeatured()
            const featuredPlaylists = response.featured.flatMap(f => f.playlists)

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

    const handleDelete = async (id: number) => {
        try {
            await playlistsApi.deletePlaylist(id)
            setPlaylists(prev => prev.filter(p => p.id !== id))
            setSelectedIds(prev => prev.filter(sid => sid !== id))
        } catch (err) {
            console.error('Delete failed:', err)
        }
    }

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

    // --- Track Cart Logic ---
    const [cartTracks, setCartTracks] = useState<ItunesTrack[]>([])
    const [isCartOpen, setIsCartOpen] = useState(false)

    const addToCart = (track: ItunesTrack) => {
        if (cartTracks.some(t => t.id === track.id)) {
            showToast('이미 카트에 담긴 곡입니다.', 'error')
            return
        }
        setCartTracks(prev => [...prev, track])
        showToast('카트에 담았습니다.', 'success')
    }

    const removeFromCart = (trackId: number) => {
        setCartTracks(prev => prev.filter(t => t.id !== trackId))
    }

    const saveCartToPlaylist = async () => {
        if (cartTracks.length === 0) return

        try {
            const today = new Date().toLocaleDateString('ko-KR')
            const title = `EMS Collection (${today})`

            const createResult = await playlistsApi.create({
                title: title,
                description: `Created from EMS Search Cart (${cartTracks.length} tracks)`,
                sourceType: 'Upload',
                spaceType: 'EMS',
                status: 'PTP',
                coverImage: cartTracks[0].artwork
            })

            let successCount = 0
            for (const track of cartTracks) {
                await playlistsApi.addTrack(createResult.id, {
                    title: track.title,
                    artist: track.artist,
                    album: track.album,
                    artwork: track.artwork,
                    externalMetadata: {
                        appleMusicId: track.id.toString(),
                        previewUrl: track.previewUrl
                    }
                })
                successCount++
            }

            showToast(`'${title}' 생성 완료 (${successCount}곡)`, 'success')
            setCartTracks([])
            setIsCartOpen(false)
            fetchPlaylists()

        } catch (err) {
            console.error('Save cart failed', err)
            showToast('저장 실패', 'error')
        }
    }

    // --- Music Search ---
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

    // --- View Detail (Sync & Open Modal) ---
    const handleViewDetail = async (appleId: string, title: string, type: 'songs' | 'playlists' | 'albums' = 'playlists') => {
        let targetId: number | null = null

        // 1. Find existing playlist
        const match = playlists.find(p => p.name === title)

        if (match) {
            targetId = match.id
        } else {
            // 2. Create if missing
            try {
                showToast('플레이리스트 정보를 DB에 저장 중...', 'success')
                let item: any
                if (type === 'playlists') item = newReleases.playlists.find(p => p.id === appleId)
                else if (type === 'albums') item = newReleases.albums.find(p => p.id === appleId)

                const createResult = await playlistsApi.create({
                    title: title,
                    description: item?.attributes?.editorialNotes?.short || `Imported from Apple Music (${type})`,
                    coverImage: item?.attributes?.artwork?.url.replace('{w}', '600').replace('{h}', '600'),
                    sourceType: 'Platform',
                    spaceType: 'EMS',
                    status: 'PTP'
                })
                targetId = createResult.id
            } catch (e) {
                console.error('Create failed', e)
                showToast('플레이리스트 생성 실패', 'error')
                return
            }
        }

        // 3. Ensure Tracks Exist
        if (targetId) {
            try {
                if (type === 'playlists' || type === 'albums') {
                    const tracksData = await appleMusicApi.getTracks(appleId, type)
                    let addedCount = 0
                    for (const t of tracksData) {
                        if (t.type === 'songs') {
                            try {
                                await playlistsApi.addTrack(targetId, {
                                    title: t.attributes.name,
                                    artist: t.attributes.artistName,
                                    album: t.attributes.albumName || '',
                                    artwork: t.attributes.artwork?.url.replace('{w}', '300').replace('{h}', '300'),
                                    externalMetadata: {
                                        appleMusicId: t.id,
                                        previewUrl: (t.attributes.previews && t.attributes.previews[0]) ? t.attributes.previews[0].url : undefined
                                    }
                                })
                                addedCount++
                            } catch (e) { /* Ignore duplicates */ }
                        }
                    }
                    if (addedCount > 0) showToast(`${addedCount}곡 상세 정보 저장 완료`, 'success')
                }

                await fetchPlaylists()
                setSelectedDetailId(targetId)

            } catch (e) {
                console.error('Track sync failed', e)
                setSelectedDetailId(targetId)
            }
        }
    }

    const handleImportAlbum = async (collection: ItunesCollection) => {
        setImportingId(collection.id)
        try {
            const albumDetails = await itunesService.getAlbum(collection.id)
            const result = await playlistsApi.importAlbumAsPlaylist({
                title: collection.title,
                artist: collection.artist,
                coverImage: collection.artwork,
                tracks: albumDetails.tracks
            })

            showToast(`'${collection.title}' (${result.count}곡) 가져오기 완료`, 'success')
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

    // AI State
    const [isTraining, setIsTraining] = useState(false)
    const [lastTrained, setLastTrained] = useState<Date | null>(null)
    const [analyzingId, setAnalyzingId] = useState<number | null>(null)

    // Train Model
    const trainModel = async () => {
        setIsTraining(true)
        try {
            await analysisApi.train()
            setLastTrained(new Date())
            console.log('AI Model Retrained')
        } catch (err) {
            console.error('Training failed', err)
        } finally {
            setIsTraining(false)
        }
    }

    useEffect(() => {
        const syncAndTrain = async () => {
            if (tidalConnected && !syncing) {
                await handleTidalSync()
                await trainModel()
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

            if (result.score >= 70) {
                await playlistsApi.moveToSpace(id, 'GMS')
                await playlistsApi.updateStatus(id, 'PTP')
                showToast(`AI 추천 성공! GMS로 이동되었습니다. (${result.grade}등급, ${result.score}점)`, 'success')
                setPlaylists(prev => prev.filter(p => p.id !== id))
            } else {
                showToast(`AI 분석 완료: ${result.grade}등급 (${result.score}점) - 보류됨`, 'success')
                fetchPlaylists()
            }

        } catch (err) {
            console.error('Analysis failed', err)
            showToast('분석 실패', 'error')
        } finally {
            setAnalyzingId(null)
        }
    }

    // File Upload
    const handleFileUpload = async (files: FileList) => {
        if (files.length === 0) return
        const file = files[0]
        const reader = new FileReader()

        reader.onload = async (e) => {
            const text = e.target?.result as string
            if (!text) return

            const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0)
            const tracksToImport: { title: string, artist: string }[] = []

            lines.forEach(line => {
                if (line.toLowerCase().includes('track name') || line.toLowerCase().includes('artist name')) return
                let artist = 'Unknown Artist'
                let title = line
                if (line.includes(',')) {
                    const parts = line.split(',')
                    if (parts.length >= 2) {
                        title = parts[0].trim().replace(/^"|"$/g, '')
                        artist = parts[1].trim().replace(/^"|"$/g, '')
                    }
                } else if (line.includes(' - ')) {
                    const parts = line.split(' - ')
                    artist = parts[0].trim()
                    title = parts.slice(1).join(' - ').trim()
                }
                if (title) tracksToImport.push({ title, artist })
            })

            if (tracksToImport.length === 0) {
                showToast('파일에서 트랙을 찾을 수 없습니다.', 'error')
                return
            }

            try {
                showToast(`${tracksToImport.length}곡을 포함한 플레이리스트 생성 중...`, 'success')
                const playlistName = file.name.replace(/\.[^/.]+$/, "")
                const createResult = await playlistsApi.create({
                    title: playlistName,
                    description: `Imported from file: ${file.name}`,
                    sourceType: 'Upload',
                    spaceType: 'EMS',
                    status: 'PTP'
                })

                let successCount = 0
                for (const track of tracksToImport) {
                    try {
                        await playlistsApi.addTrack(createResult.id, {
                            title: track.title,
                            artist: track.artist,
                            album: 'Imported',
                            duration: 0
                        })
                        successCount++
                    } catch (err) { console.warn('Failed to add track:', track, err) }
                }

                showToast(`'${playlistName}' 생성 완료 (${successCount}/${tracksToImport.length}곡)`, 'success')
                fetchPlaylists()
            } catch (err) {
                console.error('File import failed:', err)
                showToast('파일 가져오기 실패', 'error')
            }
        }
        reader.readAsText(file)
    }

    const filteredPlaylists = playlists.filter(p =>
        p.name.toLowerCase().includes(searchTerm.toLowerCase())
    )

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
                        <button
                            onClick={() => document.getElementById('fileInput')?.click()}
                            className="bg-hud-accent-warning text-hud-bg-primary px-4 py-2 rounded-lg font-semibold flex items-center gap-2 hover:bg-hud-accent-warning/90 transition-all">
                            <LinkIcon className="w-4 h-4" />
                            Upload Files
                        </button>
                    </div>
                </header>

                <UploadZone onFilesSelected={handleFileUpload} />

                {/* New Releases */}
                {newReleases.songs.length > 0 && (
                    <section className="hud-card hud-card-bottom rounded-xl p-6 mb-6">
                        <h2 className="text-xl font-bold text-hud-text-primary flex items-center gap-3 mb-6">
                            <Sparkles className="w-5 h-5 text-pink-500" />
                            최신 인기 차트 (Apple Music Top 10)
                            <span className="text-sm font-normal text-hud-text-muted ml-2">(KR Store Real-time)</span>
                        </h2>
                        <div className="flex overflow-x-auto gap-4 pb-4 custom-scrollbar">
                            {newReleases.songs.map((song) => (
                                <div key={song.id} className="min-w-[160px] w-[160px] bg-hud-bg-secondary border border-hud-border-secondary rounded-lg p-3 hover:border-pink-500/50 transition-all group">
                                    <div className="relative aspect-square mb-3 rounded-md overflow-hidden">
                                        <img src={song.attributes.artwork?.url.replace('{w}', '300').replace('{h}', '300')} alt={song.attributes.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                            <button
                                                onClick={() => addToCart({
                                                    id: parseInt(song.id),
                                                    title: song.attributes.name,
                                                    artist: song.attributes.artistName || 'Unknown',
                                                    album: song.attributes.name,
                                                    artwork: song.attributes.artwork?.url.replace('{w}', '300').replace('{h}', '300') || '',
                                                    url: song.attributes.url,
                                                    date: song.attributes.releaseDate || '',
                                                    audio: '',
                                                    previewUrl: (song.attributes.previews && song.attributes.previews[0]) ? song.attributes.previews[0].url : undefined
                                                })}
                                                className="bg-pink-500 text-white p-2 rounded-full transform translate-y-2 group-hover:translate-y-0 transition-all hover:bg-pink-600"
                                                title="카트에 담기"
                                            >
                                                <Plus className="w-5 h-5" />
                                            </button>
                                        </div>
                                    </div>
                                    <div className="font-bold text-hud-text-primary truncate text-sm" title={song.attributes.name}>{song.attributes.name}</div>
                                    <div className="text-xs text-hud-text-secondary truncate">{song.attributes.artistName}</div>
                                </div>
                            ))}
                        </div>
                    </section>
                )}

                {/* Apple Music Playlists */}
                {newReleases.playlists && newReleases.playlists.length > 0 && (
                    <section className="hud-card hud-card-bottom rounded-xl p-6 mb-6">
                        <h2 className="text-xl font-bold text-hud-text-primary flex items-center gap-3 mb-6">
                            <Music2 className="w-5 h-5 text-rose-500" />
                            추천 플레이리스트 (Apple Music)
                            <span className="text-sm font-normal text-hud-text-muted ml-2">(Editor's Pick)</span>
                        </h2>
                        <div className="flex overflow-x-auto gap-4 pb-4 custom-scrollbar">
                            {newReleases.playlists.map((playlist) => (
                                <div key={playlist.id} className="min-w-[200px] w-[200px] bg-hud-bg-secondary border border-hud-border-secondary rounded-lg p-3 hover:border-rose-500/50 transition-all group flex flex-col">
                                    <div className="relative aspect-square mb-3 rounded-md overflow-hidden">
                                        <img src={playlist.attributes.artwork?.url.replace('{w}', '400').replace('{h}', '400')} alt={playlist.attributes.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                            <button
                                                onClick={() => handleViewDetail(playlist.id, playlist.attributes.name, 'playlists')}
                                                className="bg-rose-500 text-white px-4 py-2 rounded-full font-bold flex items-center gap-2 transform translate-y-2 group-hover:translate-y-0 transition-all hover:bg-rose-600"
                                            >
                                                <Eye className="w-4 h-4" />
                                                View
                                            </button>
                                        </div>
                                    </div>
                                    <div className="font-bold text-hud-text-primary truncate" title={playlist.attributes.name}>{playlist.attributes.name}</div>
                                    <div className="text-xs text-hud-text-muted mt-1 truncate" title={playlist.attributes.editorialNotes?.short}>
                                        {playlist.attributes.editorialNotes?.short || 'Apple Music Curation'}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>
                )}

                {/* Spotify 특별전 */}
                {spotifySpecial && spotifySpecial.playlists && spotifySpecial.playlists.length > 0 && (
                    <section className="hud-card hud-card-bottom rounded-xl p-6 mb-6 border-2 border-green-500/30 bg-gradient-to-br from-hud-bg-secondary to-green-900/10">
                        <div className="flex items-center justify-between mb-6">
                            <div>
                                <h2 className="text-2xl font-bold text-hud-text-primary flex items-center gap-3">
                                    <Disc3 className="w-6 h-6 text-green-500 animate-spin" style={{ animationDuration: '3s' }} />
                                    {spotifySpecial.event.title}
                                </h2>
                                <p className="text-hud-text-secondary mt-1">{spotifySpecial.event.subtitle}</p>
                            </div>
                            <div className="flex gap-4 text-sm">
                                <div className="text-center px-4 py-2 bg-green-500/10 rounded-lg border border-green-500/30">
                                    <div className="text-2xl font-bold text-green-400">{spotifySpecial.stats.totalPlaylists}</div>
                                    <div className="text-hud-text-muted text-xs">플레이리스트</div>
                                </div>
                                <div className="text-center px-4 py-2 bg-green-500/10 rounded-lg border border-green-500/30">
                                    <div className="text-2xl font-bold text-green-400">{spotifySpecial.stats.totalTracks}</div>
                                    <div className="text-hud-text-muted text-xs">트랙</div>
                                </div>
                            </div>
                        </div>

                        {/* Hot Tracks */}
                        {spotifySpecial.hotTracks && spotifySpecial.hotTracks.length > 0 && (
                            <div className="mb-6">
                                <h3 className="text-lg font-bold text-hud-text-primary flex items-center gap-2 mb-4">
                                    <TrendingUp className="w-5 h-5 text-orange-500" />
                                    인기 트랙 TOP 10
                                </h3>
                                <div className="flex overflow-x-auto gap-3 pb-4 custom-scrollbar">
                                    {spotifySpecial.hotTracks.map((track: any, idx: number) => (
                                        <div key={track.trackId} className="min-w-[140px] w-[140px] bg-hud-bg-secondary border border-hud-border-secondary rounded-lg p-3 hover:border-green-500/50 transition-all group relative">
                                            <div className="absolute -top-2 -left-2 w-6 h-6 bg-orange-500 rounded-full flex items-center justify-center text-xs font-bold text-white z-10">
                                                {idx + 1}
                                            </div>
                                            <div className="aspect-square mb-2 rounded-md overflow-hidden bg-gradient-to-br from-green-900/50 to-hud-bg-primary">
                                                {track.artwork ? (
                                                    <img src={track.artwork} alt={track.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                                                ) : (
                                                    <div className="w-full h-full flex items-center justify-center">
                                                        <Headphones className="w-10 h-10 text-green-500/50" />
                                                    </div>
                                                )}
                                            </div>
                                            <div className="font-bold text-hud-text-primary truncate text-sm" title={track.title}>{track.title}</div>
                                            <div className="text-xs text-hud-text-secondary truncate">{track.artist}</div>
                                            {track.popularity && (
                                                <div className="mt-1 flex items-center gap-1">
                                                    <div className="h-1 flex-1 bg-hud-bg-primary rounded-full overflow-hidden">
                                                        <div className="h-full bg-green-500" style={{ width: `${track.popularity}%` }}></div>
                                                    </div>
                                                    <span className="text-[10px] text-green-400">{track.popularity}</span>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Categories */}
                        {spotifySpecial.categories && Object.keys(spotifySpecial.categories).length > 0 && (
                            <div>
                                <h3 className="text-lg font-bold text-hud-text-primary flex items-center gap-2 mb-4">
                                    <Disc3 className="w-5 h-5 text-green-500" />
                                    카테고리별 플레이리스트
                                </h3>
                                <div className="space-y-4">
                                    {Object.entries(spotifySpecial.categories).map(([category, categoryPlaylists]: [string, any[]]) => (
                                        <div key={category} className="bg-hud-bg-primary/50 rounded-lg p-4 border border-hud-border-secondary">
                                            <h4 className="font-bold text-green-400 mb-3 flex items-center gap-2">
                                                <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                                                {category}
                                                <span className="text-xs text-hud-text-muted font-normal">({categoryPlaylists.length})</span>
                                            </h4>
                                            <div className="flex overflow-x-auto gap-3 pb-2 custom-scrollbar">
                                                {categoryPlaylists.map((playlist: any) => (
                                                    <div
                                                        key={playlist.playlistId}
                                                        onClick={() => setSelectedDetailId(playlist.playlistId)}
                                                        className="min-w-[180px] w-[180px] bg-hud-bg-secondary border border-hud-border-secondary rounded-lg overflow-hidden hover:border-green-500/50 transition-all cursor-pointer group"
                                                    >
                                                        <div className="aspect-square relative">
                                                            {playlist.coverImage ? (
                                                                <img src={playlist.coverImage} alt={playlist.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                                                            ) : (
                                                                <div className="w-full h-full bg-gradient-to-br from-green-900/50 to-hud-bg-primary flex items-center justify-center">
                                                                    <Disc3 className="w-16 h-16 text-green-500/30" />
                                                                </div>
                                                            )}
                                                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                                                <span className="bg-green-500 text-white px-3 py-1 rounded-full text-sm font-bold">상세보기</span>
                                                            </div>
                                                        </div>
                                                        <div className="p-3">
                                                            <div className="font-bold text-hud-text-primary truncate text-sm" title={playlist.title}>{playlist.title}</div>
                                                            <div className="text-xs text-hud-text-muted mt-1">{playlist.trackCount || 0}곡</div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </section>
                )}

                {/* iTunes Auto Discovery */}
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
                            <span className="text-sm font-normal text-hud-text-muted ml-2">(iTunes Auto Discovery)</span>
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

                {/* YouTube Search */}
                {youtubeConnected && (
                    <section className="hud-card hud-card-bottom rounded-xl p-6 mb-6">
                        <h2 className="text-xl font-bold text-hud-text-primary flex items-center gap-3 mb-6">
                            <Search className="w-5 h-5 text-red-500" />
                            YouTube 플레이리스트 검색
                        </h2>
                        <div className="flex gap-2 mb-6">
                            <input
                                type="text"
                                placeholder="플레이리스트 검색 (예: K-Pop, 운동 음악)"
                                value={youtubeSearchTerm}
                                onChange={(e) => setYoutubeSearchTerm(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleYoutubeSearch()}
                                className="flex-1 px-4 py-2 bg-hud-bg-secondary border border-hud-border-secondary rounded-lg text-hud-text-primary focus:outline-none focus:border-red-500 placeholder-hud-text-muted"
                            />
                            <button onClick={handleYoutubeSearch} disabled={isYoutubeSearching} className="bg-red-500 text-white px-6 py-2 rounded-lg font-semibold hover:bg-red-600 transition-all flex items-center gap-2">
                                {isYoutubeSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />} 검색
                            </button>
                        </div>
                        {youtubeResults.length > 0 && (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
                                {youtubeResults.map((playlist) => (
                                    <div key={playlist.id} className="bg-hud-bg-secondary border border-hud-border-secondary rounded-lg overflow-hidden group hover:border-red-500/50 transition-all">
                                        <div className="relative aspect-video">
                                            <img src={playlist.thumbnail || ''} alt={playlist.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                                            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                                <button onClick={() => handleYoutubeImport(playlist)} disabled={importingYoutubeId === playlist.id} className="bg-red-500 text-white px-4 py-2 rounded-full font-bold flex items-center gap-2 transform translate-y-2 group-hover:translate-y-0 transition-all hover:bg-red-600">
                                                    {importingYoutubeId === playlist.id ? <><Loader2 className="w-4 h-4 animate-spin" /> 가져오는 중...</> : <><DownloadCloud className="w-4 h-4" /> 가져오기</>}
                                                </button>
                                            </div>
                                        </div>
                                        <div className="p-3">
                                            <div className="font-bold text-hud-text-primary truncate" title={playlist.title}>{playlist.title}</div>
                                            <div className="text-sm text-hud-text-secondary truncate">{playlist.channelTitle}</div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </section>
                )}

                {/* Music Search */}
                <section className="hud-card hud-card-bottom rounded-xl p-6 mb-6">
                    <h2 className="text-xl font-bold text-hud-text-primary flex items-center gap-3 mb-6">
                        <Search className="w-5 h-5 text-hud-accent-info" />
                        Apple Music 카탈로그 검색
                        <span className="text-sm font-normal text-hud-text-muted ml-2">(iTunes DB 기반 고음질 메타데이터 검색)</span>
                    </h2>
                    <div className="flex gap-2 mb-6">
                        <input
                            id="music-search-input"
                            type="text"
                            placeholder="곡, 아티스트, 앨범 검색 (예: NewJeans)"
                            value={trackSearchTerm}
                            onChange={(e) => setTrackSearchTerm(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                            className="flex-1 px-4 py-2 bg-hud-bg-secondary border border-hud-border-secondary rounded-lg text-hud-text-primary focus:outline-none focus:border-hud-accent-info placeholder-hud-text-muted"
                        />
                        <button onClick={handleSearch} disabled={isSearching} className="bg-hud-accent-info text-white px-6 py-2 rounded-lg font-semibold hover:bg-hud-accent-info/90 transition-all flex items-center gap-2">
                            {isSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />} 검색
                        </button>
                    </div>
                    {trackResults.length > 0 && (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
                            {trackResults.map((track) => (
                                <div key={track.id} className="flex items-center gap-3 p-3 bg-hud-bg-secondary border border-hud-border-secondary rounded-lg hover:border-hud-accent-info/50 transition-all">
                                    <img src={track.artwork} alt={track.title} className="w-12 h-12 rounded object-cover" />
                                    <div className="flex-1 min-w-0">
                                        <div className="font-bold text-hud-text-primary truncate">{track.title}</div>
                                        <div className="text-sm text-hud-text-secondary truncate">{track.artist}</div>
                                        <div className="text-xs text-hud-text-muted truncate flex items-center gap-2">
                                            {track.album}
                                            {track.previewUrl && (
                                                <span className="text-hud-accent-info flex items-center gap-0.5 text-[10px] border border-hud-accent-info/30 px-1 rounded">
                                                    <Music2 className="w-2 h-2" /> 30s
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => addToCart(track)}
                                        className="p-2 text-hud-accent-primary hover:bg-hud-accent-primary/10 rounded-lg transition-colors"
                                        title="카트에 담기"
                                    >
                                        <Plus className="w-5 h-5" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </section>

                {/* Playlist Table */}
                <section className="hud-card hud-card-bottom rounded-xl overflow-hidden">
                    <div className="p-6 border-b border-hud-border-secondary flex items-center justify-between">
                        <h2 className="text-xl font-bold text-hud-text-primary flex items-center gap-3">
                            <Brain className="w-5 h-5 text-hud-accent-primary" />
                            EMS 플레이리스트 목록
                            <span className="text-sm font-normal text-hud-text-muted ml-2">
                                (검증 대기: {playlists.filter(p => p.status === 'unverified').length}개)
                            </span>
                        </h2>
                        {selectedIds.length > 0 && (
                            <button
                                onClick={() => selectedIds.forEach(id => handleDelete(id))}
                                className="text-hud-accent-danger hover:bg-hud-accent-danger/10 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5"
                            >
                                <Trash2 className="w-4 h-4" /> 선택 삭제 ({selectedIds.length})
                            </button>
                        )}
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead className="bg-hud-bg-secondary text-hud-text-secondary text-xs uppercase font-semibold">
                                <tr>
                                    <th className="p-4 w-10">
                                        <input
                                            type="checkbox"
                                            className="rounded border-hud-border-secondary bg-hud-bg-primary text-hud-accent-primary focus:ring-0"
                                            checked={playlists.length > 0 && selectedIds.length === playlists.length}
                                            onChange={(e) => handleSelectAll(e.target.checked)}
                                        />
                                    </th>
                                    <th className="p-4">플레이리스트</th>
                                    <th className="p-4">소스</th>
                                    <th className="p-4">트랙 수</th>
                                    <th className="p-4">추가일</th>
                                    <th className="p-4">상태</th>
                                    <th className="p-4 text-right">관리</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-hud-border-secondary">
                                {filteredPlaylists.length > 0 ? (
                                    filteredPlaylists.map((playlist) => (
                                        <tr key={playlist.id} className="hover:bg-hud-bg-secondary/50 transition-colors group">
                                            <td className="p-4">
                                                <input
                                                    type="checkbox"
                                                    className="rounded border-hud-border-secondary bg-hud-bg-primary text-hud-accent-primary focus:ring-0"
                                                    checked={selectedIds.includes(playlist.id)}
                                                    onChange={(e) => handleSelectRow(playlist.id, e.target.checked)}
                                                />
                                            </td>
                                            <td className="p-4 font-medium text-hud-text-primary">{playlist.name}</td>
                                            <td className="p-4 text-hud-text-secondary capitalize">{playlist.source}</td>
                                            <td className="p-4 text-hud-text-secondary">{playlist.trackCount}</td>
                                            <td className="p-4 text-hud-text-muted text-sm">{playlist.addedDate}</td>
                                            <td className="p-4">{getStatusBadge(playlist.status)}</td>
                                            <td className="p-4 text-right">
                                                <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <button
                                                        onClick={() => handleAnalyze(playlist.id)}
                                                        disabled={analyzingId === playlist.id}
                                                        className="p-2 text-hud-accent-primary hover:bg-hud-accent-primary/10 rounded-lg transition-colors"
                                                        title="AI 분석 실행"
                                                    >
                                                        {analyzingId === playlist.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Brain className="w-4 h-4" />}
                                                    </button>
                                                    <button
                                                        onClick={() => setSelectedDetailId(playlist.id)}
                                                        className="p-2 text-hud-text-secondary hover:text-hud-text-primary hover:bg-hud-bg-hover rounded-lg transition-colors"
                                                        title="상세 보기"
                                                    >
                                                        <Eye className="w-4 h-4" />
                                                    </button>
                                                    <button
                                                        onClick={() => handleDelete(playlist.id)}
                                                        className="p-2 text-hud-text-muted hover:text-hud-accent-danger hover:bg-hud-accent-danger/10 rounded-lg transition-colors"
                                                        title="삭제"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                ) : (
                                    <tr>
                                        <td colSpan={7} className="p-8 text-center text-hud-text-muted">
                                            {searchTerm ? '검색 결과가 없습니다.' : '아직 수집된 플레이리스트가 없습니다.'}
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </section>
            </main>

            {/* Floating Cart Button */}
            <div className="fixed bottom-8 right-8 z-50">
                <button
                    onClick={() => setIsCartOpen(!isCartOpen)}
                    className="relative bg-hud-accent-primary text-hud-bg-primary p-4 rounded-full shadow-lg hover:scale-110 transition-transform btn-glow"
                >
                    <ShoppingBag className="w-6 h-6" />
                    {cartTracks.length > 0 && (
                        <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center border-2 border-hud-bg-primary">
                            {cartTracks.length}
                        </span>
                    )}
                </button>
            </div>

            {/* Cart Drawer */}
            {isCartOpen && (
                <div className="fixed inset-0 z-50 flex justify-end">
                    <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setIsCartOpen(false)}></div>
                    <div className="relative w-full max-w-md bg-hud-bg-secondary border-l border-hud-border-secondary shadow-2xl flex flex-col h-full animate-in slide-in-from-right duration-300">
                        <div className="p-4 border-b border-hud-border-secondary flex items-center justify-between">
                            <h3 className="text-lg font-bold text-hud-text-primary flex items-center gap-2">
                                <ShoppingBag className="w-5 h-5 text-hud-accent-primary" />
                                EMS 트랙 카트
                                <span className="text-sm font-normal text-hud-text-muted">({cartTracks.length})</span>
                            </h3>
                            <button onClick={() => setIsCartOpen(false)} className="text-hud-text-secondary hover:text-hud-text-primary">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-4 space-y-2">
                            {cartTracks.length === 0 ? (
                                <div className="text-center py-10 text-hud-text-muted">
                                    <ShoppingBag className="w-12 h-12 mx-auto mb-3 opacity-20" />
                                    <p>카트가 비어있습니다.</p>
                                    <p className="text-xs mt-1">검색 결과에서 + 버튼을 눌러 추가하세요.</p>
                                </div>
                            ) : (
                                cartTracks.map((track, idx) => (
                                    <div key={`${track.id}-${idx}`} className="flex items-center gap-3 p-3 bg-hud-bg-primary rounded-lg border border-hud-border-secondary">
                                        <img src={track.artwork} alt={track.title} className="w-10 h-10 rounded object-cover" />
                                        <div className="flex-1 min-w-0">
                                            <div className="font-medium text-hud-text-primary truncate">{track.title}</div>
                                            <div className="text-xs text-hud-text-secondary truncate">{track.artist}</div>
                                        </div>
                                        <button
                                            onClick={() => removeFromCart(track.id)}
                                            className="text-hud-text-muted hover:text-red-500 transition-colors"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                ))
                            )}
                        </div>

                        <div className="p-4 border-t border-hud-border-secondary bg-hud-bg-primary">
                            <button
                                onClick={saveCartToPlaylist}
                                disabled={cartTracks.length === 0}
                                className="w-full bg-hud-accent-primary text-hud-bg-primary py-3 rounded-lg font-bold flex items-center justify-center gap-2 hover:bg-hud-accent-primary/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <Save className="w-5 h-5" />
                                플레이리스트로 저장
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modals */}
            {selectedDetailId && (
                <PlaylistDetailModal
                    playlistId={selectedDetailId}
                    isOpen={!!selectedDetailId}
                    onClose={() => setSelectedDetailId(null)}
                />
            )}
        </div>
    )
}

export default ExternalMusicSpace
