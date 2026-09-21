import { describe, expect, it } from 'vitest'
import { schema as openPeepsSchema } from '@dicebear/open-peeps'
import { createRng } from '../studio-rng'
import {
  FACIAL_HAIR_POOL,
  MAX_FACE_NAME_LENGTH,
  EXCLUDED_HEADS,
  FEMALE_FACES,
  FEMALE_HEADS,
  GLASSES_POOL,
  HUMAN_FACES,
  MALE_HEADS,
  accessoryPoolForGender,
  buildDistinctFaceSpecs,
  buildFaceOptions,
  faceHasFacialHair,
  faceSpecFromMix,
  normalizeFaceMixEntry,
  parseFaceMixEntries,
  randomFaceMixEntry,
  randomFaceSpec,
  resolvePresentationGenders,
  type FaceMixEntry,
} from './face-specs'
import type { NameGender } from './names'

function firstHead(options: Record<string, unknown>): string {
  const value = options.head
  if (Array.isArray(value)) return String(value[0] ?? '')
  return String(value ?? '')
}

function firstFace(options: Record<string, unknown>): string {
  const value = options.face
  if (Array.isArray(value)) return String(value[0] ?? '')
  return String(value ?? '')
}

describe('face-name-recall face-specs', () => {
  it('partitions every Open Peeps head into male, female, or excluded', () => {
    const allHeads =
      (openPeepsSchema.properties as { head?: { items?: { enum?: string[] } } })
        .head?.items?.enum ?? []
    expect(allHeads.length).toBeGreaterThan(0)
    expect(MALE_HEADS.length + FEMALE_HEADS.length + EXCLUDED_HEADS.length).toBe(
      allHeads.length,
    )
    expect(EXCLUDED_HEADS).toEqual(
      expect.arrayContaining(['bear', 'cornrows', 'longAfro', 'longCurly', 'twists']),
    )
    expect(MALE_HEADS).toEqual(expect.arrayContaining(['twists2']))
    expect(FEMALE_HEADS).toEqual(
      expect.arrayContaining(['bantuKnots', 'short3']),
    )
    expect(FEMALE_HEADS.includes('longAfro')).toBe(false)
    expect(FEMALE_HEADS.includes('longCurly')).toBe(false)
    for (const id of ['bear', 'cornrows', 'longAfro', 'longCurly', 'twists'] as const) {
      expect(MALE_HEADS.includes(id) || FEMALE_HEADS.includes(id)).toBe(false)
    }
    for (const id of allHeads) {
      const pools = [MALE_HEADS.includes(id), FEMALE_HEADS.includes(id), EXCLUDED_HEADS.includes(id)]
      expect(pools.filter(Boolean)).toHaveLength(1)
    }
  })

  it('uses every Open Peeps expression except global and female-only exclusions', () => {
    const allFaces =
      (openPeepsSchema.properties as { face?: { items?: { enum?: string[] } } })
        .face?.items?.enum ?? []
    const globalExcluded = [
      'awe',
      'cyclops',
      'fear',
      'hectic',
      'lovingGrin1',
      'lovingGrin2',
      'monster',
      'rage',
      'smileLOL',
      'smileTeethGap',
    ] as const
    for (const id of globalExcluded) {
      expect(HUMAN_FACES.includes(id)).toBe(false)
      expect(FEMALE_FACES.includes(id)).toBe(false)
    }
    expect(HUMAN_FACES.length).toBe(allFaces.length - globalExcluded.length)
    expect(HUMAN_FACES.includes('smileBig')).toBe(true)
    expect(FEMALE_FACES.includes('smileBig')).toBe(false)
  })

  it('never pairs smile expressions with a beard', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const options = buildFaceOptions('male', createRng(seed))
      const face = firstFace(options)
      if (face === 'smile' || face === 'smileBig') {
        expect(faceHasFacialHair(options)).toBe(false)
      }
    }
    const smiled = normalizeFaceMixEntry({
      id: 'mix-smile',
      gender: 'male',
      name: 'Sam',
      head: MALE_HEADS[0],
      face: 'smile',
      facialHair: FACIAL_HAIR_POOL[0],
      glasses: '',
    })
    expect(smiled?.facialHair).toBe('')
  })

  it('female faces use a female head and never facial hair', () => {
    for (let seed = 1; seed <= 80; seed++) {
      const options = buildFaceOptions('female', createRng(seed))
      expect(FEMALE_HEADS.includes(firstHead(options))).toBe(true)
      expect(faceHasFacialHair(options)).toBe(false)
    }
  })

  it('male faces use a male head', () => {
    for (let seed = 1; seed <= 80; seed++) {
      const options = buildFaceOptions('male', createRng(seed))
      expect(MALE_HEADS.includes(firstHead(options))).toBe(true)
    }
  })

  it('facial hair appears on some male faces but never on female faces', () => {
    let beardedMales = 0
    for (let seed = 1; seed <= 80; seed++) {
      if (faceHasFacialHair(buildFaceOptions('male', createRng(seed)))) beardedMales++
      expect(faceHasFacialHair(buildFaceOptions('female', createRng(seed)))).toBe(false)
    }
    expect(beardedMales).toBeGreaterThan(0)
  })

  it('splits an all-neutral name list into both male and female faces', () => {
    const neutral: NameGender[] = Array.from({ length: 6 }, () => 'neutral')
    const present = resolvePresentationGenders(neutral, createRng(3))
    expect(present).toHaveLength(6)
    expect(present).toContain('male')
    expect(present).toContain('female')
  })

  it('keeps explicit genders and fills neutral toward the under-represented side', () => {
    const genders: NameGender[] = ['female', 'female', 'female', 'neutral']
    const present = resolvePresentationGenders(genders, createRng(9))
    expect(present.slice(0, 3)).toEqual(['female', 'female', 'female'])
    expect(present[3]).toBe('male')
  })

  it('buildDistinctFaceSpecs aligns one valid face per slot', () => {
    const genders: NameGender[] = ['female', 'male', 'neutral', 'female', 'male', 'neutral']
    const specs = buildDistinctFaceSpecs([...genders], createRng(42))
    expect(specs).toHaveLength(genders.length)
    for (const spec of specs) {
      const head = firstHead(spec.options)
      const known = MALE_HEADS.includes(head) || FEMALE_HEADS.includes(head)
      expect(known).toBe(true)
      if (faceHasFacialHair(spec.options)) {
        expect(MALE_HEADS.includes(head)).toBe(true)
      }
    }
  })

  it('excludes smileBig from female expressions only', () => {
    for (let seed = 1; seed <= 80; seed++) {
      const face = firstFace(buildFaceOptions('female', createRng(seed)))
      expect(face).not.toBe('smileBig')
      expect(FEMALE_FACES.includes(face)).toBe(true)
    }
  })

  it('never offers eyepatch', () => {
    expect(GLASSES_POOL.includes('eyepatch')).toBe(false)
    expect(accessoryPoolForGender('male').includes('eyepatch')).toBe(false)
    expect(accessoryPoolForGender('female').includes('eyepatch')).toBe(false)
  })

  it('beard pool drops every moustache, keeps chin/goatee/full', () => {
    expect(FACIAL_HAIR_POOL.every((id) => !id.startsWith('moustache'))).toBe(true)
    expect(FACIAL_HAIR_POOL).toEqual(
      expect.arrayContaining(['chin', 'full', 'goatee1', 'goatee2']),
    )
  })

  it('offers the remaining accessory library', () => {
    expect(GLASSES_POOL).toHaveLength(7)
    expect(GLASSES_POOL).toEqual(
      expect.arrayContaining(['glasses', 'sunglasses']),
    )
  })

  it('randomFaceSpec stays deterministic per seed', () => {
    const a = randomFaceSpec('male', createRng(99))
    const b = randomFaceSpec('male', createRng(99))
    expect(a).toEqual(b)
  })
})

describe('face-name-recall hand-mixed faces', () => {
  const maleMix: FaceMixEntry = {
    id: 'mix-1',
    gender: 'male',
    name: 'Ben',
    head: MALE_HEADS[0],
    face: HUMAN_FACES[0],
    facialHair: FACIAL_HAIR_POOL[0],
    glasses: GLASSES_POOL[0],
  }

  it('turns a mix entry into options that honour every pick', () => {
    const spec = faceSpecFromMix(maleMix)
    expect(firstHead(spec.options)).toBe(maleMix.head)
    expect(firstFace(spec.options)).toBe(maleMix.face)
    expect(faceHasFacialHair(spec.options)).toBe(true)
    expect(spec.options.accessoriesProbability).toBe(100)
    expect(spec.options.accessories).toEqual([maleMix.glasses])
  })

  it('drops facial hair and glasses when none were picked', () => {
    const spec = faceSpecFromMix({ ...maleMix, facialHair: '', glasses: '' })
    expect(faceHasFacialHair(spec.options)).toBe(false)
    expect(spec.options.facialHair).toBeUndefined()
    expect(spec.options.accessoriesProbability).toBe(0)
    expect(spec.options.accessories).toBeUndefined()
    expect(spec.options.maskProbability).toBe(0)
  })

  it('never keeps facial hair on a female face', () => {
    const entry = normalizeFaceMixEntry({
      ...maleMix,
      gender: 'female',
      head: FEMALE_HEADS[0],
      face: FEMALE_FACES[0],
    })
    expect(entry?.facialHair).toBe('')
  })

  it('strips unknown accessories when normalizing a mix entry', () => {
    const entry = normalizeFaceMixEntry({
      ...maleMix,
      glasses: 'eyepatch',
    })
    expect(entry?.glasses).toBe('')
  })

  it('rejects entries whose head or expression left the schema', () => {
    expect(normalizeFaceMixEntry({ ...maleMix, head: 'notAHead' })).toBeNull()
    expect(normalizeFaceMixEntry({ ...maleMix, face: 'notAFace' })).toBeNull()
    expect(normalizeFaceMixEntry({ ...maleMix, head: FEMALE_HEADS[0] })).toBeNull()
    expect(
      normalizeFaceMixEntry({
        ...maleMix,
        gender: 'female',
        head: FEMALE_HEADS[0],
        face: 'rage',
      }),
    ).toBeNull()
  })

  it('keeps a typed name (including spaces) and caps length', () => {
    expect(normalizeFaceMixEntry(maleMix)?.name).toBe('Ben')
    const long = normalizeFaceMixEntry({ ...maleMix, name: 'x'.repeat(80) })
    expect(long?.name).toHaveLength(MAX_FACE_NAME_LENGTH)
    // Trailing space must survive re-parse so the rename input can accept spaces.
    expect(normalizeFaceMixEntry({ ...maleMix, name: 'Ann ' })?.name).toBe('Ann ')
    expect(normalizeFaceMixEntry({ ...maleMix, name: 'Ann Marie' })?.name).toBe('Ann Marie')
  })

  it('parses a stored list and skips anything unusable', () => {
    const parsed = parseFaceMixEntries([maleMix, null, { ...maleMix, head: 'gone' }, 'nope'])
    expect(parsed).toHaveLength(1)
    expect(parsed[0].id).toBe('mix-1')
  })

  it('randomFaceMixEntry only offers pickable ids', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const male = randomFaceMixEntry('male', createRng(seed))
      expect(MALE_HEADS.includes(male.head)).toBe(true)
      expect(HUMAN_FACES.includes(male.face)).toBe(true)
      expect(male.facialHair === '' || FACIAL_HAIR_POOL.includes(male.facialHair)).toBe(true)
      expect(male.glasses === '' || accessoryPoolForGender('male').includes(male.glasses)).toBe(
        true,
      )

      const female = randomFaceMixEntry('female', createRng(seed))
      expect(FEMALE_HEADS.includes(female.head)).toBe(true)
      expect(FEMALE_FACES.includes(female.face)).toBe(true)
      expect(female.facialHair).toBe('')
      expect(normalizeFaceMixEntry(female)).toEqual(female)
    }
  })
})
