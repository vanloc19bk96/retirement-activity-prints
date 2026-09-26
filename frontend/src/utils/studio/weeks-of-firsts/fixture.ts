import type { WeeksOfFirstsResponse } from '@/types/studio-weeks-of-firsts.types'

/**
 * Four ideas per area, every one already passing the gates in `content.ts`,
 * no two alike in meaning across the whole set, and none a bigger outing.
 * Mirrors FIXTURE in `backend/tests/test_studio_weeks_of_firsts_service.py`.
 * A fixture that needed thinning before use would test the gates instead of
 * the page.
 */
export const WF_FIXTURE_IDEAS: Readonly<Record<string, readonly string[]>> = {
  kitchen: [
    'Cook a Thai green curry from scratch',
    'Bake a loaf of soda bread for the first time',
    'Roll out fresh pasta by hand',
    'Stir smoked paprika into a dish you often make',
  ],
  tastes: [
    'Taste a fresh lychee from a greengrocer',
    'Order an Ethiopian dish at a restaurant new to you',
    'Sample three cheeses at a local deli counter',
    'Try a custard tart from a Portuguese bakery',
  ],
  nearby: [
    'Ride a bus route to the very end of the line',
    'Walk down a street in town you’ve never explored',
    'Find out how your street got its name',
    'Find the best viewpoint in your town',
  ],
  nature: [
    'Learn to recognise one bird by its song',
    'Name five kinds of cloud in the sky above you',
    'Follow a canal towpath you’ve never walked',
    'Press wildflowers to keep in a frame',
  ],
  grow: [
    'Grow basil from seed on a windowsill',
    'Sprout mung beans in a glass jar',
    'Root a houseplant cutting in a jar of water',
    'Plant a pot of bulbs for the bees',
  ],
  make: [
    'Shape a small pinch pot from air-dry clay',
    'Knit a simple square from a beginner pattern',
    'Fold a paper crane from a sheet of origami paper',
    'Make a bird feeder from a pine cone',
  ],
  picture: [
    'Paint a small watercolour of the view from a window',
    'Take a photo walk looking only for circles',
    'Draw a self-portrait using a mirror',
    'Write your name in calligraphy with a broad pen',
  ],
  words: [
    'Write a short poem about your favourite view',
    'Read a mystery novel by a writer from another country',
    'Write a letter to your younger self',
    'Listen to an audiobook of a classic you skipped at school',
  ],
  music: [
    'Hear a live brass band play in the park',
    'Pick out a simple tune on a ukulele',
    'Sing with a community choir for one evening',
    'Listen to an album from start to finish without pausing',
  ],
  learn: [
    'Learn ten words of Japanese',
    'Watch a documentary about how glass is made',
    'Learn a simple card trick to show a friend',
    'Tie three useful knots from a how-to video',
  ],
  people: [
    'Invite a neighbour you barely know round for tea',
    'Join a conversation cafe in your area',
    'Call an old friend you haven’t spoken to in years',
    'Ask a friend to teach you their favourite skill',
  ],
  give: [
    'Volunteer for one shift at a food bank',
    'Join a community litter pick for an hour',
    'Leave a few books in a little free library',
    'Write a thank-you note to someone who helped you',
  ],
  culture: [
    'Watch a play at a theatre you’ve never been to',
    'See a film in a language you don’t speak',
    'Visit a museum you’ve always walked past',
    'Wander a sculpture trail in a park',
  ],
  calm: [
    'Follow a guided relaxation recording for ten minutes',
    'Spend a morning with no plans at all',
    'Brew a pot of loose-leaf tea to sip slowly',
    'Sit through a whole sunset without a screen nearby',
  ],
  play: [
    'Play a board game you’ve never played before',
    'Complete a jigsaw of a place you’d love to visit',
    'Learn to play mahjong with a friend',
    'Solve your first cryptic crossword clue',
  ],
  move: [
    'Try a beginner tai chi class',
    'Take a line dancing class at a community hall',
    'Play a game of table tennis',
    'Roll a few ends at a lawn bowls club',
  ],
  adventure: [
    'Take a train to a town you’ve never visited',
    'Ride a ferry across to the other side of the water',
    'Tour a working farm to meet the animals',
    'Watch a show at a planetarium',
  ],
  home: [
    'Rearrange one room to see it in a new way',
    'Make a small photo book of favourite pictures',
    'Scan a box of old photographs to keep safe',
    'Start a collection of postcards from your town',
  ],
}

/** Weeks per area in a balanced year: sixteen areas at three, two at two. */
const TARGETS: Readonly<Record<string, number>> = {
  kitchen: 3, tastes: 3, nearby: 3, nature: 3, grow: 3, make: 3, picture: 3, words: 2, music: 3,
  learn: 3, people: 3, give: 3, culture: 3, calm: 2, play: 3, move: 3, adventure: 3, home: 3,
}

/** A reply shaped like one the service returns for a balanced year, spares included. */
export const WF_FIXTURE: WeeksOfFirstsResponse = {
  areas: Object.entries(WF_FIXTURE_IDEAS).map(([key, ideas]) => ({
    key,
    target: TARGETS[key]!,
    items: ideas.map((idea) => ({ idea, concept: '' })),
  })),
}

export const WF_FIXTURE_ALL: readonly string[] = Object.values(WF_FIXTURE_IDEAS).flat()
