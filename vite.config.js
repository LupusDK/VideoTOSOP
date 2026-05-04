import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // 必須設定 base，否則 GitHub Pages 上的靜態檔案路徑會錯誤
  base: './', 
})
