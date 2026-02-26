import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: '/procedural-generation/',
  plugins: [react()],
  optimizeDeps: {
    exclude: ['three']
  }
})