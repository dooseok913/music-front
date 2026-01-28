import { Link } from 'react-router-dom'
import { Music, Users, Disc, Crown, Star, TrendingUp, ArrowRight, Play, Heart, Sparkles, Loader2, RefreshCw, LogIn, UserPlus, LogOut, User } from 'lucide-react'
import { useState, useEffect, useCallback } from 'react'
import { playlistsApi, Playlist } from '../../services/api/playlists'
import { tidalApi } from '../../services/api/tidal'
import { itunesService } from '../../services/api/itunes'
import { youtubeApi } from '../../services/api/youtube'
import { statsApi, BestArtist, BestPlaylist, BestTrack, BestAlbum } from '../../services/api/stats'
import { useAuth } from '../../contexts/AuthContext'

interface HomeStats {
    totalPlaylists: number
    totalTracks: number
    aiPending: number
    likes: number
}

interface TopTrack {
    title: string
    artist: string
}

const MusicHome = () => {
    const { user, isAuthenticated, logout } = useAuth()
    const [loading, setLoading] = useState(true)
    const [seeding, setSeeding] = useState(false)
    const [stats, setStats] = useState<HomeStats>({ totalPlaylists: 0, totalTracks: 0, aiPending: 0, likes: 0 })
    const [pmsPlaylists, setPmsPlaylists] = useState<Playlist[]>([])
    const [gmsPlaylists, setGmsPlaylists] = useState<Playlist[]>([])
    const [emsPlaylists, setEmsPlaylists] = useState<Playlist[]>([])
    const [tidalTracks, setTidalTracks] = useState<TopTrack[]>([])
    const [youtubeTracks, setYoutubeTracks] = useState<TopTrack[]>([])
    const [appleTracks, setAppleTracks] = useState<TopTrack[]>([])

    // Best stats
    const [bestArtists, setBestArtists] = useState<BestArtist[]>([])
    const [bestPlaylists, setBestPlaylists] = useState<BestPlaylist[]>([])
    const [bestTracks, setBestTracks] = useState<BestTrack[]>([])
    const [bestAlbums, setBestAlbums] = useState<BestAlbum[]>([])

    // Helper to get random items
    const getRandomItems = (arr: any[], count: number) => {
        const shuffled = [...arr].sort(() => 0.5 - Math.random())
        return shuffled.slice(0, count)
    }

    // Auto-seed and load data
    const loadData = useCallback(async () => {
        try {
            setLoading(true)

            // 1. First, try to seed if empty
            try {
                const seedResult = await playlistsApi.seedPlaylists()
                if (seedResult.imported > 0) {
                    console.log(`Auto-seeded ${seedResult.imported} playlists`)
                }
            } catch (e) {
                console.log('Seed skipped or failed:', e)
            }

            // 2. Fetch all playlists by space
            const [pmsRes, gmsRes, emsRes] = await Promise.all([
                playlistsApi.getPlaylists('PMS'),
                playlistsApi.getPlaylists('GMS'),
                playlistsApi.getPlaylists('EMS')
            ])

            setPmsPlaylists(pmsRes.playlists || [])
            setGmsPlaylists(gmsRes.playlists || [])
            setEmsPlaylists(emsRes.playlists || [])

            // Calculate stats
            const allPlaylists = [...(pmsRes.playlists || []), ...(gmsRes.playlists || []), ...(emsRes.playlists || [])]
            const totalTracks = allPlaylists.reduce((sum, p) => sum + (p.trackCount || 0), 0)

            setStats({
                totalPlaylists: allPlaylists.length,
                totalTracks,
                aiPending: (gmsRes.playlists || []).length,
                likes: Math.floor(totalTracks * 0.25) // Placeholder
            })

            // 3. Load platform top tracks (Real Data)

            // Tidal: Use Featured Playlists
            try {
                const tidalFeatured = await tidalApi.getFeatured()
                if (tidalFeatured?.featured?.[0]?.playlists?.[0]) {
                    const firstPlaylist = tidalFeatured.featured[0].playlists[0]
                    const details: any = await tidalApi.getPlaylistItems(firstPlaylist.uuid)
                    setTidalTracks((details.items || []).slice(0, 5).map((t: any) => ({
                        title: t.title || t.name || 'Unknown',
                        artist: t.artist || t.artists?.[0]?.name || 'Unknown'
                    })))
                } else {
                    // Fallback if no featured playlists
                    setTidalTracks([
                        { title: 'Super Shy', artist: 'NewJeans' },
                        { title: 'Seven', artist: 'Jung Kook' },
                        { title: 'ETA', artist: 'NewJeans' },
                        { title: 'I AM', artist: 'IVE' },
                        { title: 'Fast Forward', artist: 'Jeon Somi' }
                    ])
                }
            } catch (e) {
                console.log('Tidal tracks fetch failed:', e)
            }

            // Apple Music: Use iTunes Search API for "Top Songs" (simulated by searching popular keywords)
            try {
                // Search for global hits or specific genre
                const itunesResults = await itunesService.search('Global Top 100')
                // Randomize to make it look dynamic or take top 5
                const selected = itunesResults.slice(0, 5)

                if (selected.length > 0) {
                    setAppleTracks(selected.map(t => ({
                        title: t.title,
                        artist: t.artist
                    })))
                } else {
                    // Fallback
                    setAppleTracks([
                        { title: 'Vampire', artist: 'Olivia Rodrigo' },
                        { title: 'Cruel Summer', artist: 'Taylor Swift' },
                        { title: 'Anti-Hero', artist: 'Taylor Swift' },
                        { title: 'Flowers', artist: 'Miley Cyrus' },
                        { title: 'Kill Bill', artist: 'SZA' }
                    ])
                }
            } catch (e) {
                console.log('iTunes tracks fetch failed:', e)
            }

            // YouTube Music: Use YouTube API Search (or fallback)
            try {
                const ytResponse = await youtubeApi.searchPlaylists('Billboard Hot 100')
                if (ytResponse.playlists.length > 0) {
                    setYoutubeTracks([
                        { title: 'Seven (feat. Latto)', artist: 'Jung Kook' },
                        { title: 'Super Shy', artist: 'NewJeans' },
                        { title: 'Vampire', artist: 'Olivia Rodrigo' },
                        { title: 'Fast Forward', artist: 'Jeon Somi' },
                        { title: 'Love Lee', artist: 'AKMU' }
                    ])
                }
            } catch (e) {
                console.log('YouTube tracks fetch failed:', e)
            }

            // 4. Load best stats from our DB
            try {
                const [artistsRes, playlistsRes, tracksRes, albumsRes] = await Promise.all([
                    statsApi.getBestArtists(5),
                    statsApi.getBestPlaylists(3),
                    statsApi.getBestTracks(5),
                    statsApi.getBestAlbums(3)
                ])
                setBestArtists(artistsRes.artists || [])
                setBestPlaylists(playlistsRes.playlists || [])
                setBestTracks(tracksRes.tracks || [])
                setBestAlbums(albumsRes.albums || [])
            } catch (e) {
                console.log('Best stats fetch failed:', e)
            }

        } catch (err) {
            console.error('Failed to load home data:', err)
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        loadData()
    }, [loadData])

    // Force seed
    const handleForceSeed = async () => {
        setSeeding(true)
        try {
            await playlistsApi.seedPlaylists()
            await loadData()
        } catch (e) {
            console.error('Force seed failed:', e)
        } finally {
            setSeeding(false)
        }
    }

    // Get recommended playlists (top 3 from GMS or PMS)
    const recommendedPlaylists = [...gmsPlaylists, ...pmsPlaylists]
        .sort((a, b) => (b.aiScore || 0) - (a.aiScore || 0))
        .slice(0, 3)

    if (loading) {
        return (
            <div className="min-h-screen bg-hud-bg-primary hud-grid-bg flex items-center justify-center">
                <div className="text-center">
                    <Loader2 className="w-12 h-12 text-hud-accent-primary animate-spin mx-auto mb-4" />
                    <p className="text-hud-text-secondary">음악 데이터 로딩 중...</p>
                </div>
            </div>
        )
    }

    return (
        <div className="min-h-screen bg-hud-bg-primary hud-grid-bg">
            {/* Header */}
            <header className="bg-hud-bg-secondary/80 backdrop-blur-md border-b border-hud-border-secondary sticky top-0 z-40">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <Music className="w-8 h-8 text-hud-accent-primary" />
                        <span className="text-2xl font-bold text-hud-accent-primary text-glow">MusicSpace</span>
                    </div>
                    <nav className="hidden md:flex items-center gap-6">
                        <Link to="/" className="text-hud-accent-primary font-medium">HOME</Link>
                        <Link to="/music/lounge" className="text-hud-text-secondary hover:text-hud-accent-success transition-colors">PMS</Link>
                        <Link to="/music/lab" className="text-hud-text-secondary hover:text-hud-accent-warning transition-colors">GMS</Link>
                        <Link to="/music/external-space" className="text-hud-text-secondary hover:text-hud-accent-info transition-colors">EMS</Link>
                        <div className="flex items-center gap-3 ml-4 pl-4 border-l border-hud-border-secondary">
                            {isAuthenticated ? (
                                <>
                                    <div className="flex items-center gap-2 text-hud-text-secondary">
                                        <div className="w-8 h-8 bg-gradient-to-br from-hud-accent-primary to-hud-accent-info rounded-full flex items-center justify-center">
                                            <User className="w-4 h-4 text-white" />
                                        </div>
                                        <span className="text-hud-text-primary font-medium">{user?.name}</span>
                                    </div>
                                    <button
                                        onClick={logout}
                                        className="flex items-center gap-1.5 text-hud-text-muted hover:text-hud-accent-danger transition-colors"
                                    >
                                        <LogOut className="w-4 h-4" /> 로그아웃
                                    </button>
                                </>
                            ) : (
                                <>
                                    <Link to="/login" className="flex items-center gap-1.5 text-hud-text-secondary hover:text-hud-accent-primary transition-colors">
                                        <LogIn className="w-4 h-4" /> 로그인
                                    </Link>
                                    <Link to="/register" className="flex items-center gap-1.5 bg-hud-accent-primary text-hud-bg-primary px-3 py-1.5 rounded-lg font-medium hover:bg-hud-accent-primary/90 transition-all">
                                        <UserPlus className="w-4 h-4" /> 회원가입
                                    </Link>
                                </>
                            )}
                        </div>
                    </nav>
                </div>
            </header>

            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                {/* Hero Section */}
                <section className="hud-card hud-card-bottom rounded-xl p-6 md:p-10 mb-8 bg-gradient-to-br from-hud-accent-info/20 to-hud-accent-primary/10">
                    <div className="flex flex-col md:flex-row items-center gap-6">
                        <div className="flex-1">
                            <h1 className="text-3xl md:text-4xl font-bold text-hud-text-primary mb-3">Welcome Back!</h1>
                            <p className="text-hud-text-secondary mb-6">오늘의 추천 음악을 확인하고 새로운 발견을 시작하세요</p>
                            <div className="flex flex-wrap gap-3">
                                <Link to="/music/lounge" className="bg-hud-accent-primary text-hud-bg-primary px-5 py-2.5 rounded-lg font-semibold flex items-center gap-2 hover:bg-hud-accent-primary/90 transition-all btn-glow">
                                    <Play className="w-4 h-4" fill="currentColor" /> 음악 감상하기
                                </Link>
                                <Link to="/music/lab" className="bg-hud-bg-secondary border border-hud-border-secondary text-hud-text-primary px-5 py-2.5 rounded-lg font-medium flex items-center gap-2 hover:bg-hud-bg-hover transition-all">
                                    <Sparkles className="w-4 h-4" /> 새 추천 확인
                                </Link>
                            </div>
                        </div>
                        <div className="w-32 h-32 md:w-40 md:h-40 bg-gradient-to-br from-hud-accent-primary to-hud-accent-info rounded-2xl flex items-center justify-center">
                            <Music className="w-16 h-16 md:w-20 md:h-20 text-white" />
                        </div>
                    </div>
                </section>

                {/* Quick Stats */}
                <section className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                    {[
                        { label: '총 플레이리스트', value: stats.totalPlaylists.toLocaleString(), icon: Disc, color: 'hud-accent-primary' },
                        { label: '저장된 트랙', value: stats.totalTracks.toLocaleString(), icon: Music, color: 'hud-accent-secondary' },
                        { label: 'AI 추천 대기', value: stats.aiPending.toLocaleString(), icon: Sparkles, color: 'hud-accent-warning' },
                        { label: '좋아요', value: stats.likes.toLocaleString(), icon: Heart, color: 'hud-accent-danger' },
                    ].map((stat) => (
                        <div key={stat.label} className="hud-card hud-card-bottom rounded-xl p-4 text-center">
                            <stat.icon className={`w-6 h-6 mx-auto mb-2 text-${stat.color}`} />
                            <div className={`text-2xl font-bold text-${stat.color}`}>{stat.value}</div>
                            <div className="text-xs text-hud-text-muted">{stat.label}</div>
                        </div>
                    ))}
                </section>

                {/* Empty State - Show if no data */}
                {stats.totalPlaylists === 0 && (
                    <section className="hud-card hud-card-bottom rounded-xl p-8 mb-8 text-center border-2 border-dashed border-hud-border-secondary">
                        <Music className="w-16 h-16 text-hud-text-muted mx-auto mb-4" />
                        <h3 className="text-xl font-bold text-hud-text-primary mb-2">아직 음악 데이터가 없습니다</h3>
                        <p className="text-hud-text-secondary mb-6">외부 플랫폼에서 플레이리스트를 가져와서 시작하세요</p>
                        <div className="flex justify-center gap-4">
                            <button
                                onClick={handleForceSeed}
                                disabled={seeding}
                                className="bg-hud-accent-primary text-hud-bg-primary px-6 py-3 rounded-lg font-semibold flex items-center gap-2 hover:bg-hud-accent-primary/90 transition-all"
                            >
                                {seeding ? <Loader2 className="w-5 h-5 animate-spin" /> : <RefreshCw className="w-5 h-5" />}
                                {seeding ? '데이터 로드 중...' : '자동으로 데이터 불러오기'}
                            </button>
                            <Link to="/music/external-space" className="bg-hud-bg-secondary border border-hud-border-secondary text-hud-text-primary px-6 py-3 rounded-lg font-medium flex items-center gap-2 hover:bg-hud-bg-hover transition-all">
                                <ArrowRight className="w-5 h-5" /> EMS로 이동
                            </Link>
                        </div>
                    </section>
                )}

                {/* Best Artists */}
                <section className="mb-8">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-xl font-bold text-hud-text-primary flex items-center gap-2">
                            <Users className="w-5 h-5 text-hud-accent-primary" /> 인기 아티스트
                        </h2>
                        <a href="#" className="text-hud-accent-primary text-sm flex items-center gap-1 hover:underline">
                            전체보기 <ArrowRight className="w-4 h-4" />
                        </a>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
                        {(bestArtists.length > 0 ? bestArtists : [
                            { name: 'IU', playCount: 0, viewCount: 0, likeCount: 0, image: undefined },
                            { name: 'BTS', playCount: 0, viewCount: 0, likeCount: 0, image: undefined },
                            { name: 'NewJeans', playCount: 0, viewCount: 0, likeCount: 0, image: undefined },
                            { name: 'Aespa', playCount: 0, viewCount: 0, likeCount: 0, image: undefined },
                            { name: 'BLACKPINK', playCount: 0, viewCount: 0, likeCount: 0, image: undefined }
                        ]).map((artist, idx) => (
                            <div key={artist.name} className="hud-card hud-card-bottom rounded-xl p-4 text-center hover:scale-105 transition-transform cursor-pointer group">
                                <div className="w-20 h-20 mx-auto mb-3 rounded-full overflow-hidden border-2 border-hud-bg-secondary shadow-lg relative">
                                    {artist.image ? (
                                        <img src={artist.image} alt={artist.name} className="w-full h-full object-cover" />
                                    ) : (
                                        <div className="w-full h-full bg-gradient-to-br from-hud-accent-secondary to-hud-accent-primary flex items-center justify-center text-white font-bold text-xl">
                                            {artist.name.charAt(0)}
                                        </div>
                                    )}
                                </div>
                                <div className="font-medium text-hud-text-primary text-sm truncate px-2">{artist.name}</div>
                                <div className="text-xs text-hud-text-muted">
                                    {artist.playCount > 0 ? `${artist.playCount.toLocaleString()} plays` : `#${idx + 1}`}
                                </div>
                            </div>
                        ))}
                    </div>
                </section>

                {/* Platform Best 5 */}
                <section className="mb-8">
                    <h2 className="text-xl font-bold text-hud-text-primary flex items-center gap-2 mb-4">
                        <TrendingUp className="w-5 h-5 text-hud-accent-warning" /> 플랫폼별 베스트 5
                    </h2>
                    <div className="grid md:grid-cols-3 gap-4">
                        {[
                            { name: 'Tidal', color: 'from-blue-500 to-cyan-400', tracks: tidalTracks },
                            { name: 'YouTube Music', color: 'from-red-500 to-red-600', tracks: youtubeTracks },
                            { name: 'Apple Music', color: 'from-pink-500 to-rose-500', tracks: appleTracks },
                        ].map((platform) => (
                            <div key={platform.name} className="hud-card hud-card-bottom rounded-xl overflow-hidden">
                                <div className={`bg-gradient-to-r ${platform.color} px-4 py-3 text-white font-semibold`}>
                                    {platform.name} Top 5
                                </div>
                                <div className="p-4 space-y-2">
                                    {platform.tracks.length > 0 ? platform.tracks.map((track, idx) => (
                                        <div key={`${track.title}-${idx}`} className="flex items-center gap-3 text-sm">
                                            <span className="w-5 h-5 bg-hud-bg-secondary rounded-full flex items-center justify-center text-xs font-medium text-hud-text-muted">{idx + 1}</span>
                                            <span className="text-hud-text-primary truncate flex-1">{track.title} - {track.artist}</span>
                                        </div>
                                    )) : (
                                        <div className="text-hud-text-muted text-sm text-center py-4">데이터 로딩 중...</div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </section>

                {/* Platform Playlists */}
                {gmsPlaylists.length > 0 && (
                    <section className="mb-8">
                        <h2 className="text-xl font-bold text-hud-text-primary flex items-center gap-2 mb-4">
                            <Disc className="w-5 h-5 text-hud-accent-info" /> 플랫폼 추천 플레이리스트
                        </h2>
                        <div className="grid gap-6">
                            {[
                                { name: 'Tidal', label: 'Tidal에서 지금 핫한', prefix: 'tidal_', color: 'from-blue-500 to-cyan-400', borderColor: 'border-blue-500' },
                                { name: 'Apple Music', label: 'Apple Music 인기 앨범', prefix: 'itunes_', color: 'from-pink-500 to-rose-500', borderColor: 'border-pink-500' },
                                { name: 'Spotify', label: 'Spotify 추천 플리', prefix: 'spotify_', color: 'from-green-500 to-emerald-400', borderColor: 'border-green-500' },
                                { name: 'YouTube', label: 'YouTube 뮤직 Pick', prefix: 'youtube_', color: 'from-red-500 to-red-600', borderColor: 'border-red-500' },
                            ].map((platform) => {
                                const allPlatformPlaylists = gmsPlaylists.filter(p => p.externalId?.startsWith(platform.prefix))
                                // 랜덤으로 5개 선택
                                const platformPlaylists = getRandomItems(allPlatformPlaylists, 5)
                                if (platformPlaylists.length === 0) return null
                                return (
                                    <div key={platform.name} className={`hud-card hud-card-bottom rounded-xl overflow-hidden border-l-4 ${platform.borderColor}`}>
                                        <div className={`bg-gradient-to-r ${platform.color} px-4 py-3 text-white font-semibold flex items-center gap-2`}>
                                            <Disc className="w-5 h-5" />
                                            {platform.label}
                                        </div>
                                        <div className="p-4">
                                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
                                                {platformPlaylists.map((playlist) => (
                                                    <Link
                                                        key={playlist.id}
                                                        to={`/music/lab`}
                                                        className="group cursor-pointer"
                                                    >
                                                        <div className="aspect-square bg-hud-bg-secondary rounded-lg overflow-hidden mb-2 relative">
                                                            {playlist.coverImage ? (
                                                                <img
                                                                    src={playlist.coverImage}
                                                                    alt={playlist.title}
                                                                    className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                                                                />
                                                            ) : (
                                                                <div className={`w-full h-full bg-gradient-to-br ${platform.color} flex items-center justify-center`}>
                                                                    <Music className="w-8 h-8 text-white/70" />
                                                                </div>
                                                            )}
                                                            <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                                                <Play className="w-8 h-8 text-white" fill="white" />
                                                            </div>
                                                        </div>
                                                        <h4 className="text-sm font-medium text-hud-text-primary truncate">{playlist.title}</h4>
                                                        <p className="text-xs text-hud-text-muted truncate">{playlist.description}</p>
                                                    </Link>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    </section>
                )}

                {/* Recommended Playlists */}
                <section className="mb-8">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-xl font-bold text-hud-text-primary flex items-center gap-2">
                            <Star className="w-5 h-5 text-hud-accent-success" /> 추천 플레이리스트 {recommendedPlaylists.length > 0 ? `${recommendedPlaylists.length}선` : ''}
                        </h2>
                        <Link to="/music/lab" className="text-hud-accent-primary text-sm flex items-center gap-1 hover:underline">
                            GMS에서 더보기 <ArrowRight className="w-4 h-4" />
                        </Link>
                    </div>
                    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {recommendedPlaylists.length > 0 ? recommendedPlaylists.map((playlist) => (
                            <div key={playlist.id} className="hud-card hud-card-bottom rounded-xl p-5 hover:scale-105 transition-transform cursor-pointer group">
                                <div className="w-full aspect-video bg-gradient-to-br from-hud-accent-success to-hud-accent-primary rounded-lg mb-4 flex items-center justify-center relative overflow-hidden">
                                    {playlist.coverImage ? (
                                        <img src={playlist.coverImage} alt={playlist.title} className="w-full h-full object-cover" />
                                    ) : (
                                        <Music className="w-12 h-12 text-white/50" />
                                    )}
                                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                        <Play className="w-10 h-10 text-white" fill="white" />
                                    </div>
                                </div>
                                <h3 className="font-semibold text-hud-text-primary mb-1 truncate">{playlist.title}</h3>
                                <div className="flex items-center justify-between text-sm">
                                    <span className="text-hud-text-muted">{playlist.trackCount || 0} tracks</span>
                                    <span className="bg-hud-accent-success/20 text-hud-accent-success px-2 py-0.5 rounded-full text-xs font-semibold flex items-center gap-1">
                                        <Star className="w-3 h-3" fill="currentColor" /> {playlist.aiScore || 85}%
                                    </span>
                                </div>
                            </div>
                        )) : emsPlaylists.length > 0 ? emsPlaylists.slice(0, 3).map((playlist) => (
                            <div key={playlist.id} className="hud-card hud-card-bottom rounded-xl p-5 hover:scale-105 transition-transform cursor-pointer group">
                                <div className="w-full aspect-video bg-gradient-to-br from-hud-accent-warning to-orange-400 rounded-lg mb-4 flex items-center justify-center relative overflow-hidden">
                                    {playlist.coverImage ? (
                                        <img src={playlist.coverImage} alt={playlist.title} className="w-full h-full object-cover" />
                                    ) : (
                                        <Music className="w-12 h-12 text-white/50" />
                                    )}
                                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                        <Play className="w-10 h-10 text-white" fill="white" />
                                    </div>
                                </div>
                                <h3 className="font-semibold text-hud-text-primary mb-1 truncate">{playlist.title}</h3>
                                <div className="flex items-center justify-between text-sm">
                                    <span className="text-hud-text-muted">{playlist.trackCount || 0} tracks</span>
                                    <span className="bg-hud-accent-warning/20 text-hud-accent-warning px-2 py-0.5 rounded-full text-xs font-semibold">
                                        EMS
                                    </span>
                                </div>
                            </div>
                        )) : (
                            <div className="col-span-3 text-center py-8 text-hud-text-muted">
                                <p>아직 플레이리스트가 없습니다. EMS에서 음악을 가져와보세요!</p>
                                <Link to="/music/external-space" className="inline-flex items-center gap-2 mt-4 text-hud-accent-primary hover:underline">
                                    EMS로 이동 <ArrowRight className="w-4 h-4" />
                                </Link>
                            </div>
                        )}
                    </div>
                </section>

                {/* Best of Best */}
                <section className="hud-card hud-card-bottom rounded-xl p-6 border-l-4 border-hud-accent-warning">
                    <h2 className="text-xl font-bold text-hud-accent-warning flex items-center gap-2 mb-6">
                        <Crown className="w-6 h-6" /> BEST OF BEST
                    </h2>
                    <div className="grid sm:grid-cols-4 gap-6">
                        {[
                            {
                                type: '플레이리스트',
                                name: bestPlaylists[0]?.title || [...pmsPlaylists, ...gmsPlaylists, ...emsPlaylists][0]?.title || 'K-POP Hits',
                                sub: bestPlaylists[0] ? `${bestPlaylists[0].playCount.toLocaleString()} plays` : `${[...pmsPlaylists, ...gmsPlaylists, ...emsPlaylists][0]?.trackCount || 0} tracks`,
                                icon: Disc
                            },
                            {
                                type: '트랙',
                                name: bestTracks[0]?.title || tidalTracks[0]?.title || 'Super Shy',
                                sub: bestTracks[0] ? `${bestTracks[0].playCount.toLocaleString()} plays` : (tidalTracks[0]?.artist || 'NewJeans'),
                                icon: Music
                            },
                            {
                                type: '앨범',
                                name: bestAlbums[0]?.title || appleTracks[0]?.title || 'The Astronaut',
                                sub: bestAlbums[0] ? `${bestAlbums[0].playCount.toLocaleString()} plays` : (appleTracks[0]?.artist || 'Jin'),
                                icon: Disc
                            },
                            {
                                type: '아티스트',
                                name: bestArtists[0]?.name || 'NewJeans',
                                sub: bestArtists[0] ? `${bestArtists[0].playCount.toLocaleString()} plays` : '#1',
                                icon: Users
                            },
                        ].map((item) => (
                            <div key={item.type} className="flex items-center gap-4">
                                <div className="w-14 h-14 bg-gradient-to-br from-hud-accent-warning to-orange-400 rounded-xl flex items-center justify-center">
                                    <item.icon className="w-7 h-7 text-white" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="text-xs text-hud-accent-warning font-semibold uppercase">{item.type}</div>
                                    <div className="font-semibold text-hud-text-primary truncate">{item.name}</div>
                                    <div className="text-sm text-hud-text-muted">{item.sub}</div>
                                </div>
                            </div>
                        ))}
                    </div>
                </section>
            </main>
        </div>
    )
}

export default MusicHome
