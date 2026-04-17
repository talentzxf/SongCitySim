import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const REPO_NAME = '/SongCitySim/'

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  base: mode === 'production' ? REPO_NAME : '/',
}))
