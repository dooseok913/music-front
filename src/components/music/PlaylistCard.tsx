import { Play, Music, Star } from 'lucide-react'

interface PlaylistCardProps {
    title: string
    trackCount: number
    confidenceScore?: number
    icon?: React.ReactNode
    gradient?: string
    onClick?: () => void
}

const PlaylistCard = ({
    title,
    trackCount,
    confidenceScore = 95,
    icon,
    gradient = 'from-hud-accent-primary to-hud-accent-info',
    onClick
}: PlaylistCardProps) => {
    return (
        <div
            onClick={onClick}
            className="hud-card hud-card-bottom rounded-xl p-5 cursor-pointer group transition-all hover:scale-105"
        >
            {/* Cover */}
            <div className={`w-full aspect-square bg-gradient-to-br ${gradient} rounded-lg mb-4 flex items-center justify-center text-white/40 relative overflow-hidden`}>
                {icon || <Music className="w-12 h-12" />}

                {/* Play Overlay */}
                <div className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="w-14 h-14 bg-hud-accent-primary rounded-full flex items-center justify-center text-hud-bg-primary hover:scale-110 transition-transform">
                        <Play className="w-6 h-6 ml-0.5" fill="currentColor" />
                    </div>
                </div>
            </div>

            {/* Info */}
            <div>
                <h3 className="text-base font-semibold text-hud-text-primary mb-2 group-hover:text-hud-accent-primary transition-colors">{title}</h3>
                <div className="flex items-center justify-between text-sm">
                    <span className="text-hud-text-muted">{trackCount} tracks</span>
                    {confidenceScore && (
                        <span className="bg-hud-accent-success/10 text-hud-accent-success flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold">
                            <Star className="w-3 h-3" fill="currentColor" />
                            {confidenceScore}%
                        </span>
                    )}
                </div>
            </div>
        </div>
    )
}

export default PlaylistCard
