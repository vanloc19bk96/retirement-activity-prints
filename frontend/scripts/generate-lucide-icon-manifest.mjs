/**
 * Parses `dynamicIconImports.js` and emits one canonical kebab name per unique
 * `./icons/*.js` target (aliases like alarm-check vs alarm-clock-check deduped).
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const frontendRoot = path.join(__dirname, '..')
const dyPath = path.join(frontendRoot, 'node_modules/lucide-react/dist/esm/dynamicIconImports.js')
const text = fs.readFileSync(dyPath, 'utf8')

const fileToKey = new Map()
const re = /"([^"]+)":\s*\(\)\s*=>\s*import\('\.\/icons\/([^']+)'\)/g
let m = re.exec(text)
while (m !== null) {
  const key = m[1]
  const file = m[2]
  if (!fileToKey.has(file)) fileToKey.set(file, key)
  m = re.exec(text)
}

const names = [...fileToKey.values()].sort((a, b) => a.localeCompare(b))
const outDir = path.join(frontendRoot, 'src', 'generated')
fs.mkdirSync(outDir, { recursive: true })
const outPath = path.join(outDir, 'lucide-icon-names.json')
fs.writeFileSync(outPath, `${JSON.stringify(names)}\n`)
console.log(`Wrote ${names.length} icon names to ${path.relative(frontendRoot, outPath)}`)
