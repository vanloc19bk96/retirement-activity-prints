import type { FontFamilyOption } from '@/constants/font-family.types'

function toGoogleSlug(name: string): string {
  return name.replace(/\s+/g, '+')
}

const SERIF_NO_SEMIBOLD = new Set(['PT Serif', 'Cardo'])
const SERIF_NO_BOLD_ITALIC = new Set(['Cardo'])
const SANS_NO_ITALIC = new Set(['Lexend', 'Manrope', 'Outfit', 'Oswald'])
const SANS_NO_SEMIBOLD = new Set(['Lato', 'PT Sans'])
const MONO_NO_SEMIBOLD = new Set(['Space Mono', 'Courier Prime'])

type VariantPaths = Pick<
  FontFamilyOption,
  'localFilePath' | 'localFontFilesByWeight' | 'localFontFilesByStyle'
>

function buildVariantPaths(
  name: string,
  options: {
    includeSemiBold?: boolean
    includeItalic?: boolean
    includeBoldItalic?: boolean
  } = {},
): VariantPaths {
  const includeSemiBold = options.includeSemiBold ?? true
  const includeItalic = options.includeItalic ?? true
  const includeBoldItalic = options.includeBoldItalic ?? includeItalic

  const paths: VariantPaths = {
    localFilePath: `/fonts/${name}.ttf`,
    localFontFilesByWeight: {
      bold: `/fonts/${name} Bold.ttf`,
    },
  }

  if (includeSemiBold) {
    paths.localFontFilesByWeight = {
      ...paths.localFontFilesByWeight,
      semiBold: `/fonts/${name} SemiBold.ttf`,
    }
  }

  if (includeItalic) {
    paths.localFontFilesByStyle = {
      italic: `/fonts/${name} Italic.ttf`,
    }
  }

  if (includeBoldItalic) {
    paths.localFontFilesByStyle = {
      ...paths.localFontFilesByStyle,
      boldItalic: `/fonts/${name} Bold Italic.ttf`,
    }
  }

  return paths
}

export function buildSerifFont(name: string): FontFamilyOption {
  const slug = toGoogleSlug(name)
  return {
    name,
    value: name,
    isWebSafe: false,
    strictWeightExport: true,
    googleFamily: `${slug}:ital,wght@0,400;0,700;1,400;1,700`,
    ...buildVariantPaths(name, {
      includeSemiBold: !SERIF_NO_SEMIBOLD.has(name),
      includeBoldItalic: !SERIF_NO_BOLD_ITALIC.has(name),
    }),
    canvasFontFamily: `"${name}", Georgia, serif`,
  }
}

export function buildSansFont(name: string): FontFamilyOption {
  const slug = toGoogleSlug(name)
  return {
    name,
    value: name,
    isWebSafe: false,
    strictWeightExport: true,
    googleFamily: `${slug}:ital,wght@0,400;0,700;1,400;1,700`,
    ...buildVariantPaths(name, {
      includeSemiBold: !SANS_NO_SEMIBOLD.has(name),
      includeItalic: !SANS_NO_ITALIC.has(name),
      includeBoldItalic: !SANS_NO_ITALIC.has(name),
    }),
    canvasFontFamily: `"${name}", "Segoe UI", system-ui, sans-serif`,
  }
}

export function buildMonoFont(name: string): FontFamilyOption {
  const slug = toGoogleSlug(name)
  return {
    name,
    value: name,
    isWebSafe: false,
    strictWeightExport: true,
    googleFamily: `${slug}:ital,wght@0,400;0,700;1,400;1,700`,
    ...buildVariantPaths(name, {
      includeSemiBold: !MONO_NO_SEMIBOLD.has(name),
    }),
    canvasFontFamily: `"${name}", monospace`,
  }
}

export function buildDisplayFont(name: string, googleWeights = '400'): FontFamilyOption {
  const slug = toGoogleSlug(name)
  const paths: VariantPaths = {
    localFilePath: `/fonts/${name}.ttf`,
  }

  if (name === 'Mountains of Christmas') {
    paths.localFontFilesByWeight = {
      bold: `/fonts/${name} Bold.ttf`,
    }
  }

  return {
    name,
    value: name,
    isWebSafe: false,
    googleFamily: `${slug}:wght@${googleWeights}`,
    ...paths,
  }
}

export function buildLocalFont(
  name: string,
  localFilePath: string,
  extra?: Partial<FontFamilyOption>,
): FontFamilyOption {
  return {
    name,
    value: name,
    isWebSafe: false,
    localFilePath,
    ...extra,
  }
}
