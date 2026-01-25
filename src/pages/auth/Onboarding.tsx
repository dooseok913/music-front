import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Loader2, CheckCircle, Music, ArrowRight, ShieldCheck, Zap } from 'lucide-react'
import Button from '../../components/common/Button'
import TidalLoginModal from '../../components/auth/TidalLoginModal'
import { post } from '../../services/api/index'

const Onboarding = () => {
    const navigate = useNavigate()
    const [searchParams] = useSearchParams()
    const [servicesToSync, setServicesToSync] = useState<string[]>([])
    const [currentServiceIndex, setCurrentServiceIndex] = useState(0)
    const [isSyncing, setIsSyncing] = useState(false)
    const [syncedServices, setSyncedServices] = useState<string[]>([])
    const [showModal, setShowModal] = useState(false)

    useEffect(() => {
        const servicesStr = searchParams.get('services')
        if (servicesStr) {
            setServicesToSync(servicesStr.split(','))
        } else {
            // If no services selected, just go home
            navigate('/')
        }
    }, [searchParams])

    useEffect(() => {
        // Auto-start the first service if something is selected
        if (servicesToSync.length > 0 && currentServiceIndex < servicesToSync.length && !isSyncing && syncedServices.length === 0) {
            handleNextService()
        }
    }, [servicesToSync])

    const handleNextService = () => {
        if (currentServiceIndex < servicesToSync.length) {
            const nextService = servicesToSync[currentServiceIndex]
            if (nextService === 'tidal') {
                setShowModal(true)
            } else {
                // For other services not yet implemented, just skip for now
                setSyncedServices(prev => [...prev, nextService])
                setCurrentServiceIndex(prev => prev + 1)
            }
        } else {
            // All done!
            setTimeout(() => navigate('/'), 2000)
        }
    }

    const handleTidalSuccess = async (response: any) => {
        console.log('[Onboarding] Tidal login success received')
        setShowModal(false)
        setIsSyncing(true)
        try {
            // Call server-side sync for Tidal
            const result = await post('/auth/sync/tidal', { tidalAuthData: response })
            console.log('[Onboarding] Tidal sync complete:', result)
            setSyncedServices(prev => [...prev, 'tidal'])
            setCurrentServiceIndex(prev => prev + 1)
        } catch (error: any) {
            console.error('Tidal sync failed:', error)
            // Even if sync failed, we might want to allow moving forward
            // or show a retry button. For now let's show an alert.
            alert(`동기화 중 오류가 발생했습니다: ${error.message || 'Unknown error'}`)
            setCurrentServiceIndex(prev => prev + 1)
        } finally {
            setIsSyncing(false)
        }
    }

    useEffect(() => {
        // After one service finishes, wait a bit and trigger next
        if (syncedServices.length > 0 && !isSyncing && !showModal) {
            if (currentServiceIndex < servicesToSync.length) {
                const timer = setTimeout(() => handleNextService(), 1000)
                return () => clearTimeout(timer)
            } else {
                // Finished all
                const timer = setTimeout(() => navigate('/music/home'), 2000)
                return () => clearTimeout(timer)
            }
        }
    }, [currentServiceIndex, isSyncing, showModal])

    return (
        <div className="min-h-screen bg-hud-bg-primary hud-grid-bg flex items-center justify-center p-6">
            <div className="w-full max-w-2xl">
                <div className="text-center mb-12 animate-in fade-in slide-in-from-bottom-4 duration-700">
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-hud-accent-primary/10 border border-hud-accent-primary/20 text-hud-accent-primary text-sm font-medium mb-4">
                        <Zap size={14} />
                        <span>Smart Onboarding</span>
                    </div>
                    <h1 className="text-4xl font-bold text-hud-text-primary mb-4 text-glow">
                        환영합니다! 거의 다 왔어요.
                    </h1>
                    <p className="text-hud-text-secondary text-lg">
                        선택하신 음악 서비스들을 연결하여 플레이리스트를 동기화합니다.
                    </p>
                </div>

                <div className="grid gap-4">
                    {servicesToSync.map((service, index) => {
                        const isCompleted = syncedServices.includes(service)
                        const isActive = currentServiceIndex === index && !isCompleted

                        return (
                            <div
                                key={service}
                                className={`hud-card p-6 flex items-center justify-between transition-all duration-500 ${isActive ? 'border-hud-accent-primary bg-hud-accent-primary/5 scale-[1.02]' : 'opacity-70'
                                    } ${isCompleted ? 'border-green-500/50 bg-green-500/5' : ''}`}
                            >
                                <div className="flex items-center gap-4">
                                    <div className={`w-12 h-12 rounded-lg flex items-center justify-center font-bold text-xl ${service === 'tidal' ? 'bg-black text-white' : 'bg-hud-bg-secondary text-hud-text-muted'
                                        }`}>
                                        {service.charAt(0).toUpperCase()}
                                    </div>
                                    <div>
                                        <h3 className="text-lg font-bold text-hud-text-primary capitalize">{service}</h3>
                                        <p className="text-sm text-hud-text-secondary">
                                            {isCompleted ? '동기화 완료' : isActive ? '연결 대기 중...' : '대기 중'}
                                        </p>
                                    </div>
                                </div>

                                {isCompleted ? (
                                    <CheckCircle className="text-green-500 w-8 h-8 animate-in zoom-in duration-300" />
                                ) : isActive ? (
                                    <div className="flex items-center gap-2 text-hud-accent-primary">
                                        <Loader2 className="animate-spin" />
                                        <span className="font-medium">Connecting...</span>
                                    </div>
                                ) : (
                                    <div className="w-8 h-8 rounded-full border-2 border-dashed border-hud-border-secondary" />
                                )}
                            </div>
                        )
                    })}
                </div>

                {currentServiceIndex >= servicesToSync.length && syncedServices.length > 0 && (
                    <div className="mt-12 text-center animate-in fade-in zoom-in duration-500">
                        <div className="flex flex-col items-center gap-4">
                            <div className="w-16 h-16 bg-green-500/10 rounded-full flex items-center justify-center text-green-500 mb-2">
                                <ShieldCheck size={40} />
                            </div>
                            <h2 className="text-2xl font-bold text-hud-text-primary">모든 준비가 끝났습니다!</h2>
                            <p className="text-hud-text-secondary">대시보드로 이동하여 음악을 즐겨보세요.</p>
                            <Button
                                variant="primary"
                                glow
                                className="mt-4 px-10 py-3"
                                onClick={() => navigate('/music/home')}
                            >
                                시작하기 <ArrowRight size={18} className="ml-2" />
                            </Button>
                        </div>
                    </div>
                )}

                <div className="mt-8 text-center">
                    <button
                        onClick={() => navigate('/music/home')}
                        className="text-hud-text-muted hover:text-hud-text-primary transition-colors text-sm"
                    >
                        나중에 연결하기
                    </button>
                </div>
            </div>

            <TidalLoginModal
                isOpen={showModal && servicesToSync[currentServiceIndex] === 'tidal'}
                onClose={() => setShowModal(false)}
                onSuccess={handleTidalSuccess}
            />
        </div>
    )
}

export default Onboarding
