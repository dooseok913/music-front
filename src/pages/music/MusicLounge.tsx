import MusicSidebar from '../../components/music/MusicSidebar'
import MusicPlayer from '../../components/music/MusicPlayer'
import PlaylistCard from '../../components/music/PlaylistCard'
import TrackListOverlay from '../../components/music/TrackListOverlay'
import { MusicProvider } from '../../context/MusicContext'
import { playlistsApi, PlaylistWithTracks } from '../../services/api/playlists'
import { Play, ArrowRight, Sparkles, Music, Guitar, Headphones, Zap, Compass, Globe } from 'lucide-react'
import { useState } from 'react'

const MusicLoungeContent = () => {
    const [selectedPlaylist, setSelectedPlaylist] = useState<PlaylistWithTracks | null>(null)

    const handlePlaylistClick = async (id: number) => {
        try {
            const playlist = await playlistsApi.getById(id) as PlaylistWithTracks
            setSelectedPlaylist(playlist)
        } catch (error) {
            console.error('Failed to fetch playlist', error)
        }
    }

    // Mock IDs for the UI-only cards for now, normally these would come from API
    // We will just use ID 1 for demonstration if ID is not available
    const handleMockClick = (title: string) => {
        // ideally we fetch by ID. For now let's just use a dummy ID or mock fetch
        // Since we are mocking the UI cards, we can't easily map them to real DB IDs without fetching all first.
        // For this task, I will fetch a hardcoded ID (e.g., 1) just to demonstrate the flow, 
        // or effectively we should fetch the real list.
        // Let's rely on the user confirming they want to see "A" playlist.
        // I will implement a fetch for ID 1 for testing.
        handlePlaylistClick(1)
    }

    return (
        <div className="min-h-screen bg-hud-bg-primary hud-grid-bg pb-32">
            <MusicSidebar />

            {/* Main Content */}
            <main className="ml-0 md:ml-64 p-4 md:p-6">
                {/* Hero Section */}
                <section className="hud-card hud-card-bottom rounded-xl p-8 mb-8 relative overflow-hidden">
                    <div className="relative z-10">
                        <h1 className="text-4xl font-bold text-hud-accent-primary mb-3">Good Evening!</h1>
                        <p className="text-lg text-hud-text-secondary mb-6">오늘도 좋은 음악과 함께하세요</p>

                        <div className="flex gap-4">
                            <button className="bg-hud-accent-primary text-hud-bg-primary px-6 py-3 rounded-lg font-semibold flex items-center gap-2 hover:bg-hud-accent-primary/90 transition-all btn-glow">
                                <Play className="w-5 h-5" fill="currentColor" />
                                Continue Listening
                            </button>
                            <button className="bg-hud-bg-secondary border border-hud-border-secondary text-hud-text-primary px-6 py-3 rounded-lg font-semibold flex items-center gap-2 hover:bg-hud-bg-hover transition-all">
                                <Sparkles className="w-5 h-5" />
                                Surprise Me
                            </button>
                        </div>
                    </div>
                </section>

                {/* AI 추천 섹션 */}
                <section className="mb-8">
                    <div className="flex items-center justify-between mb-6">
                        <h2 className="text-2xl font-bold text-hud-text-primary flex items-center gap-3">
                            The Lab's Choice
                            <span className="bg-gradient-to-r from-hud-accent-secondary to-hud-accent-primary px-3 py-1 rounded-full text-xs font-semibold uppercase text-hud-bg-primary">
                                AI Verified
                            </span>
                        </h2>
                        <a href="#" className="text-hud-accent-primary font-medium flex items-center gap-2 hover:text-hud-accent-primary/80 transition-all">
                            View All <ArrowRight className="w-4 h-4" />
                        </a>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                        <PlaylistCard
                            title="Chill Vibes Mix" trackCount={32} confidenceScore={98} icon={<Music className="w-12 h-12" />}
                            onClick={() => handleMockClick('Chill Vibes Mix')}
                        />
                        <PlaylistCard
                            title="Rock Essentials" trackCount={45} confidenceScore={95} icon={<Guitar className="w-12 h-12" />}
                            onClick={() => handleMockClick('Rock Essentials')}
                        />
                        <PlaylistCard
                            title="Focus Flow" trackCount={28} confidenceScore={92} icon={<Headphones className="w-12 h-12" />}
                            onClick={() => handleMockClick('Focus Flow')}
                        />
                        <PlaylistCard
                            title="Energy Boost" trackCount={50} confidenceScore={89} icon={<Zap className="w-12 h-12" />}
                            onClick={() => handleMockClick('Energy Boost')}
                        />
                    </div>
                </section>

                {/* Serendipity Section */}
                <section className="hud-card hud-card-bottom rounded-xl p-6 mb-8 border-l-4 border-hud-accent-secondary">
                    <div className="flex items-center gap-4 mb-6">
                        <div className="w-12 h-12 bg-gradient-to-br from-hud-accent-secondary to-hud-accent-primary rounded-full flex items-center justify-center">
                            <Sparkles className="w-6 h-6 text-white" />
                        </div>
                        <div>
                            <h3 className="text-xl font-bold text-hud-accent-secondary">Taste Breaker</h3>
                            <p className="text-hud-text-secondary text-sm">평소 듣지 않던 장르지만, 당신이 좋아할 만한 새로운 발견</p>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                        <PlaylistCard
                            title="Jazz Exploration" trackCount={20} confidenceScore={85} icon={<Compass className="w-12 h-12" />} gradient="from-hud-accent-secondary to-hud-accent-info"
                            onClick={() => handleMockClick('Jazz Exploration')}
                        />
                        <PlaylistCard
                            title="World Beats" trackCount={18} confidenceScore={82} icon={<Globe className="w-12 h-12" />} gradient="from-hud-accent-secondary to-hud-accent-info"
                            onClick={() => handleMockClick('World Beats')}
                        />
                    </div>
                </section>

                {/* Recently Played & Stats */}
                <section className="grid lg:grid-cols-3 gap-6">
                    {/* Recent Tracks */}
                    <div className="lg:col-span-2 hud-card hud-card-bottom rounded-xl p-6">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-xl font-bold text-hud-text-primary">Recently Played</h2>
                            <a href="#" className="text-hud-accent-primary font-medium text-sm flex items-center gap-1 hover:text-hud-accent-primary/80">
                                View All <ArrowRight className="w-4 h-4" />
                            </a>
                        </div>

                        <div className="space-y-2">
                            {[
                                { title: 'Midnight Dreams', artist: 'The Dreamers', duration: '3:45' },
                                { title: 'Electric Soul', artist: 'Neon Lights', duration: '4:12' },
                                { title: 'Sunrise Symphony', artist: 'Morning Vibes', duration: '5:30' },
                                { title: 'Rhythm Nation', artist: 'Beat Masters', duration: '3:58' }
                            ].map((track, idx) => (
                                <div key={idx} className="flex items-center gap-4 p-3 rounded-lg hover:bg-hud-accent-primary/10 transition-all cursor-pointer group">
                                    <span className="w-8 text-center text-hud-text-muted font-semibold">{idx + 1}</span>
                                    <div className="w-12 h-12 bg-gradient-to-br from-hud-accent-primary to-hud-accent-info rounded-lg flex items-center justify-center text-hud-bg-primary">
                                        <Music className="w-5 h-5" />
                                    </div>
                                    <div className="flex-1">
                                        <div className="font-medium text-hud-text-primary group-hover:text-hud-accent-primary transition-colors">{track.title}</div>
                                        <div className="text-sm text-hud-text-muted">{track.artist}</div>
                                    </div>
                                    <span className="text-hud-text-muted text-sm">{track.duration}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Stats Sidebar */}
                    <div className="hud-card hud-card-bottom rounded-xl p-6">
                        <h3 className="text-lg font-bold text-hud-text-primary mb-6">Your Stats</h3>

                        <div className="space-y-6">
                            {[
                                { value: '247', label: 'Total Playlists', color: 'text-hud-accent-primary' },
                                { value: '3,492', label: 'Tracks Loved', color: 'text-hud-accent-secondary' },
                                { value: '156h', label: 'This Month', color: 'text-hud-accent-info' },
                                { value: '98%', label: 'AI Accuracy', color: 'text-hud-accent-success' }
                            ].map((stat) => (
                                <div key={stat.label} className="text-center">
                                    <div className={`text-3xl font-bold ${stat.color}`}>{stat.value}</div>
                                    <div className="text-xs text-hud-text-muted uppercase tracking-wider">{stat.label}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>
            </main>

            <MusicPlayer />

            {selectedPlaylist && (
                <TrackListOverlay
                    playlist={selectedPlaylist}
                    onClose={() => setSelectedPlaylist(null)}
                />
            )}
        </div>
    )
}

const MusicLounge = () => {
    return (
        <MusicProvider>
            <MusicLoungeContent />
        </MusicProvider>
    )
}

export default MusicLounge
