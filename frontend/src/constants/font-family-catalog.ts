import type { FontFamilyOption } from '@/constants/font-family.types'
import {
  buildDisplayFont,
  buildLocalFont,
  buildMonoFont,
  buildSansFont,
  buildSerifFont,
} from '@/constants/font-family-builders'

const BODY_SERIF = [
  'Lora',
  'Merriweather',
  'Playfair Display',
  'Cormorant Garamond',
  'EB Garamond',
  'Crimson Text',
  'Crimson Pro',
  'Alegreya',
  'Source Serif 4',
  'PT Serif',
  'Vollkorn',
  'Bitter',
  'Noto Serif',
  'Literata',
  'Cardo',
  'Spectral',
  'Gelasio',
  'Rokkitt',
  'Besley',
  'Fraunces',
  'Newsreader',
] as const

const BODY_SANS = [
  'Inter',
  'Open Sans',
  'Roboto',
  'Poppins',
  'Raleway',
  'Lexend',
  'Lato',
  'Montserrat',
  'Nunito',
  'Nunito Sans',
  'Work Sans',
  'Rubik',
  'Mulish',
  'Karla',
  'Source Sans 3',
  'Josefin Sans',
  'PT Sans',
  'Manrope',
  'Plus Jakarta Sans',
  'Hanken Grotesk',
  'Outfit',
  'Oswald',
] as const

const MONO = ['Roboto Mono', 'JetBrains Mono', 'Space Mono', 'Courier Prime'] as const

const DISPLAY = [
  'Abril Fatface',
  'Anton',
  'Bebas Neue',
  'Lobster',
  'Lobster Two',
  'Pacifico',
  'Righteous',
  'Cinzel',
  'Cinzel Decorative',
  'Yeseva One',
  'Cormorant',
  'Alfa Slab One',
  'Archivo Black',
  'Bangers',
  'Creepster',
  'Chewy',
  'Bungee',
  'Galindo',
  'Pattaya',
  'Oi',
  'Ewert',
  'Henny Penny',
  'Mountains of Christmas',
  'Freckle Face',
  'Finger Paint',
  'DotGothic16',
  'Aoboshi One',
] as const

const TRACING: FontFamilyOption[] = [
  buildLocalFont('Tracey Dot', '/fonts/TraceyDot.ttf'),
  buildLocalFont('Tracey Solid', '/fonts/TraceySolid.ttf'),
  buildLocalFont('Edu AU VIC WA NT Hand', '/fonts/Edu AU VIC WA NT Hand.ttf'),
  buildLocalFont('Edu AU VIC WA NT Hand Dots', '/fonts/Edu AU VIC WA NT Hand Dots.ttf', {
    canvasFontFamily:
      '"Edu AU VIC WA NT Hand Dots", "Edu Australia VIC WA NT Hand Dots", "Edu AU VIC WA NT Dots", cursive',
    legacyNames: ['Edu Australia VIC WA NT Hand Dots', 'Edu AU VIC WA NT Dots'],
  }),
  buildLocalFont('Playwrite US Modern', '/fonts/Playwrite US Modern.ttf'),
  buildLocalFont('Playwrite US Modern Guides', '/fonts/Playwrite US Modern Guides.ttf'),
  {
    name: 'Raleway Dots',
    value: 'Raleway Dots',
    isWebSafe: false,
    localFilePath: '/fonts/Raleway Dots.ttf',
    googleFamily: 'Raleway+Dots',
  },
  {
    name: 'Londrina Outline',
    value: 'Londrina Outline',
    isWebSafe: false,
    localFilePath: '/fonts/Londrina Outline.ttf',
    googleFamily: 'Londrina+Outline',
  },
]

export function buildFontFamilyCatalog(): FontFamilyOption[] {
  const displayFonts = DISPLAY.map((name) => {
    if (name === 'Mountains of Christmas') {
      return buildDisplayFont(name, '400;700')
    }
    return buildDisplayFont(name)
  })

  return [
    ...BODY_SERIF.map(buildSerifFont),
    ...BODY_SANS.map(buildSansFont),
    ...MONO.map(buildMonoFont),
    ...displayFonts,
    ...TRACING,
  ]
}
