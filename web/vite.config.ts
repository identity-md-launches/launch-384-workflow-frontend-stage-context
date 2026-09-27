import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
export default defineConfig({
  plugins: [react(), {
    name: 'deployment-for-local-dev',
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const path = request.url?.split('?')[0] || ''
        if (path !== '/imd-deployment.json' && !/^\/abi\/[A-Za-z0-9_]+\.json$/.test(path)) return next()
        try {
          const bytes = await readFile(resolve(import.meta.dirname, '../dist', path.slice(1)))
          response.setHeader('Content-Type', 'application/json')
          response.end(bytes)
        } catch { response.statusCode = 503; response.end('Run npm run build first to prepare the deployment.') }
      })
    },
  }], base: './',
  build: { outDir: '../dist', emptyOutDir: true, sourcemap: false },
})
