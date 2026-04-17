import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// 把 '/CitySimWeb/' 换成你的 GitHub 仓库名，例如 '/my-repo/'
// 本地 dev 时 base 不影响，只在 build 时生效
const REPO_NAME = '/SongCitySim/'

export default defineConfig({
  plugins: [react()],
  base: process.env.NODE_ENV === 'production' ? REPO_NAME : '/',
})

