import { useState, useEffect, useRef } from 'react'
import { X, ExternalLink, Loader2, AlertCircle, Music, Copy, Check, Smartphone, Globe } from 'lucide-react'
import { tidalApi } from '../../services/api/tidal'
import Button from '../common/Button'

interface TidalLoginModalProps {
    isOpen: boolean
    onClose: () => void
    onSuccess: (response: any) => void
}

const TidalLoginModal = ({ isOpen, onClose, onSuccess }: TidalLoginModalProps) => {
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [userCode, setUserCode] = useState<string | null>(null)
    const [verificationUri, setVerificationUri] = useState<string | null>(null)
    const [expiresIn, setExpiresIn] = useState<number>(0)

    const pollTimerRef = useRef<NodeJS.Timeout | null>(null)
    const isMounted = useRef(true)

    useEffect(() => {
        isMounted.current = true
        return () => {
            isMounted.current = false
            stopPolling()
        }
    }, [])

    useEffect(() => {
        if (isOpen) {
            resetState()
        } else {
            stopPolling()
            resetState()
        }
    }, [isOpen])

    const resetState = () => {
        setLoading(false)
        setError(null)
        setUserCode(null)
        setVerificationUri(null)
    }

    const [copied, setCopied] = useState(false)
    const handleCopyCode = () => {
        if (userCode) {
            navigator.clipboard.writeText(userCode)
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
        }
    }

    const stopPolling = () => {
        if (pollTimerRef.current) {
            clearInterval(pollTimerRef.current)
            pollTimerRef.current = null
        }
    }

    const initDeviceAuth = async () => {
        try {
            setLoading(true)
            setError(null)

            const response = await tidalApi.initDeviceAuth()

            if (!isMounted.current) return

            if (response.deviceCode) {
                setUserCode(response.userCode)
                // Ensure verificationUri has protocol
                let uri = response.verificationUri || 'link.tidal.com'
                if (!uri.startsWith('http')) {
                    uri = `https://${uri}`
                }
                setVerificationUri(uri)
                setExpiresIn(response.expiresIn)

                setLoading(false)
                startPolling(response.deviceCode, response.interval || 5)
            } else {
                throw new Error('Invalid response from server')
            }
        } catch (err: any) {
            if (isMounted.current) {
                setError(err.message || 'Failed to initialize Tidal login')
                setLoading(false)
            }
        }
    }

    const startPolling = (code: string, intervalSeconds: number) => {
        stopPolling()

        pollTimerRef.current = setInterval(async () => {
            try {
                const response = await tidalApi.pollToken(code)

                if (response.success && response.user) {
                    if (isMounted.current) {
                        stopPolling()
                        onSuccess(response)
                        onClose()
                    }
                } else if (response.error && response.error !== 'authorization_pending') {
                    stopPolling()
                    if (isMounted.current) {
                        setError(response.error_description || response.error)
                    }
                }
            } catch (err) {
                console.warn('Polling error', err)
            }
        }, intervalSeconds * 1000)
    }

    // Web Flow (Popup) Support
    useEffect(() => {
        const handleLoginSuccess = (data: any) => {
            onSuccess(data)
            onClose()
            // Clear the storage item
            localStorage.removeItem('tidal_login_result')
        }

        const handleMessage = (event: MessageEvent) => {
            if (event.data?.type === 'TIDAL_LOGIN_SUCCESS') {
                handleLoginSuccess(event.data.response)
            }
        }

        const handleStorage = (event: StorageEvent) => {
            if (event.key === 'tidal_login_result' && event.newValue) {
                try {
                    const data = JSON.parse(event.newValue)
                    if (data.type === 'TIDAL_LOGIN_SUCCESS') {
                        handleLoginSuccess(data.response)
                    }
                } catch (e) {
                    console.error('Failed to parse storage data', e)
                }
            }
        }

        window.addEventListener('message', handleMessage)
        window.addEventListener('storage', handleStorage)

        // Also check if result is already there (if the window was opened/closed quickly)
        const existingResult = localStorage.getItem('tidal_login_result')
        if (existingResult) {
            try {
                const data = JSON.parse(existingResult)
                if (data.type === 'TIDAL_LOGIN_SUCCESS') {
                    // Check if message is fresh (last 30 seconds)
                    if (Date.now() - data.timestamp < 30000) {
                        handleLoginSuccess(data.response)
                    }
                }
            } catch (e) { }
        }

        return () => {
            window.removeEventListener('message', handleMessage)
            window.removeEventListener('storage', handleStorage)
        }
    }, [onSuccess, onClose])

    const handleWebLogin = () => {
        const width = 600
        const height = 800
        const left = window.screen.width / 2 - width / 2
        const top = window.screen.height / 2 - height / 2

        // Clear any old results before starting
        localStorage.removeItem('tidal_login_result')

        window.open(
            `${window.location.origin}/api/tidal/auth/login`,
            'TidalLogin',
            `width=${width},height=${height},top=${top},left=${left},noopener,noreferrer`
        )
    }

    if (!isOpen) return null

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="bg-hud-bg-card border border-hud-border-secondary rounded-xl max-w-md w-full shadow-2xl relative overflow-hidden">
                <div className="p-6 border-b border-hud-border-secondary flex items-center justify-between">
                    <h2 className="text-xl font-bold text-hud-text-primary flex items-center gap-2">
                        <div className="w-8 h-8 bg-black text-white rounded flex items-center justify-center font-bold font-serif">T</div>
                        Sign in with Tidal
                    </h2>
                    <button onClick={onClose} className="text-hud-text-muted hover:text-hud-text-primary transition-colors">
                        <X size={24} />
                    </button>
                </div>

                <div className="p-2 space-y-6">
                    {loading ? (
                        <div className="py-20 flex flex-col items-center justify-center gap-4">
                            <Loader2 className="w-12 h-12 text-cyan-400 animate-spin" />
                            <p className="text-gray-400 animate-pulse">인증 정보를 가져오는 중...</p>
                        </div>
                    ) : userCode ? (
                        <div className="flex flex-col items-center py-4 animate-in fade-in zoom-in duration-300">
                            <div className="mb-6 text-center">
                                <p className="text-cyan-400 font-medium mb-1">복사된 코드를 아래 링크에서 입력하세요</p>
                                <p className="text-xs text-gray-500">인증이 완료되면 이 창은 자동으로 닫힙니다</p>
                            </div>

                            <div className="relative group w-full max-w-[280px] mb-8">
                                <div className="absolute -inset-1 bg-gradient-to-r from-cyan-500 to-blue-500 rounded-2xl blur opacity-25 group-hover:opacity-50 transition duration-1000 group-hover:duration-200"></div>
                                <div className="relative bg-black rounded-xl p-6 border border-white/10 flex flex-col items-center">
                                    <span className="text-4xl font-black text-white tracking-[0.2em] font-mono leading-none">
                                        {userCode}
                                    </span>
                                    <button
                                        onClick={handleCopyCode}
                                        className={`mt-4 w-full py-2 rounded-lg flex items-center justify-center gap-2 transition-all ${copied ? 'bg-green-500/20 text-green-400 border-green-500/30' : 'bg-white/5 hover:bg-white/10 text-gray-400 border-white/10'} border`}
                                    >
                                        {copied ? <Check size={16} /> : <Copy size={16} />}
                                        <span className="text-sm font-medium">{copied ? '복사 완료' : '코드 복사'}</span>
                                    </button>
                                </div>
                            </div>

                            <a
                                href={verificationUri || '#'}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="group/link flex items-center gap-2 py-3 px-8 bg-white text-black rounded-lg font-bold hover:bg-cyan-50 transition-all text-base"
                            >
                                Tidal 인증 사이트로 이동
                                <ExternalLink size={18} className="group-hover/link:translate-x-1 group-hover/link:-translate-y-1 transition-transform" />
                            </a>

                            <button
                                onClick={() => { setUserCode(null); stopPolling(); }}
                                className="mt-8 text-sm text-gray-500 hover:text-white transition-colors"
                            >
                                다른 방법으로 로그인
                            </button>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 gap-4 py-2">
                            {/* Device Auth - Recommended */}
                            <button
                                onClick={initDeviceAuth}
                                className="group relative flex flex-col items-start p-6 bg-[#1a1a1a] rounded-2xl border border-white/5 hover:border-cyan-500/50 transition-all text-left"
                            >
                                <div className="absolute top-4 right-4 bg-cyan-500/10 text-cyan-400 text-[10px] font-bold px-2 py-1 rounded">권장</div>
                                <div className="w-12 h-12 bg-cyan-500/10 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                                    <Smartphone className="w-6 h-6 text-cyan-400" />
                                </div>
                                <h3 className="text-lg font-bold text-white mb-2">기기 코드로 로그인</h3>
                                <p className="text-sm text-gray-400 leading-relaxed">
                                    가장 안정적인 방식입니다. 표시되는 6자리 코드를 입력하여 안전하게 연동하세요.
                                </p>
                            </button>

                            {/* Web Auth */}
                            <button
                                onClick={handleWebLogin}
                                className="group flex flex-col items-start p-6 bg-[#1a1a1a] rounded-2xl border border-white/5 hover:border-white/20 transition-all text-left"
                            >
                                <div className="w-12 h-12 bg-gray-500/10 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                                    <Globe className="w-6 h-6 text-gray-400" />
                                </div>
                                <h3 className="text-lg font-bold text-white mb-2">웹 브라우저로 로그인</h3>
                                <p className="text-sm text-gray-400 leading-relaxed">
                                    팝업창을 통해 평소처럼 아이디/비밀번호로 로그인합니다.
                                </p>
                            </button>

                            {error && (
                                <div className="mt-2 p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-start gap-3 text-red-500 text-sm">
                                    <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                                    <span>{error}</span>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}

export default TidalLoginModal
