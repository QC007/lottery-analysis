import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// 部署于 GitHub Pages 项目站点：https://qc007.github.io/lottery-analysis/
export default defineConfig({
  plugins: [react()],
  base: '/lottery-analysis/',
})
