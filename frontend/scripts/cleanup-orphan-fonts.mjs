import fs from 'node:fs'
import path from 'node:path'

const FRONTEND_ROOT = path.resolve(
  path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')),
  '..',
)
const PUBLIC_FONTS_DIR = path.join(FRONTEND_ROOT, 'public', 'fonts')

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

const LOCAL_ONLY = [
  'TraceyDot.ttf',
  'TraceySolid.ttf',
  'Edu AU VIC WA NT Hand.ttf',
  'Edu AU VIC WA NT Hand Dots.ttf',
  'Playwrite US Modern.ttf',
  'Playwrite US Modern Guides.ttf',
  'Raleway Dots.ttf',
  'Londrina Outline.ttf',
]

const REMOVED_LEGACY = [
  'Arial', 'Arial Black', 'Book Antiqua', 'Brush Script MT', 'Comic Sans MS', 'Consolas',
  'Courier New', 'Dotline', 'DotPreschool', 'Doto', 'Garamond', 'Georgia', 'Impact',
  'Lucida Handwriting', 'Lucida Sans', 'Monaco', 'Oh Okey', 'Palatino', 'Pwbacktoschool',
  'Segoe UI', 'Tahoma', 'Times New Roman', 'Trebuchet MS', 'Verdana',
]

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

function buildExpectedFiles() {
  const expected = new Set(['.gitkeep', ...LOCAL_ONLY])

  for (const name of BODY_SERIF) {
    for (const fileName of variantFileNames(name, 'serif')) expected.add(fileName)
  }
  for (const name of BODY_SANS) {
    for (const fileName of variantFileNames(name, 'sans')) expected.add(fileName)
  }
  for (const name of MONO) {
    for (const fileName of variantFileNames(name, 'mono')) expected.add(fileName)
  }

  for (const name of DISPLAY) {
    expected.add(`${name}.ttf`)
    if (name === 'Mountains of Christmas') {
      expected.add(`${name} Bold.ttf`)
    }
  }

  return expected
}

const expectedFiles = buildExpectedFiles()
const existingFiles = fs.readdirSync(PUBLIC_FONTS_DIR)

let removed = 0
for (const fileName of existingFiles) {
  if (expectedFiles.has(fileName)) continue
  if (!/\.(ttf|otf)$/i.test(fileName)) continue

  const isLegacy = REMOVED_LEGACY.some((legacy) => fileName.toLowerCase().startsWith(legacy.toLowerCase()))
  if (!isLegacy && !expectedFiles.has(fileName)) {
    // Only remove files that are clearly legacy web-safe or unknown custom fonts.
    const knownCustomRemoved = ['Dotline.otf', 'DotPreschool.ttf', 'Doto.ttf', 'Pwbacktoschool.ttf', 'Oh Okey.otf']
    if (!knownCustomRemoved.includes(fileName)) continue
  }

  fs.unlinkSync(path.join(PUBLIC_FONTS_DIR, fileName))
  removed += 1
  console.log(`REMOVED ${fileName}`)
}

console.log(`Done. removed=${removed}`)
