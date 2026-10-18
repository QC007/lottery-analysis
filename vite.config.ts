import { cpSync, existsSync } from 'node:fs'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

/** 构建时把静态数据 JSON 复制进 dist，使部署产物自包含（前端与数据同源） */
function copyData(): Plugin {
  return {
    name: 'copy-data',
    apply: 'build',
    closeBundle() {
      if (existsSync('data')) cpSync('data', 'dist/data', { recursive: true })
    },
  }
}

// 部署于 GitHub Pages 项目站点：https://qc007.github.io/lottery-analysis/
export default defineConfig({
  plugins: [react(), copyData()],
  base: '/lottery-analysis/',
})
