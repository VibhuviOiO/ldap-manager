import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [
    react(),
  ],
  base: process.env.CONTEXT_PATH || '/',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  define: {
    'import.meta.env.VITE_FOOTER_TEXT': JSON.stringify(
      process.env.VITE_FOOTER_TEXT || 'LDAP Manager • Built by <a href="https://vibhuvioio.com" target="_blank" class="text-primary hover:underline">Vibhuvi OiO</a>'
    ),
    'import.meta.env.VITE_CONTEXT_PATH': JSON.stringify(
      process.env.CONTEXT_PATH || ''
    ),
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'ui-vendor': ['lucide-react', 'sonner'],
        },
      },
    },
  },
})
