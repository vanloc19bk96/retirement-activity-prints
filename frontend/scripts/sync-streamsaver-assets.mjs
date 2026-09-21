import { copyFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const streamSaverDir = path.join(rootDir, 'node_modules', 'streamsaver')
const publicDir = path.join(rootDir, 'public', 'streamsaver')

mkdirSync(publicDir, { recursive: true })

for (const fileName of ['mitm.html', 'sw.js']) {
  copyFileSync(path.join(streamSaverDir, fileName), path.join(publicDir, fileName))
}

console.log('Synced StreamSaver assets to public/streamsaver/')
