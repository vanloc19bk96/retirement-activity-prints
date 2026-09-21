import fs from 'node:fs'
import path from 'node:path'

const FRONTEND_ROOT = path.resolve(
  path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')),
  '..',
)
const PUBLIC_FONTS_DIR = path.join(FRONTEND_ROOT, 'public', 'fonts')
const MODERN_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'

const SERIF_NO_SEMIBOLD = new Set(['PT Serif', 'Cardo'])
const SERIF_NO_BOLD_ITALIC = new Set(['Cardo'])
const SANS_NO_ITALIC = new Set(['Lexend', 'Manrope', 'Outfit', 'Oswald'])
const SANS_NO_SEMIBOLD = new Set(['Lato', 'PT Sans'])
const MONO_NO_SEMIBOLD = new Set(['Space Mono', 'Courier Prime'])

const BODY_SERIF = [
  'Lora', 'Merriweather', 'Playfair Display', 'Cormorant Garamond', 'EB Garamond',
  'Crimson Text', 'Crimson Pro', 'Alegreya', 'Source Serif 4', 'PT Serif', 'Vollkorn',
  'Bitter', 'Noto Serif', 'Literata', 'Cardo', 'Spectral', 'Gelasio', 'Rokkitt', 'Besley',
  'Fraunces', 'Newsreader',
]

const BODY_SANS = [
  'Inter', 'Open Sans', 'Roboto', 'Poppins', 'Raleway', 'Lexend', 'Lato', 'Montserrat',
  'Nunito', 'Nunito Sans', 'Work Sans', 'Rubik', 'Mulish', 'Karla', 'Source Sans 3',
  'Josefin Sans', 'PT Sans', 'Manrope', 'Plus Jakarta Sans', 'Hanken Grotesk', 'Outfit', 'Oswald',
]

const MONO = ['Roboto Mono', 'JetBrains Mono', 'Space Mono', 'Courier Prime']

const DISPLAY = [
  'Abril Fatface', 'Anton', 'Bebas Neue', 'Lobster', 'Lobster Two', 'Pacifico', 'Righteous',
  'Cinzel', 'Cinzel Decorative', 'Yeseva One', 'Cormorant', 'Alfa Slab One', 'Archivo Black',
  'Bangers', 'Creepster', 'Chewy', 'Bungee', 'Galindo', 'Pattaya', 'Oi', 'Ewert',
  'Henny Penny', 'Mountains of Christmas', 'Freckle Face', 'Finger Paint', 'DotGothic16', 'Aoboshi One',
]

const TRACING_GOOGLE = [
  { name: 'Raleway Dots', google: 'Raleway+Dots' },
  { name: 'Londrina Outline', google: 'Londrina+Outline' },
]

function toGoogleSlug(name) {
  return name.replace(/\s+/g, '+')
}

function variantFileNames(name, category) {
  const files = [`${name}.ttf`, `${name} Bold.ttf`]

  const includeSemiBold =
    category === 'serif' ? !SERIF_NO_SEMIBOLD.has(name)
    : category === 'sans' ? !SANS_NO_SEMIBOLD.has(name)
    : category === 'mono' ? !MONO_NO_SEMIBOLD.has(name)
    : false

  const includeItalic =
    category === 'serif' ? true
    : category === 'sans' ? !SANS_NO_ITALIC.has(name)
    : category === 'mono'

  const includeBoldItalic =
    category === 'serif' ? !SERIF_NO_BOLD_ITALIC.has(name)
    : includeItalic

  if (includeSemiBold) files.push(`${name} SemiBold.ttf`)
  if (includeItalic) files.push(`${name} Italic.ttf`)
  if (includeBoldItalic) files.push(`${name} Bold Italic.ttf`)

  return files
}

function buildDownloads() {
  const downloads = []

  for (const name of BODY_SERIF) {
    const google = toGoogleSlug(name)
    for (const fileName of variantFileNames(name, 'serif')) {
      downloads.push({
        googleFamily: `${google}:ital,wght@0,400;0,700;1,400;1,700`,
        fileName,
      })
    }
  }

  for (const name of BODY_SANS) {
    const google = toGoogleSlug(name)
    for (const fileName of variantFileNames(name, 'sans')) {
      downloads.push({
        googleFamily: `${google}:ital,wght@0,400;0,700;1,400;1,700`,
        fileName,
      })
    }
  }

  for (const name of MONO) {
    const google = toGoogleSlug(name)
    for (const fileName of variantFileNames(name, 'mono')) {
      downloads.push({
        googleFamily: `${google}:ital,wght@0,400;0,700;1,400;1,700`,
        fileName,
      })
    }
  }

  for (const name of DISPLAY) {
    const google = toGoogleSlug(name)
    if (name === 'Mountains of Christmas') {
      downloads.push({
        googleFamily: `${google}:wght@400;700`,
        fileName: `${name}.ttf`,
      })
      downloads.push({
        googleFamily: `${google}:wght@400;700`,
        fileName: `${name} Bold.ttf`,
        weight: 700,
        style: 'normal',
      })
      continue
    }
    downloads.push({
      googleFamily: `${google}:wght@400`,
      fileName: `${name}.ttf`,
    })
  }

  for (const { name, google } of TRACING_GOOGLE) {
    downloads.push({ googleFamily: google, fileName: `${name}.ttf` })
  }

  return downloads
}

function isLikelyFontBinary(buffer) {
  if (buffer.byteLength < 4) return false
  const tag = new DataView(buffer).getUint32(0, false)
  return (
    tag === 0x00010000 ||
    tag === 0x74727565 ||
    tag === 0x4f54544f ||
    tag === 0x774f4646 ||
    tag === 0x774f4632
  )
}

function inferVariantFromFileName(fileName) {
  const base = fileName.replace(/\.(ttf|otf)$/i, '')
  if (/ bold italic$/i.test(base)) return { weight: 700, style: 'italic' }
  if (/ italic$/i.test(base)) return { weight: 400, style: 'italic' }
  if (/ semibold$/i.test(base)) return { weight: 600, style: 'normal' }
  if (/ bold$/i.test(base)) return { weight: 700, style: 'normal' }
  return { weight: 400, style: 'normal' }
}

function buildGoogleQuery(googleFamily, weight, style) {
  const baseFamily = googleFamily.split(':')[0]
  const axisPart = googleFamily.split(':')[1] ?? 'wght@400'

  if (axisPart.startsWith('ital,wght@')) {
    const styleAxis = style === 'italic' ? 1 : 0
    return `${baseFamily}:ital,wght@${styleAxis},${weight}`
  }

  return `${baseFamily}:wght@${weight}`
}

function extractMatchingUrl(css, weight, style) {
  for (const block of css.split('@font-face')) {
    const blockStyle = block.match(/font-style:\s*([^;]+)/)?.[1]?.trim() ?? 'normal'
    const blockWeight = Number.parseInt(block.match(/font-weight:\s*(\d+)/)?.[1] ?? '400', 10)
    if (blockStyle !== style || blockWeight !== weight) continue

    const url = block.match(/url\(([^)]+)\)/)?.[1]?.trim().replace(/^["']|["']$/g, '')
    if (url?.startsWith('http')) return url
  }
  return null
}

async function downloadVariant({ googleFamily, destPath, weight, style }) {
  if (fs.existsSync(destPath)) {
    console.log(`SKIP ${path.basename(destPath)}`)
    return
  }

  const query = buildGoogleQuery(googleFamily, weight, style)
  const cssUrl = `https://fonts.googleapis.com/css2?family=${query}&display=swap`
  const cssResponse = await fetch(cssUrl, { headers: { 'User-Agent': MODERN_UA } })
  if (!cssResponse.ok) {
    throw new Error(`Failed to fetch CSS for ${query}: ${cssResponse.status}`)
  }

  const css = await cssResponse.text()
  const fontUrl = extractMatchingUrl(css, weight, style)
  if (!fontUrl) {
    throw new Error(`No @font-face for ${query} (${style} ${weight})`)
  }

  const fontResponse = await fetch(fontUrl)
  if (!fontResponse.ok) {
    throw new Error(`Failed to download ${fontUrl}: ${fontResponse.status}`)
  }

  const buffer = await fontResponse.arrayBuffer()
  if (!isLikelyFontBinary(buffer)) {
    throw new Error(`Not a font binary: ${path.basename(destPath)}`)
  }

  fs.writeFileSync(destPath, Buffer.from(buffer))
  console.log(`OK   ${path.basename(destPath)}`)
}

if (!fs.existsSync(PUBLIC_FONTS_DIR)) {
  fs.mkdirSync(PUBLIC_FONTS_DIR, { recursive: true })
}

const downloads = buildDownloads()
let failed = 0

for (const item of downloads) {
  const destPath = path.join(PUBLIC_FONTS_DIR, item.fileName)
  const inferred = inferVariantFromFileName(item.fileName)
  const weight = item.weight ?? inferred.weight
  const style = item.style ?? inferred.style

  try {
    await downloadVariant({
      googleFamily: item.googleFamily,
      destPath,
      weight,
      style,
    })
  } catch (error) {
    failed += 1
    console.error(`FAIL ${item.fileName}: ${error.message}`)
  }
}

console.log(`Done. failed=${failed}`)
