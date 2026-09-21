import type {
  StudioTemplateDefinition,
  StudioConfig,
  StudioGenerateContext,
  StudioPageOutput,
  StudioFabricObject,
} from '@/types/studio-template.types'
import { contentBox, insetHorizontal, drawHeader } from '../studio-layout'
import { type StudioTag } from '../studio-fabric-builders'
import { STUDIO_CONTENT_SAFE_INSET_X } from '@/constants/studio.constants'
import {
  FAMILY_NAMES_CONFIG_SCHEMA,
  FAMILY_NAMES_DEFAULT_TITLE,
  FAMILY_NAMES_INSTRUCTION,
  resolveFamilyNamesPageTitle,
} from './config'
import { drawFamilyNamesTable } from './draw'

function makeTag(ctx: StudioGenerateContext): StudioTag {
  return {
    templateKey: 'family-names',
    instanceId: ctx.instanceId,
    pageRole: 'single',
  }
}

function generate(config: StudioConfig, ctx: StudioGenerateContext): StudioPageOutput[] {
  const tag = makeTag(ctx)
  const objects: StudioFabricObject[] = []
  const content = insetHorizontal(contentBox(ctx), STUDIO_CONTENT_SAFE_INSET_X)
  const pageConfig = {
    ...config,
    title: resolveFamilyNamesPageTitle(config),
  }
  const header = drawHeader(content, pageConfig, tag, FAMILY_NAMES_INSTRUCTION)
  objects.push(...header.objects)
  drawFamilyNamesTable(objects, header.body, config, String(config.fontFamily), tag)
  return [{ pageRole: 'single', objects }]
}

export const familyNamesTemplate: StudioTemplateDefinition = {
  key: 'family-names',
  label: 'Family Names',
  category: 'reminiscence',
  description:
    'A large-print keepsake sheet to write family members’ labels, first names, last names, and ages. Choose how many rows fit the page.',
  pageCount: 1,
  producesAnswerKey: false,
  seedInvariant: true,
  defaultPageTitle: FAMILY_NAMES_DEFAULT_TITLE,
  thumbnail: `<svg viewBox="0 0 64 40" xmlns="http://www.w3.org/2000/svg">
    <g stroke="currentColor" stroke-width="0.7" fill="none" opacity="0.75">
      <path d="M4 10h56M4 18h56M4 26h56M4 34h56"/>
      <path d="M18 10v24M38 10v24M52 10v24"/>
    </g>
    <g font-size="4.5" fill="currentColor" font-family="serif" opacity="0.85">
      <text x="6" y="8">Label</text><text x="20" y="8">First</text>
      <text x="40" y="8">Last</text><text x="54" y="8">Age</text>
    </g>
  </svg>`,
  configSchema: FAMILY_NAMES_CONFIG_SCHEMA,
  generate,
}
