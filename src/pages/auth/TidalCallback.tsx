import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Loader2, CheckCircle, XCircle } from 'lucide-react'
import { tidalApi } from '../../services/api/tidal'

const TidalCallback = () => {
    const [searchParams] = useSearchParams()
    const navigate = useNavigate()
    const [status, setStatus] = useState<'processing' | 'success' | 'error'>('processing')
    const [errorMsg, setErrorMsg] = useState('')

    useEffect(() => {
        const code = searchParams.get('code')
        const error = searchParams.get('error')

        if (error) {
            setStatus('error')
            setErrorMsg(error)
            return
        }

        if (code) {
            handleExchange(code)
        } else {
            setStatus('error')
            setErrorMsg('No authorization code found')
        }
    }, [searchParams])

    const handleExchange = async (code: string) => {
        try {
            const response = await tidalApi.exchangeCode(code)
            if (response.success) {
                setStatus('success')
                // Notify parent window if opened as popup
                if (window.opener) {
                    window.opener.postMessage({ type: 'TIDAL_LOGIN_SUCCESS', user: response.user }, '*')
                    setTimeout(() => window.close(), 1500)
                } else {
                    // Navigate back to external space if main window
                    setTimeout(() => navigate('/music/external-space'), 1500)
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
                        <p className="text-hud-text-secondary">This window will close automatically.</p>
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
