/**
 * Everything a Farewell Party logic grid is written from.
 *
 * A puzzle is a *theme* (a party scene and the categories that belong to it),
 * a handful of people, and one value from each chosen category per person. The
 * pools are wide on purpose: variety comes from which categories meet, which
 * values are drawn, who holds them and how the clues are built — never from a
 * bank of finished puzzles.
 *
 * Tone rules the pools follow: warm and adult, no ageing jokes, nothing about
 * health, money, family status, home ownership or physical ability, no brands,
 * no real people and nothing that assumes one country. Grid labels stay short
 * (twelve characters at most) so they print whole in a narrow column.
 */

export const LG_TEMPLATE_KEY = 'farewell-logic-grid'
export const LG_DEFAULT_TITLE = 'Logic Grid: Farewell Party'

export const LG_PAGE_TOO_SMALL_MESSAGE =
  'This page size is too small for a logic grid — choose a larger page size in Settings.'
export const LG_BUILD_FAILED_MESSAGE =
  'A puzzle that solves cleanly could not be built this time. Please generate again.'

/** Longest label a grid row or column may carry. */
export const LG_MAX_LABEL_CHARS = 12

export type LgLevelValue = 'gentle' | 'classic' | 'challenging'

export interface LgValue {
  /** Grid label, title case. */
  label: string
  /** How the value reads after the category's verb ("the apple pie"). */
  phrase: string
}

/** Relative-order wording for a category whose values run in sequence. */
export interface LgOrdinal {
  /** "retired earlier than" — subject first, then the other person. */
  less: string
  /** "retired later than". */
  more: string
  /** Exact gap of `steps` places, subject before the other ("retired two months before"). */
  stepLess: (steps: number) => string
  /** Exact gap of `steps` places, subject after the other ("retired two months after"). */
  stepMore: (steps: number) => string
  /** Values must start at the first of the pool (a toast order starts at "first"). */
  fromStart?: boolean
}

export interface LgCategory {
  key: string
  /** Grid heading. */
  title: string
  /** "brought a different dish" — joined into the scenario. */
  scenario: string
  /** "brought" — the clue verb, followed by a value's phrase. */
  verb: string
  /** "did not bring". */
  negVerb: string
  /** "the person who brought the apple pie"; defaults to `the person who {verb} {phrase}`. */
  who?: (value: LgValue) => string
  ordinal?: LgOrdinal
  /** Ordinal pools are listed in order. */
  values: readonly LgValue[]
}

const v = (label: string, phrase = label.toLowerCase()): LgValue => ({ label, phrase })
const the = (label: string) => v(label, `the ${label.toLowerCase()}`)

const NUMBER_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six']
export const numberWord = (n: number) => NUMBER_WORDS[n] ?? String(n)
const plural = (n: number, one: string, many: string) => `${numberWord(n)} ${n === 1 ? one : many}`

export const LG_CATEGORIES: readonly LgCategory[] = [
  {
    key: 'dish',
    title: 'Dish',
    scenario: 'brought a different dish',
    verb: 'brought',
    negVerb: 'did not bring',
    values: [
      the('Apple pie'),
      the('Pasta salad'),
      the('Cookies'),
      the('Sandwiches'),
      the('Lemon cake'),
      the('Fruit salad'),
      the('Deviled eggs'),
      the('Meatballs'),
      the('Brownies'),
      the('Potato salad'),
      the('Cornbread'),
      the('Banana bread'),
      the('Veggie tray'),
      the('Cheese tray'),
      the('Chili'),
      the('Lasagna'),
      the('Coleslaw'),
      the('Spring rolls'),
    ],
  },
  {
    key: 'gift',
    title: 'Gift',
    scenario: 'received a different farewell gift',
    verb: 'received',
    negVerb: 'did not receive',
    values: [
      the('Photo album'),
      the('Wind chime'),
      the('Bird feeder'),
      the('Tea set'),
      the('Cookbook'),
      the('Desk clock'),
      the('Puzzle book'),
      the('Garden tools'),
      the('Paint set'),
      the('Picnic set'),
      the('Fountain pen'),
      the('Journal'),
      the('Houseplant'),
      the('Star map'),
    ],
  },
  {
    key: 'month',
    title: 'Month',
    scenario: 'retired in a different month this year',
    verb: 'retired in',
    negVerb: 'did not retire in',
    ordinal: {
      less: 'retired earlier in the year than',
      more: 'retired later in the year than',
      stepLess: (n) => `retired ${plural(n, 'month', 'months')} before`,
      stepMore: (n) => `retired ${plural(n, 'month', 'months')} after`,
    },
    values: [
      'January',
      'February',
      'March',
      'April',
      'May',
      'June',
      'July',
      'August',
      'September',
      'October',
      'November',
      'December',
    ].map((m) => v(m, m)),
  },
  {
    key: 'years',
    title: 'Service',
    scenario: 'worked a different number of years',
    verb: 'worked',
    negVerb: 'did not work',
    ordinal: {
      less: 'worked fewer years than',
      more: 'worked more years than',
      stepLess: (n) => `worked ${n * 5} fewer years than`,
      stepMore: (n) => `worked ${n * 5} more years than`,
    },
    values: [10, 15, 20, 25, 30, 35, 40].map((y) => v(`${y} years`, `${y} years`)),
  },
  {
    key: 'job',
    title: 'Job',
    scenario: 'retired from a different job',
    verb: 'worked as',
    negVerb: 'did not work as',
    who: (value) => `the former ${value.label.toLowerCase()}`,
    values: [
      v('Librarian', 'a librarian'),
      v('Nurse', 'a nurse'),
      v('Teacher', 'a teacher'),
      v('Baker', 'a baker'),
      v('Mail carrier', 'a mail carrier'),
      v('Engineer', 'an engineer'),
      v('Bookkeeper', 'a bookkeeper'),
      v('Pharmacist', 'a pharmacist'),
      v('Electrician', 'an electrician'),
      v('Chef', 'a chef'),
      v('Bus driver', 'a bus driver'),
      v('Carpenter', 'a carpenter'),
      v('Tailor', 'a tailor'),
      v('Florist', 'a florist'),
      v('Plumber', 'a plumber'),
    ],
  },
  {
    key: 'department',
    title: 'Department',
    scenario: 'worked in a different department',
    verb: 'worked',
    negVerb: 'did not work',
    values: [
      v('Shipping', 'in shipping'),
      v('Payroll', 'in payroll'),
      v('Front desk', 'at the front desk'),
      v('Sales', 'in sales'),
      v('Maintenance', 'in maintenance'),
      v('Warehouse', 'in the warehouse'),
      v('Accounting', 'in accounting'),
      v('Marketing', 'in marketing'),
      v('Records', 'in records'),
      v('Purchasing', 'in purchasing'),
      v('Training', 'in training'),
      v('Mailroom', 'in the mailroom'),
    ],
  },
  {
    key: 'task',
    title: 'Task',
    scenario: 'took care of a different part of the party',
    verb: 'took care of',
    negVerb: 'did not take care of',
    who: (value) => `the person in charge of ${value.phrase}`,
    values: [
      the('Music'),
      the('Decorations'),
      the('Photos'),
      the('Guest book'),
      the('Flowers'),
      the('Welcome sign'),
      the('Invitations'),
      the('Balloons'),
      the('Name tags'),
      the('Slideshow'),
      the('Games'),
      the('Seating'),
    ],
  },
  {
    key: 'hobby',
    title: 'Hobby',
    scenario: 'is taking up a different hobby',
    verb: 'is taking up',
    negVerb: 'is not taking up',
    who: (value) => `the person taking up ${value.phrase}`,
    values: [
      v('Pottery'),
      v('Birdwatching'),
      v('Chess'),
      v('Watercolor', 'watercolor painting'),
      v('Singing'),
      v('Woodworking'),
      v('Photography'),
      v('Knitting'),
      v('Quilting'),
      v('Calligraphy'),
      v('Ukulele', 'the ukulele'),
      v('Bridge'),
      v('Tai chi'),
      v('Sketching'),
    ],
  },
  {
    key: 'weekday',
    title: 'Class day',
    scenario: 'has a class on a different weekday',
    verb: 'has class on',
    negVerb: 'does not have class on',
    who: (value) => `the person with class on ${value.phrase}`,
    ordinal: {
      less: 'has class earlier in the week than',
      more: 'has class later in the week than',
      stepLess: (n) => (n === 1 ? 'has class the day before' : `has class ${numberWord(n)} days before`),
      stepMore: (n) => (n === 1 ? 'has class the day after' : `has class ${numberWord(n)} days after`),
    },
    values: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'].map((d) => v(d, d)),
  },
  {
    key: 'arrival',
    title: 'Arrived',
    scenario: 'arrived at a different time',
    verb: 'arrived at',
    negVerb: 'did not arrive at',
    ordinal: {
      less: 'arrived earlier than',
      more: 'arrived later than',
      stepLess: (n) => `arrived ${n * 15} minutes before`,
      stepMore: (n) => `arrived ${n * 15} minutes after`,
    },
    values: ['5:00', '5:15', '5:30', '5:45', '6:00', '6:15', '6:30'].map((t) => v(`${t} p.m.`, t)),
  },
  {
    key: 'toast',
    title: 'Toast',
    scenario: 'gave a toast, one after another',
    verb: 'gave',
    negVerb: 'did not give',
    who: (value) => `the person who gave ${value.phrase}`,
    ordinal: {
      less: 'gave a toast before',
      more: 'gave a toast after',
      stepLess: (n) => (n === 1 ? 'spoke right before' : `spoke ${numberWord(n)} turns before`),
      stepMore: (n) => (n === 1 ? 'spoke right after' : `spoke ${numberWord(n)} turns after`),
      fromStart: true,
    },
    values: ['First', 'Second', 'Third', 'Fourth', 'Fifth'].map((o) =>
      v(o, `the ${o.toLowerCase()} toast`),
    ),
  },
  {
    key: 'growing',
    title: 'Growing',
    scenario: 'is growing something different',
    verb: 'is growing',
    negVerb: 'is not growing',
    who: (value) => `the person growing ${value.phrase}`,
    values: [
      v('Tomatoes'),
      v('Roses'),
      v('Sunflowers'),
      v('Herbs'),
      v('Tulips'),
      v('Strawberries'),
      v('Peppers'),
      v('Lavender'),
      v('Pumpkins'),
      v('Daisies'),
      v('Lettuce'),
      v('Marigolds'),
    ],
  },
  {
    key: 'volunteer',
    title: 'Volunteer',
    scenario: 'will volunteer somewhere different',
    verb: 'will volunteer at',
    negVerb: 'will not volunteer at',
    who: (value) => `the person volunteering at ${value.phrase}`,
    values: [
      the('Library'),
      the('Food bank'),
      the('Pet shelter'),
      the('Museum'),
      the('School'),
      the('Zoo'),
      the('Theater'),
      the('Park'),
      the('Garden club'),
      the('Art center'),
    ],
  },
  {
    key: 'dessert',
    title: 'Dessert',
    scenario: 'ordered a different dessert',
    verb: 'ordered',
    negVerb: 'did not order',
    values: [
      the('Cheesecake'),
      the('Tiramisu'),
      the('Apple crisp'),
      the('Carrot cake'),
      the('Rice pudding'),
      the('Cobbler'),
      the('Lemon tart'),
      the('Sorbet'),
      the('Fudge cake'),
      the('Pecan pie'),
      the('Fruit tart'),
    ],
  },
  {
    key: 'outing',
    title: 'Day trip',
    scenario: 'is planning a different day trip',
    verb: 'is visiting',
    negVerb: 'is not visiting',
    who: (value) => `the person visiting ${value.phrase}`,
    values: [
      the('Lighthouse'),
      the('Art museum'),
      the('Harbor'),
      the('Town square'),
      the('Aquarium'),
      the('Craft fair'),
      the('Flower show'),
      the('Planetarium'),
      the('Waterfall'),
      the('Orchard'),
      the('Rose garden'),
      the('Lake'),
    ],
  },
  {
    key: 'reading',
    title: 'Reading',
    scenario: 'is reading a different kind of book',
    verb: 'is reading',
    negVerb: 'is not reading',
    who: (value) => `the person reading ${value.phrase}`,
    values: [
      v('Mystery', 'a mystery'),
      v('Biography', 'a biography'),
      v('Poetry', 'a poetry book'),
      v('Western', 'a western'),
      v('Romance', 'a romance'),
      v('Travel', 'a travel book'),
      v('History', 'a history book'),
      v('Classics', 'a classic novel'),
      v('Sci-fi', 'a science fiction novel'),
      v('Nature', 'a nature book'),
    ],
  },
  {
    key: 'tea',
    title: 'Tea',
    scenario: 'chose a different tea',
    verb: 'chose',
    negVerb: 'did not choose',
    values: [
      v('Chamomile', 'the chamomile'),
      v('Green tea', 'the green tea'),
      v('Peppermint', 'the peppermint'),
      v('Jasmine', 'the jasmine'),
      v('Oolong', 'the oolong'),
      v('Chai', 'the chai'),
      v('Lemon ginger', 'the lemon ginger'),
      v('Black tea', 'the black tea'),
      v('Hibiscus', 'the hibiscus'),
      v('Rooibos', 'the rooibos'),
    ],
  },
]

const CATEGORY_INDEX = new Map(LG_CATEGORIES.map((c) => [c.key, c]))

export function lgCategory(key: string): LgCategory {
  const found = CATEGORY_INDEX.get(key)
  if (!found) throw new Error(`Unknown logic-grid category: ${key}`)
  return found
}

export function whoPhrase(category: LgCategory, value: LgValue): string {
  return category.who ? category.who(value) : `the person who ${category.verb} ${value.phrase}`
}

export interface LgTheme {
  key: string
  /** Bold line above the scenario. */
  name: string
  /** Scene-setting sentences; `{n}` becomes the number of people ("Four"). */
  intros: readonly string[]
  /** Categories that belong in this scene. */
  categories: readonly string[]
}

export const LG_THEMES: readonly LgTheme[] = [
  {
    key: 'potluck',
    name: 'The Farewell Potluck',
    intros: [
      '{n} coworkers were honored at a farewell potluck on their last day.',
      'The whole team gathered for a potluck to say goodbye to {n} retiring coworkers.',
    ],
    categories: ['dish', 'department', 'years', 'gift', 'month', 'task'],
  },
  {
    key: 'garden',
    name: 'The Garden Party',
    intros: [
      '{n} friends who retired this year celebrated together at a garden party.',
      'A sunny garden party marked the retirement of {n} good friends.',
    ],
    categories: ['dish', 'hobby', 'growing', 'month', 'gift', 'arrival'],
  },
  {
    key: 'community',
    name: 'The Community Send-Off',
    intros: [
      'The community center threw a send-off for {n} neighbors who all retired this year.',
      '{n} new retirees were the guests of honor at the community center.',
    ],
    categories: ['task', 'volunteer', 'arrival', 'hobby', 'job', 'dish'],
  },
  {
    key: 'dinner',
    name: 'The Retirement Dinner',
    intros: [
      '{n} colleagues were honored at a retirement dinner.',
      'A long table was set for a dinner in honor of {n} retiring colleagues.',
    ],
    categories: ['dessert', 'toast', 'gift', 'department', 'years', 'outing'],
  },
  {
    key: 'classes',
    name: 'The Class Sign-Up',
    intros: [
      'At a retirement luncheon, {n} new retirees each signed up for a class.',
      '{n} friends marked their retirement by signing up for classes together.',
    ],
    categories: ['hobby', 'weekday', 'job', 'dish', 'volunteer'],
  },
  {
    key: 'library',
    name: 'The Library Farewell Tea',
    intros: [
      'The town library held a farewell tea for {n} retiring staff members.',
      '{n} longtime library staff were celebrated at a farewell tea.',
    ],
    categories: ['tea', 'reading', 'years', 'gift', 'month', 'volunteer'],
  },
  {
    key: 'lunch',
    name: 'The Last-Day Lunch',
    intros: [
      '{n} coworkers shared one last lunch together before retiring.',
      'On their final day at work, {n} coworkers went out for a farewell lunch.',
    ],
    categories: ['department', 'outing', 'month', 'years', 'hobby', 'dessert'],
  },
  {
    key: 'block',
    name: 'The Neighborhood Party',
    intros: [
      'The neighbors threw a block party for {n} friends who all retired this year.',
      '{n} neighbors celebrated their retirements at a street party.',
    ],
    categories: ['dish', 'growing', 'outing', 'hobby', 'arrival', 'job'],
  },
  {
    key: 'reunion',
    name: 'The Farewell Reunion',
    intros: [
      '{n} former colleagues met again at a reunion to celebrate their retirements.',
      'A reunion brought {n} recently retired colleagues back together.',
    ],
    categories: ['job', 'years', 'reading', 'outing', 'toast', 'tea'],
  },
]

/**
 * First names: short (they head grid rows), easy to read aloud, broadly
 * familiar, and no two alike at a glance. A puzzle never draws two that share
 * a first letter.
 */
export const LG_NAMES: readonly string[] = [
  'Carol', 'James', 'Linda', 'Robert', 'Maria', 'David', 'Susan', 'Thomas',
  'Helen', 'George', 'Patricia', 'Frank', 'Rosa', 'Walter', 'Nancy', 'Samuel',
  'Irene', 'Arthur', 'Gloria', 'Henry', 'Joyce', 'Leonard', 'Martha', 'Victor',
  'Ruth', 'Raymond', 'Diane', 'Harold', 'Evelyn', 'Albert', 'Joan', 'Eugene',
  'Doris', 'Oscar', 'Alma', 'Felix', 'Louis', 'Vera', 'Peter', 'Anita',
  'Ralph', 'Nora', 'Carl', 'Elena', 'Dennis', 'Judy', 'Manuel', 'Lorraine',
  'Kenneth', 'Shirley', 'Ivan', 'Priya', 'Ahmed', 'Mei', 'Kofi', 'Ingrid',
  'Omar', 'Yvonne', 'Bernard', 'Wanda', 'Gordon', 'Hazel', 'Stanley', 'Edith',
  'Marcus', 'Teresa', 'Lionel', 'Beatrice', 'Hector', 'Colleen', 'Warren', 'Ada',
]

/** Heading over the people in the grid and the answer table. */
export const LG_PEOPLE_TITLE = 'Name'

export const lgInstruction = () =>
  'Match each person to one item in every category. In the grid, mark X for no and a dot for yes.'
