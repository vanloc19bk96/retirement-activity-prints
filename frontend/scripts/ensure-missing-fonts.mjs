import fs from 'node:fs'
import path from 'node:path'

const FRONTEND_ROOT = process.cwd()
const FONT_FAMILIES_PATH = path.join(FRONTEND_ROOT, 'src', 'constants', 'font-families.ts')
const PUBLIC_FONTS_DIR = path.join(FRONTEND_ROOT, 'public', 'fonts')
const WINDOWS_FONTS_DIR = 'C:\\Windows\\Fonts'

/** Windows system filenames for bold variants of web-safe families used in PDF outline export. */
const WINDOWS_BOLD_FONT_FILE_BY_FAMILY = {
  'Arial': 'arialbd.ttf',
  'Book Antiqua': 'bkantb.ttf',
  'Comic Sans MS': 'comicbd.ttf',
  'Consolas': 'consolab.ttf',
  'Courier New': 'courbd.ttf',
  'Georgia': 'georgiab.ttf',
  'Impact': 'impact.ttf',
  'Lucida Sans': 'lsansb.ttf',
  'Segoe UI': 'segoeuib.ttf',
  'Tahoma': 'tahomabd.ttf',
  'Times New Roman': 'timesbd.ttf',
  'Trebuchet MS': 'trebucbd.ttf',
  'Verdana': 'verdanab.ttf',
}

function sanitizeForExpectedFilename(fontFamily) {
  return fontFamily.replace(/[\\/:"*?<>|]+/g, '').trim()
}

function listFontFiles(dirPath) {
  if (!fs.existsSync(dirPath)) return []
  const entries = fs.readdirSync(dirPath, { withFileTypes: true })
  return entries
    .filter((e) => e.isFile())
    .map((e) => e.name)
    .filter((name) => /\.(ttf|otf)$/i.test(name))
}

function basenameWithoutExtension(fileName) {
  return fileName.replace(/\.[^.]+$/u, '')
}

function findWindowsFontFileForExpected(expectedFileName) {
  const expectedBase = basenameWithoutExtension(expectedFileName)
  const expectedBaseLower = expectedBase.toLowerCase()

  const windowsFontFiles = listFontFiles(WINDOWS_FONTS_DIR)
  const candidates = windowsFontFiles
    .map((fileName) => {
      const base = basenameWithoutExtension(fileName)
      const baseLower = base.toLowerCase()

      const normalizedBaseLower = baseLower.replace(/\s+/g, '')
      const normalizedExpectedBaseLower = expectedBaseLower.replace(/\s+/g, '')

      const exact = baseLower === expectedBaseLower
      const exactNoSpaces = normalizedBaseLower === normalizedExpectedBaseLower
      const includes = baseLower.includes(expectedBaseLower) || expectedBaseLower.includes(baseLower)

      return {
        fileName,
        score: (exact ? 100 : 0) + (exactNoSpaces ? 70 : 0) + (includes ? 10 : 0),
        baseLower,
      }
    })
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score)

  return candidates[0]?.fileName ?? null
}

function parseFontFamiliesTs(text) {
  // Extract objects with `value: '...'` and optionally `localFilePath: '...'`.
  // This is a best-effort parser (repo-controlled file structure).
  const entries = []
  const objectRegex =
    /{[^{}]*?value:\s*'([^']+)'[^{}]*?isWebSafe:\s*(true|false)[^{}]*?(?:localFilePath:\s*'([^']+)')?[^{}]*?}/g
  for (const match of text.matchAll(objectRegex)) {
    const fontFamily = match[1]
    const isWebSafe = match[2] === 'true'
    const localFilePath = match[3] ?? null
    entries.push({ fontFamily, isWebSafe, localFilePath })
  }
  return entries
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true })
}

ensureDir(PUBLIC_FONTS_DIR)

if (!fs.existsSync(FONT_FAMILIES_PATH)) {
  throw new Error(`Missing ${FONT_FAMILIES_PATH}`)
}

const fontFamiliesText = fs.readFileSync(FONT_FAMILIES_PATH, 'utf8')
const fontEntries = parseFontFamiliesTs(fontFamiliesText)

const missing = []

for (const entry of fontEntries) {
  if (entry.localFilePath) {
    const expectedFile = path.posix.basename(entry.localFilePath)
    const expectedPath = path.join(PUBLIC_FONTS_DIR, expectedFile)
    if (!fs.existsSync(expectedPath)) {
      missing.push({ kind: 'local', expectedFile, expectedPath, isWebSafe: entry.isWebSafe, fontFamily: entry.fontFamily })
    }
    continue
  }

  // For fonts without `localFilePath`, export outlines will try:
  // - `/fonts/${sanitized}.ttf`
  // - `/fonts/${sanitized}.otf`
  const sanitized = sanitizeForExpectedFilename(entry.fontFamily)
  const expectedTtf = `${sanitized}.ttf`
  const expectedOtf = `${sanitized}.otf`
  const expectedTtfPath = path.join(PUBLIC_FONTS_DIR, expectedTtf)
  const expectedOtfPath = path.join(PUBLIC_FONTS_DIR, expectedOtf)

  if (!fs.existsSync(expectedTtfPath) && !fs.existsSync(expectedOtfPath)) {
    missing.push({
      kind: 'websafe-or-generic',
      expectedTtf,
      expectedOtf,
      expectedTtfPath,
      expectedOtfPath,
      isWebSafe: entry.isWebSafe,
      fontFamily: entry.fontFamily,
    })
  }

  if (entry.isWebSafe) {
    const boldExpectedFile = `${sanitized} Bold.ttf`
    const boldExpectedPath = path.join(PUBLIC_FONTS_DIR, boldExpectedFile)
    if (!fs.existsSync(boldExpectedPath)) {
      missing.push({
        kind: 'websafe-bold',
        expectedFile: boldExpectedFile,
        expectedPath: boldExpectedPath,
        fontFamily: entry.fontFamily,
      })
    }
  }
}

if (missing.length === 0) {
  console.log('All expected fonts exist in public/fonts/.')
  process.exit(0)
}

console.log(`Missing fonts: ${missing.length}`)
for (const item of missing) {
  if (item.kind === 'local') {
    console.log(`- ${item.expectedFile}: missing local font file (not auto-downloaded).`)
    continue
  }

  if (item.kind === 'websafe-bold') {
    const srcFileName = WINDOWS_BOLD_FONT_FILE_BY_FAMILY[item.fontFamily]
    if (!srcFileName) {
      console.log(`- ${item.expectedFile}: no Windows bold mapping for ${item.fontFamily}`)
      continue
    }
    const srcPath = path.join(WINDOWS_FONTS_DIR, srcFileName)
    if (!fs.existsSync(srcPath)) {
      console.log(`- ${item.expectedFile}: NOT FOUND in Windows fonts (${srcFileName})`)
      continue
    }
    fs.copyFileSync(srcPath, item.expectedPath)
    console.log(`- ${item.expectedFile}: copied from ${srcFileName}`)
    continue
  }

  // Auto-copy only for web-safe fonts; otherwise require manual TTF/OTF.
  if (!item.isWebSafe) {
    console.log(`- ${item.fontFamily}: NOT INSTALLED locally. Please add "${item.expectedTtf}" or "${item.expectedOtf}" to public/fonts/.`)
    continue
  }

  const preferredFile = item.expectedTtf
  const srcFileName = findWindowsFontFileForExpected(preferredFile) ?? findWindowsFontFileForExpected(item.expectedOtf)
  if (!srcFileName) {
    console.log(`- ${item.fontFamily}: NOT FOUND in Windows fonts`)
    continue
  }

  const srcPath = path.join(WINDOWS_FONTS_DIR, srcFileName)
  const dstPath = path.join(PUBLIC_FONTS_DIR, preferredFile)
  fs.copyFileSync(srcPath, dstPath)
  console.log(`- ${preferredFile}: copied from ${srcFileName}`)
}

console.log('Done.')

