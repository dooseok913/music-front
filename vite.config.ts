import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
    plugins: [react()],
    resolve: {
        alias: {
            '@': fileURLToPath(new URL('./src', import.meta.url)),
        },
    },
    server: {
        host: true,     // 외부 접속 허용 (0.0.0.0)
        port: 5173,     // 포트 번호
        allowedHosts: ['host.docker.internal', 'localhost'],
        proxy: {
            '/api': {
                target: 'http://localhost:3001',
                changeOrigin: true,
                secure: false
            },
            '/images': {
                target: 'http://localhost:3001',
                changeOrigin: true,
                secure: false
            },
            '/apple-proxy': {
                target: 'https://amp-api-edge.music.apple.com/v1',
                changeOrigin: true,
                secure: true,
                rewrite: (path) => path.replace(/^\/apple-proxy/, ''),
                headers: {
                    'Origin': 'https://music.apple.com',
                    'Referer': 'https://music.apple.com/'
                }
            }
        }
    },
    build: {
        target: 'esnext' // Allow top-level await
    },
    esbuild: {
        target: 'esnext' // Allow top-level await
    },
    optimizeDeps: {
        esbuildOptions: {
            target: 'esnext'
        }
    }
})
