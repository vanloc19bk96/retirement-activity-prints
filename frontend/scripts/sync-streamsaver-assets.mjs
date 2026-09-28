import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const streamSaverDir = path.join(rootDir, 'node_modules', 'streamsaver')
const publicDir = path.join(rootDir, 'public', 'streamsaver')

mkdirSync(publicDir, { recursive: true })

for (const fileName of ['mitm.html', 'sw.js']) {
  copyFileSync(path.join(streamSaverDir, fileName), path.join(publicDir, fileName))
}

// Browser extensions (Grammarly, password managers…) postMessage into the mitm iframe.
// Upstream throws on those, and since buffered messages replay via Array.forEach, one
// foreign message aborts the loop and drops our real download message. Ignore them instead.
const MITM_PATCHES = [
  [
    `throw new TypeError("[StreamSaver] You didn't send a messageChannel")`,
    `return // patched: ignore messages without a messageChannel (e.g. browser extensions)`,
  ],
  [
    `throw new TypeError("[StreamSaver] You didn't send a object")`,
    `return // patched: ignore non-object messages (e.g. browser extensions)`,
  ],
]

const mitmPath = path.join(publicDir, 'mitm.html')
let mitmSource = readFileSync(mitmPath, 'utf8')
for (const [search, replacement] of MITM_PATCHES) {
  if (!mitmSource.includes(search)) {
    throw new Error(`StreamSaver mitm.html patch target not found: ${search}`)
  }
  mitmSource = mitmSource.replace(search, replacement)
}
writeFileSync(mitmPath, mitmSource)

console.log('Synced StreamSaver assets to public/streamsaver/ (mitm.html patched)')
