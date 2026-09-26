import type { BucketListResponse, BucketListSection } from '@/types/studio-bucket-list.types'

/**
 * A reply shaped like one the content service returns for a 100-idea list:
 * twelve headings, each with its share of the hundred and two or so spares.
 *
 * Every idea here already passes the gates in `content.ts` and no two read as
 * the same thing, across the whole list. A fixture that needed thinning
 * before use would test the gates instead of the page.
 */
const SECTIONS: readonly (readonly [string, string, readonly string[]])[] = [
  [
    'travel',
    'Travel',
    [
      'Take a scenic train journey through the mountains',
      'Explore a region of your own country',
      'Plan a trip around a local food speciality',
      'Stay a night in a lighthouse',
      'Return to a town where you once lived',
      'Spend a week somewhere with no fixed plans',
      'See a famous waterfall up close',
      'Wander the old quarter of a historic city',
      'Hop between islands on a slow ferry',
      'Visit another country you have always wondered about',
    ],
  ],
  [
    'explore-nearby',
    'Explore Close to Home',
    [
      'Be a tourist in your own town for a day',
      'Ride a bus to the end of the line',
      'Tour a historic house near you',
      'Browse a farm shop you have never tried',
      'Read every plaque on your high street',
      'Find the oldest building in your town',
      'Picnic in a park you have never visited',
      'Go to a free open day at a local college',
      'Try the bakery on the other side of town',
      'Walk a street you usually pass by',
    ],
  ],
  [
    'learn',
    'Learn Something New',
    [
      'Learn a hundred words of a new language',
      "Take a beginners' class in watercolour",
      'Learn the names of five constellations',
      'Master a proper game of chess',
      'Find out how your town got its name',
      'Learn to play three chords on a ukulele',
      'Discover how cheese is made on a dairy tour',
      'Learn to edit photos on a tablet',
      'Study a period of history you missed at school',
      'Learn calligraphy with a dip pen',
    ],
  ],
  [
    'create',
    'Create',
    [
      'Sketch the view from your window',
      'Write a short poem about your favourite season',
      "Shape a bowl on a potter's wheel",
      'Make a handmade birthday card',
      'Fill a sketchbook in a month',
      'Carve a small wooden spoon',
      'Build a collage from old magazines',
      'Design your own greeting cards',
      'Turn old jars into lanterns',
      'Stitch a small embroidered picture',
    ],
  ],
  [
    'give-back',
    'Give Back',
    [
      'Volunteer an hour a week for a cause you love',
      'Teach a beginner something you know well',
      'Bake a cake for a neighbour',
      'Join a litter pick in your neighbourhood',
      'Knit a hat for a charity drive',
      'Help at a community fundraiser',
      'Mentor someone starting their career',
      'Read stories aloud at a library session',
      'Walk dogs for an animal shelter',
      'Send a thank-you note to an old teacher',
    ],
  ],
  [
    'relax',
    'Slow Down & Relax',
    [
      'Enjoy a slow breakfast with the paper',
      'Keep one day a month completely free',
      'Find a favourite bench and claim it',
      'Watch the clouds drift by for an hour',
      'Run a bubble bath with candles lit',
      'Reread a book you loved when you were young',
      'Listen to a whole album with your eyes closed',
      'Finish a thousand-piece jigsaw puzzle',
      'Spend a rainy afternoon under a blanket',
      'Try a gentle tai chi session in the park',
    ],
  ],
  [
    'connect',
    'Connect',
    [
      'Look up an old school friend',
      'Start a monthly lunch club',
      'Host a simple soup supper',
      'Join a book club',
      'Send a postcard to a faraway friend',
      'Invite a neighbour round for tea',
      'Swap life stories with someone half your age',
      'Set up a video call with scattered friends',
      'Find a pen pal abroad',
      'Organise a coffee morning',
    ],
  ],
  [
    'try-new',
    'Try Something New',
    [
      'Taste a fruit you have never seen before',
      'Play a round of lawn bowls',
      'Try a salsa class',
      'Sing at an open mic night',
      'Try a circus skills workshop',
      'Wear a colour you never usually choose',
      'Ride a tandem bicycle',
      'See a live opera',
      'Say yes to the next invitation you receive',
      'Try a new breakfast every day for a week',
    ],
  ],
  [
    'nature',
    'Into Nature',
    [
      'Photograph wildflowers in spring',
      'Walk at dawn and hear the birds wake',
      'Spend a morning at a botanical garden',
      'Paddle at the edge of a lake',
      'Learn to name ten local trees',
      'Watch a meteor shower',
      'Take a woodland walk in autumn',
      'Hang a bird feeder where you can see it',
      'Spot a heron by a river',
      'Collect fallen leaves for a pressed display',
    ],
  ],
  [
    'food',
    'Food & Flavours',
    [
      'Cook a dish from a country you have never visited',
      'Bake a loaf of sourdough bread',
      'Perfect a family recipe',
      'Take a pasta making class',
      'Wander a food festival',
      'Grow fresh herbs for your own kitchen',
      'Pack a picnic feast for a sunny day',
      'Make a jar of homemade jam',
      'Try a regional speciality on its home ground',
      'Master a showstopping dessert',
    ],
  ],
  [
    'memories',
    'Memories & Keepsakes',
    [
      'Write a letter to open in ten years',
      'Record a favourite story in your own voice',
      'Fill a jar with happy moments',
      'Label your old photographs',
      'Revisit your childhood street',
      'Make a playlist of songs from every decade',
      'Put together a keepsake box',
      'Keep a one-line diary for a year',
      'Write down a family story',
      'Draw a map of every home you have lived in',
    ],
  ],
  [
    'small-adventures',
    'Small Adventures',
    [
      'Watch the sunrise from a hilltop',
      'Take an evening walk with a torch',
      'Take a day trip by train on a whim',
      'Paddle a canoe on a calm river',
      'Spend a night under canvas',
      'Walk a trail you have never tried',
      'Ride a ferry just for the view',
      'Stroll to a place you usually ride to',
      'Eat a picnic in a surprising spot',
      'Follow a river for as far as you can',
    ],
  ],
]

/** Shares for a 100-idea list over twelve headings: 9, 9, 9, 9, then 8s. */
const TARGETS = [9, 9, 9, 9, 8, 8, 8, 8, 8, 8, 8, 8] as const

export const BL_FIXTURE_SECTIONS: readonly BucketListSection[] = SECTIONS.map(([key, title, ideas], i) => ({
  key,
  title,
  target: TARGETS[i]!,
  items: ideas.map((idea) => ({ idea, concept: idea.toLowerCase() })),
}))

export const BL_FIXTURE_IDEAS: readonly string[] = SECTIONS.flatMap(([, , ideas]) => ideas)

export const BL_FIXTURE: BucketListResponse = {
  sections: BL_FIXTURE_SECTIONS.map((section) => ({
    ...section,
    items: section.items.map((item) => ({ ...item })),
  })),
}
