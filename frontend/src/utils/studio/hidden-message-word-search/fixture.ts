/**
 * A payload shaped like one the content service returns.
 *
 * Wider than the plain word search's fixture on purpose. A hidden-message grid
 * is filled exactly, so the packer needs a spread of lengths to land on: a pool
 * of nothing but six-letter words can only ever claim multiples of six, and no
 * multiple of six is going to equal the free cells left over from a
 * twenty-one-letter saying.
 */
export const FIXTURE_WORDS = [
  'Garden',
  'Travel',
  'Cruise',
  'Family',
  'Hobby',
  'Relax',
  'Sunset',
  'Friends',
  'Nature',
  'Reading',
  'Sailing',
  'Freedom',
  'Journey',
  'Weekend',
  'Picnic',
  'Social',
  'Outing',
  'Comfort',
  'Leisure',
  'Memory',
  'Pension',
  'Hammock',
  'Book',
  'Walk',
  'Lake',
  'Bird',
  'Rose',
  'Sofa',
  'Golf',
  'Fish',
  'Boat',
  'Yard',
  'Knit',
  'Quilt',
  'Porch',
  'Shade',
  'Peace',
  'Smile',
  'Bench',
  'Ramble',
]

export const FIXTURE_MESSAGE = 'EVERY DAY IS SATURDAY NOW'

export const HIDDEN_MESSAGE_FIXTURE = {
  message: FIXTURE_MESSAGE,
  words: FIXTURE_WORDS,
}
