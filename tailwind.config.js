/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    darkMode: 'class',
    theme: {
        extend: {
            colors: {
                // HUD Theme Colors
                hud: {
                    bg: {
                        primary: '#0E1726',
                        secondary: '#141B2D',
                        card: 'rgba(20, 27, 45, 0.8)',
                        hover: 'rgba(30, 40, 60, 0.9)',
                    },
                    accent: {
                        primary: '#00FFCC',
                        secondary: '#FF1493',
                        warning: '#FFA500',
                        info: '#6366F1',
                        success: '#10B981',
                        danger: '#EF4444',
                    },
                    text: {
                        primary: '#FFFFFF',
                        secondary: '#A0AEC0',
                        muted: '#64748B',
                    },
                    border: {
                        primary: 'rgba(0, 255, 204, 0.3)',
                        secondary: 'rgba(255, 255, 255, 0.1)',
                    }
                }
            },
            fontFamily: {
                sans: ['Inter', 'Roboto', 'system-ui', 'sans-serif'],
                mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
            },
            boxShadow: {
                'hud': '0 0 20px rgba(0, 255, 204, 0.1)',
                'hud-glow': '0 0 30px rgba(0, 255, 204, 0.3)',
                'hud-pink': '0 0 20px rgba(255, 20, 147, 0.3)',
            },
            animation: {
                'pulse-glow': 'pulse-glow 2s ease-in-out infinite',
                'fade-in': 'fadeIn 0.3s ease-out',
                'slide-in': 'slideIn 0.3s ease-out',
            },
            keyframes: {
                'pulse-glow': {
                    '0%, 100%': { boxShadow: '0 0 20px rgba(0, 255, 204, 0.2)' },
                    '50%': { boxShadow: '0 0 40px rgba(0, 255, 204, 0.4)' },
                },
                fadeIn: {
                    '0%': { opacity: '0' },
                    '100%': { opacity: '1' },
                },
                slideIn: {
                    '0%': { transform: 'translateX(-10px)', opacity: '0' },
                    '100%': { transform: 'translateX(0)', opacity: '1' },
                },
            },
            backgroundImage: {
                'hud-grid': `
          linear-gradient(rgba(0, 255, 204, 0.03) 1px, transparent 1px),
          linear-gradient(90deg, rgba(0, 255, 204, 0.03) 1px, transparent 1px)
        `,
            },
            backgroundSize: {
                'grid': '50px 50px',
            },
        },
    },
    plugins: [],
}
