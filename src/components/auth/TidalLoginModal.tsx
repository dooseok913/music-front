import { useState, useEffect, useRef } from 'react'
import { X, ExternalLink, Loader2, CheckCircle, AlertCircle, Copy, Check } from 'lucide-react'
import { tidalApi } from '../../services/api/tidal'
import Button from '../common/Button'

interface TidalLoginModalProps {
    isOpen: boolean
    onClose: () => void
    onSuccess: (user: any) => void
}

const TidalLoginModal = ({ isOpen, onClose, onSuccess }: TidalLoginModalProps) => {
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [deviceCode, setDeviceCode] = useState<string | null>(null)
    const [userCode, setUserCode] = useState<string | null>(null)
    const [verificationUri, setVerificationUri] = useState<string | null>(null)
    const [expiresIn, setExpiresIn] = useState<number>(0)
    const [pollingInterval, setPollingInterval] = useState<number>(5)

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
            initAuth()
        } else {
            stopPolling()
            resetState()
        }
    }, [isOpen])

    const resetState = () => {
        setLoading(true)
        setError(null)
        setDeviceCode(null)
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

    const initAuth = async () => {
        try {
            setLoading(true)
            setError(null)

            const response = await tidalApi.initDeviceAuth()

            if (!isMounted.current) return

            if (response.deviceCode) {
                setDeviceCode(response.deviceCode)
                setUserCode(response.userCode)
                setVerificationUri(response.verificationUri)
                setExpiresIn(response.expiresIn)
                setPollingInterval(response.interval || 5)

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
                        onSuccess(response.user)
                        onClose()
                    }
                } else if (response.error && response.error !== 'authorization_pending') {
                    // Stop polling on fatal errors
                    stopPolling()
                    if (isMounted.current) {
                        setError(response.error_description || response.error)
                    }
                }
            } catch (err) {
                // Network errors or other issues, maybe retry or stop?
                // For now, let's keep polling unless it's a 500
                console.warn('Polling error', err)
            }
        }, intervalSeconds * 1000)
    }

    if (!isOpen) return null

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="bg-hud-bg-card border border-hud-border-secondary rounded-xl max-w-md w-full shadow-2xl relative overflow-hidden">
                {/* Header */}
                <div className="p-6 border-b border-hud-border-secondary flex items-center justify-between">
                    <h2 className="text-xl font-bold text-hud-text-primary flex items-center gap-2">
                        <div className="w-8 h-8 bg-black text-white rounded flex items-center justify-center font-bold font-serif">T</div>
                        Login with Tidal
                    </h2>
                    <button
                        onClick={onClose}
                        className="text-hud-text-muted hover:text-hud-text-primary transition-colors"
                    >
                        <X size={24} />
                    </button>
                </div>

                {/* Content */}
                <div className="p-8 flex flex-col items-center text-center">
                    {loading ? (
                        <div className="py-12 flex flex-col items-center gap-4">
                            <Loader2 className="w-10 h-10 text-hud-accent-primary animate-spin" />
                            <p className="text-hud-text-secondary">Connecting to Tidal...</p>
                        </div>
                    ) : error ? (
                        <div className="py-8 flex flex-col items-center gap-4">
                            <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center text-red-500">
                                <AlertCircle size={32} />
                            </div>
                            <h3 className="text-lg font-bold text-hud-text-primary">Connection Failed</h3>
                            <p className="text-sm text-hud-text-secondary">{error}</p>
                            <Button variant="secondary" onClick={initAuth} className="mt-4">
                                Try Again
                            </Button>
                        </div>
                    ) : (
                        <div className="w-full space-y-6">
                            <div className="space-y-2">
                                <p className="text-hud-text-secondary">
                                    Enter this code at the link below to connect your account:
                                </p>
                                <div className="relative">
                                    <div className="text-4xl font-mono font-bold text-hud-accent-primary tracking-widest bg-hud-bg-secondary py-4 rounded-lg border border-hud-border-secondary select-all">
                                        {userCode}
                                    </div>
                                    <button
                                        onClick={handleCopyCode}
                                        className="absolute right-4 top-1/2 -translate-y-1/2 p-2 text-hud-text-muted hover:text-hud-text-primary transition-colors"
                                        title="Copy Code"
                                    >
                                        {copied ? <Check className="w-5 h-5 text-green-500" /> : <Copy className="w-5 h-5" />}
                                    </button>
                                </div>
                            </div>

                            <a
                                href={verificationUri?.startsWith('http') ? verificationUri : `https://${verificationUri}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center justify-center gap-2 w-full py-3 bg-hud-accent-primary text-hud-bg-primary rounded-lg font-bold hover:bg-hud-accent-primary/90 transition-all btn-glow"
                            >
                                Go to {verificationUri} <ExternalLink size={18} />
                            </a>

                            <div className="flex items-center justify-center gap-2 text-sm text-hud-text-muted">
                                <Loader2 className="w-4 h-4 animate-spin" />
                                <span>Waiting for you to log in...</span>
                            </div>

                            <div className="pt-4 border-t border-hud-border-secondary">
                                <p className="text-xs text-hud-text-muted">
                                    This code will expire in {Math.floor(expiresIn / 60)} minutes.
                                </p>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}

export default TidalLoginModal
