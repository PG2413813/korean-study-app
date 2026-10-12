import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { viteSingleFile } from 'vite-plugin-singlefile'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const BG_DIR = path.resolve(here, '../backgrounds')

const MIME = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
  '.webp': 'image/webp', '.gif': 'image/gif', '.json': 'application/json'
}

// 开发时把项目根目录的 backgrounds/ 直接映射过来，避免复制一份 8MB 图片
function serveRootBackgrounds() {
  return {
    name: 'serve-root-backgrounds',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url || !req.url.startsWith('/backgrounds/')) return next()
        const rel = decodeURIComponent(req.url.slice('/backgrounds/'.length).split('?')[0])
        const file = path.resolve(BG_DIR, rel)
        if (!file.startsWith(BG_DIR) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return next()
        res.setHeader('Content-Type', MIME[path.extname(file).toLowerCase()] || 'application/octet-stream')
        res.setHeader('Cache-Control', 'no-cache')
        fs.createReadStream(file).pipe(res)
      })
    }
  }
}

export default defineConfig({
  base: './',
  plugins: [serveRootBackgrounds(), vue(), viteSingleFile()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    cssCodeSplit: false,
    assetsInlineLimit: 100000000,
    reportCompressedSize: false,
    rollupOptions: { output: { inlineDynamicImports: true } }
  }
})
