import { useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { Mail, Lock, Eye, EyeOff, Loader2 } from 'lucide-react'
import Button from '../../components/common/Button'
import TidalLoginModal from '../../components/auth/TidalLoginModal'
import { login } from '../../services/api/auth'
import { useAuth } from '../../contexts/AuthContext'

const Login = () => {
    const navigate = useNavigate()
    const location = useLocation()
    const { setUser } = useAuth()
    const from = (location.state as { from?: { pathname: string } })?.from?.pathname || '/'
    const [showPassword, setShowPassword] = useState(false)
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [isTidalModalOpen, setIsTidalModalOpen] = useState(false)
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState('')
    const [selectedServices, setSelectedServices] = useState<string[]>([])

    const toggleService = (id: string) => {
        setSelectedServices(prev =>
            prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]
        )
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setError('')
        setIsLoading(true)

        try {
            const response = await login({ email, password })
            setUser(response.user)
            navigate(from, { replace: true })
        } catch (err) {
            setError(err instanceof Error ? err.message : '로그인에 실패했습니다')
        } finally {
            setIsLoading(false)
        }
    }

    const handleTidalSuccess = (userData: any) => {
        setUser(userData)
        navigate(from, { replace: true })
        setIsTidalModalOpen(false)
    }

    return (
        <div className="min-h-screen bg-hud-bg-primary hud-grid-bg flex items-center justify-center p-6">
            <div className="w-full max-w-md">
                {/* Logo */}
                <div className="text-center mb-8">
                    <div className="inline-flex items-center gap-3 mb-6">
                        <div className="w-12 h-12 bg-gradient-to-br from-hud-accent-primary to-hud-accent-info rounded-lg flex items-center justify-center font-bold text-xl text-hud-bg-primary">
                            H
                        </div>
                        <span className="font-bold text-2xl text-hud-text-primary text-glow">ALPHA TEAM</span>
                    </div>
                    <h1 className="text-2xl font-bold text-hud-text-primary">Welcome Back</h1>
                    <p className="text-hud-text-muted mt-2">Sign in to your account to continue</p>
                </div>

                {/* Login Form */}
                <div className="hud-card hud-card-bottom rounded-lg p-8">
                    <form onSubmit={handleSubmit} className="space-y-6">
                        {/* Error Message */}
                        {error && (
                            <div className="p-3 bg-red-500/10 border border-red-500/50 rounded-lg text-red-400 text-sm">
                                {error}
                            </div>
                        )}
                        {/* Email */}
                        <div>
                            <label className="block text-sm text-hud-text-secondary mb-2">Email Address</label>
                            <div className="relative">
                                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-hud-text-muted" size={18} />
                                <input
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="Enter your email"
                                    className="w-full pl-12 pr-4 py-3 bg-hud-bg-primary border border-hud-border-secondary rounded-lg text-hud-text-primary placeholder-hud-text-muted focus:outline-none focus:border-hud-accent-primary transition-hud"
                                />
                            </div>
                        </div>

                        {/* Password */}
                        <div>
                            <label className="block text-sm text-hud-text-secondary mb-2">Password</label>
                            <div className="relative">
                                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-hud-text-muted" size={18} />
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="Enter your password"
                                    className="w-full pl-12 pr-12 py-3 bg-hud-bg-primary border border-hud-border-secondary rounded-lg text-hud-text-primary placeholder-hud-text-muted focus:outline-none focus:border-hud-accent-primary transition-hud"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-4 top-1/2 -translate-y-1/2 text-hud-text-muted hover:text-hud-text-primary transition-hud"
                                >
                                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                </button>
                            </div>
                        </div>

                        {/* Remember & Forgot */}
                        <div className="flex items-center justify-between">
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="checkbox"
                                    className="w-4 h-4 rounded border-hud-border-secondary bg-hud-bg-primary text-hud-accent-primary focus:ring-hud-accent-primary"
                                />
                                <span className="text-sm text-hud-text-secondary">Remember me</span>
                            </label>
                            <a href="#" className="text-sm text-hud-accent-primary hover:underline">
                                Forgot password?
                            </a>
                        </div>

                        {/* Music Services Section (Condensed) */}
                        <div className="flex flex-col gap-3 pt-6">
                            <div className="flex items-center gap-2">
                                <div className="h-[1px] flex-1 bg-hud-border-secondary/50"></div>
                                <span className="text-[10px] uppercase tracking-wider font-bold text-hud-text-muted px-2">함께해요</span>
                                <div className="h-[1px] flex-1 bg-hud-border-secondary/50"></div>
                            </div>
                            <p className="text-[11px] text-hud-text-muted text-center -mt-1 mb-1">
                                구독 중이신 서비스를 선택해주세요.
                            </p>

                            <div className="grid grid-cols-5 gap-1.5">
                                {/* Tidal */}
                                <button
                                    type="button"
                                    onClick={() => toggleService('tidal')}
                                    className={`flex flex-col items-center justify-center p-1.5 rounded-lg transition-all border ${selectedServices.includes('tidal')
                                        ? 'bg-hud-accent-primary/20 border-hud-accent-primary text-hud-accent-primary'
                                        : 'bg-hud-bg-primary border-hud-border-secondary text-hud-text-muted hover:border-hud-text-muted'
                                        }`}
                                    title="Tidal"
                                >
                                    <div className={`w-7 h-7 rounded flex items-center justify-center font-bold text-xs mb-1 ${selectedServices.includes('tidal') ? 'bg-hud-accent-primary text-hud-bg-primary' : 'bg-black text-white'
                                        }`}>T</div>
                                    <span className="text-[9px] font-bold">Tidal</span>
                                </button>

                                {/* YouTube Music */}
                                <button
                                    type="button"
                                    onClick={() => toggleService('youtube')}
                                    className={`flex flex-col items-center justify-center p-1.5 rounded-lg transition-all border ${selectedServices.includes('youtube')
                                        ? 'bg-[#FF0000]/20 border-[#FF0000] text-[#FF0000]'
                                        : 'bg-hud-bg-primary border-hud-border-secondary text-hud-text-muted hover:border-hud-text-muted'
                                        }`}
                                    title="YouTube Music"
                                >
                                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs mb-1 ${selectedServices.includes('youtube') ? 'bg-[#FF0000] text-white' : 'bg-[#FF0000]/10 text-[#FF0000]'
                                        }`}>▶</div>
                                    <span className="text-[9px] font-bold">YouTube</span>
                                </button>

                                {/* Apple Music */}
                                <button
                                    type="button"
                                    onClick={() => toggleService('apple')}
                                    className={`flex flex-col items-center justify-center p-1.5 rounded-lg transition-all border ${selectedServices.includes('apple')
                                        ? 'bg-pink-500/20 border-pink-500 text-pink-500'
                                        : 'bg-hud-bg-primary border-hud-border-secondary text-hud-text-muted hover:border-hud-text-muted'
                                        }`}
                                    title="Apple Music"
                                >
                                    <div className={`w-7 h-7 rounded flex items-center justify-center text-white text-xs mb-1 ${selectedServices.includes('apple') ? 'bg-pink-500' : 'bg-gradient-to-br from-pink-500 to-orange-400'
                                        }`}></div>
                                    <span className="text-[9px] font-bold">Apple</span>
                                </button>

                                {/* Spotify */}
                                <button
                                    type="button"
                                    onClick={() => toggleService('spotify')}
                                    className={`flex flex-col items-center justify-center p-1.5 rounded-lg transition-all border ${selectedServices.includes('spotify')
                                        ? 'bg-[#1DB954]/20 border-[#1DB954] text-[#1DB954]'
                                        : 'bg-hud-bg-primary border-hud-border-secondary text-hud-text-muted hover:border-hud-text-muted'
                                        }`}
                                    title="Spotify"
                                >
                                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-base mb-1 ${selectedServices.includes('spotify') ? 'bg-[#1DB954] text-black' : 'bg-[#1DB954]/10 text-[#1DB954]'
                                        }`}>●</div>
                                    <span className="text-[9px] font-bold">Spotify</span>
                                </button>

                                {/* Other */}
                                <button
                                    type="button"
                                    onClick={() => toggleService('other')}
                                    className={`flex flex-col items-center justify-center p-1.5 rounded-lg transition-all border ${selectedServices.includes('other')
                                        ? 'bg-hud-text-muted/20 border-hud-text-muted text-hud-text-primary'
                                        : 'bg-hud-bg-primary border-hud-border-secondary text-hud-text-muted hover:border-hud-text-muted'
                                        }`}
                                    title="이외"
                                >
                                    <div className={`w-7 h-7 rounded flex items-center justify-center text-xs mb-1 ${selectedServices.includes('other') ? 'bg-hud-text-muted text-hud-bg-primary' : 'bg-hud-bg-secondary text-hud-text-muted'
                                        }`}>...</div>
                                    <span className="text-[9px] font-bold">이외</span>
                                </button>
                            </div>
                        </div>

                        {/* Submit */}
                        <Button variant="primary" fullWidth glow type="submit" disabled={isLoading} className="mt-2">
                            {isLoading ? (
                                <span className="flex items-center justify-center gap-2">
                                    <Loader2 className="animate-spin" size={18} />
                                    로그인 중...
                                </span>
                            ) : (
                                'Sign In'
                            )}
                        </Button>
                    </form>

                    {/* Register Link */}
                    <p className="text-center text-sm text-hud-text-muted mt-6">
                        Don't have an account?{' '}
                        <Link to="/register" className="text-hud-accent-primary hover:underline">
                            Sign up
                        </Link>
                    </p>
                </div>
            </div>

            {/* Tidal Login Modal */}
            <TidalLoginModal
                isOpen={isTidalModalOpen}
                onClose={() => setIsTidalModalOpen(false)}
                onSuccess={handleTidalSuccess}
            />
        </div>
    )
}

export default Login
