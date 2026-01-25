import { useEffect, useState, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Loader2, CheckCircle, XCircle } from 'lucide-react'
import { tidalApi } from '../../services/api/tidal'

const TidalCallback = () => {
    const [searchParams] = useSearchParams()
    const [status, setStatus] = useState<'processing' | 'success' | 'error'>('processing')
    const [errorMsg, setErrorMsg] = useState('')
    const isExchanging = useRef(false) // Flag to ensure handleExchange runs only once

    // Check if this is a popup window
    const isPopup = window.opener !== null || window.name === 'TidalLogin'

    useEffect(() => {
        const code = searchParams.get('code')
        const error = searchParams.get('error')

        if (error) {
            setStatus('error')
            setErrorMsg(error)
            return
        }

        if (code && !isExchanging.current) {
            isExchanging.current = true // Set flag to true to prevent re-execution
            handleExchange(code)
        } else if (!code) { // Only set error if no code and no error param
            setStatus('error')
            setErrorMsg('No authorization code found')
        }
    }, [searchParams])

    const handleExchange = async (code: string) => {
        try {
            const response = await tidalApi.exchangeCode(code)
            if (response.success) {
                setStatus('success')

                const messageData = {
                    type: 'TIDAL_LOGIN_SUCCESS',
                    response,
                    timestamp: Date.now()
                }

                // 1. Primary: postMessage to opener
                if (window.opener) {
                    try {
                        window.opener.postMessage(messageData, '*')
                    } catch (e) {
                        console.error('postMessage failed', e)
                    }
                }

                // 2. Fallback: localStorage (works if same origin)
                localStorage.setItem('tidal_login_result', JSON.stringify(messageData))

                // Always try to close if it's a popup
                if (isPopup) {
                    // Try to close after a short delay
                    setTimeout(() => {
                        window.close()
                    }, 1000)
                }
            } else {
                throw new Error('Exchange failed')
            }
        } catch (err: any) {
            setStatus('error')
            setErrorMsg(err.message || 'Failed to exchange token')
        }
    }

    return (
        <div className="min-h-screen bg-hud-bg-primary flex items-center justify-center">
            <div className="bg-hud-bg-card border border-hud-border-secondary rounded-xl p-8 max-w-md w-full text-center shadow-2xl">
                {status === 'processing' && (
                    <div className="flex flex-col items-center gap-4">
                        <Loader2 className="w-12 h-12 text-hud-accent-primary animate-spin" />
                        <h2 className="text-xl font-bold text-hud-text-primary">Connecting to Tidal...</h2>
                        <p className="text-hud-text-secondary">Please wait while we verify your login.</p>
                    </div>
                )}

                {status === 'success' && (
                    <div className="flex flex-col items-center gap-4">
                        <CheckCircle className="w-12 h-12 text-hud-accent-success" />
                        <h2 className="text-xl font-bold text-hud-accent-success">Login Successful!</h2>
                        <p className="text-hud-text-secondary">이 창은 자동으로 닫힙니다.</p>
                        <button
                            onClick={() => window.close()}
                            className="mt-2 bg-hud-accent-success text-white px-4 py-2 rounded-lg hover:bg-hud-accent-success/90"
                        >
                            창 닫기
                        </button>
                    </div>
                )}

                {status === 'error' && (
                    <div className="flex flex-col items-center gap-4">
                        <XCircle className="w-12 h-12 text-hud-accent-error" />
                        <h2 className="text-xl font-bold text-hud-accent-error">Login Failed</h2>
                        <p className="text-hud-text-secondary mb-4">{errorMsg}</p>
                        <button
                            onClick={() => window.close()}
                            className="bg-hud-bg-secondary px-4 py-2 rounded-lg text-hud-text-primary hover:bg-hud-bg-hover"
                        >
                            Close Window
                        </button>
                    </div>
                )}
            </div>
        </div>
    )
}

export default TidalCallback
