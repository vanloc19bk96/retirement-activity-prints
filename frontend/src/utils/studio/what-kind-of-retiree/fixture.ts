import type {
  RetireeQuizQuestionItem,
  RetireeQuizResponse,
  RetireeQuizResultsItem,
} from '@/types/studio-retiree-quiz.types'

/**
 * A reply shaped like one the content service returns.
 *
 * Every question here already passes the gates in `content.ts`, carries the
 * service's `verified` mark, and together they pass the quiz-wide variety
 * rules. A fixture that needed thinning before use would test the gates
 * instead of the page. Twelve questions, so a ten-question quiz has spares.
 */
export const RQ_FIXTURE_QUESTIONS: readonly RetireeQuizQuestionItem[] = [
  {
    question: "It's a free Tuesday with nothing planned. What sounds best?",
    explorer: 'A bus ride to a brand-new town',
    tinkerer: 'Building a birdhouse from scratch',
    social: 'A long lunch with friends',
    napper: 'A slow breakfast and a comfy chair',
    topic: 'a free weekday',
    verified: true,
  },
  {
    question: 'Which gift would make you grin from ear to ear?',
    explorer: 'A ticket to somewhere unknown',
    tinkerer: 'A shiny new set of tools',
    social: 'A party with all your people',
    napper: 'The softest blanket ever made',
    topic: 'gifts',
    verified: true,
  },
  {
    question: 'A new recipe book lands in your lap. What happens next?',
    explorer: 'Cook a dish from far away',
    tinkerer: 'Tweak each recipe to perfection',
    social: 'Host a tasting night for neighbors',
    napper: 'Read it in bed with tea',
    topic: 'the kitchen',
    verified: true,
  },
  {
    question: 'Which flyer on the library noticeboard catches your eye?',
    explorer: 'Guided walks through hidden corners',
    tinkerer: "A beginner's woodworking workshop",
    social: 'A weekly coffee morning',
    napper: 'Gentle stretching, then a long rest',
    topic: 'clubs and classes',
    verified: true,
  },
  {
    question: "A gray, drizzly afternoon stretches ahead. What's your plan?",
    explorer: "Visit a museum I've never seen",
    tinkerer: 'Fix that squeaky cupboard door',
    social: 'A long catch-up call with a friend',
    napper: 'A quilt, a sofa and the radio',
    topic: 'a drizzly afternoon',
    verified: true,
  },
  {
    question: "You're packing for a short trip. What goes in the bag first?",
    explorer: 'A map with mystery stops circled',
    tinkerer: 'A sketchbook and a pocket tool kit',
    social: 'Snacks to share on the bus',
    napper: 'A neck pillow and cozy socks',
    topic: 'short trips',
    verified: true,
  },
  {
    question: 'The local park is bathed in sunshine. Where will we find you?',
    explorer: "On a path I've never walked",
    tinkerer: 'Sketching flowers to paint later',
    social: 'Joining the lawn bowls group',
    napper: 'Dozing on a bench in the shade',
    topic: 'parks and fresh air',
    verified: true,
  },
  {
    question: 'You just finished a huge jigsaw puzzle. How do you celebrate?',
    explorer: 'Plan an outing somewhere unfamiliar',
    tinkerer: 'Glue it, frame it and hang it',
    social: 'Invite everyone over to admire it',
    napper: 'Feet up with a well-earned treat',
    topic: 'celebrating a small win',
    verified: true,
  },
  {
    question: 'Which motto would you stitch onto a cushion?',
    explorer: 'Every road leads somewhere good',
    tinkerer: "If it's broken, I can mend it",
    social: 'The more the merrier',
    napper: 'Why rush when you can relax',
    topic: 'a motto for the week',
    verified: true,
  },
  {
    question: 'An envelope arrives with an invitation. Which one do you hope it is?',
    explorer: 'A mystery coach tour to the coast',
    tinkerer: 'A hands-on stained glass class',
    social: 'A neighborhood block party',
    napper: 'A spa afternoon with a long soak',
    topic: 'an unexpected invitation',
    verified: true,
  },
  {
    question: 'The evening is all yours. How do you like to spend it?',
    explorer: 'Stargazing far from city lights',
    tinkerer: 'Building a model ship',
    social: 'Game night with a lively crowd',
    napper: 'Early pajamas and an old film',
    topic: 'a quiet evening',
    verified: true,
  },
  {
    question: 'You wander into a busy weekend market. What catches your attention?',
    explorer: "Foods you can't even pronounce",
    tinkerer: 'A box of old clocks to mend',
    social: 'The folk band everyone dances to',
    napper: 'A shady seat and a cinnamon bun',
    topic: 'markets and fairs',
    verified: true,
  },
]

export const RQ_FIXTURE_RESULTS: RetireeQuizResultsItem = {
  explorer:
    'Curiosity is your compass. A new town, a new taste or a new trail is all it takes to brighten your day.',
  tinkerer:
    'Your head is always full of plans. Building, fixing or learning, you love the glow of a job well done.',
  social:
    'You bring people together wherever you go. A shared meal or a good chat is your idea of a perfect day.',
  napper:
    'You have mastered the art of the unhurried day. A comfy chair and nowhere to be is well-earned bliss.',
}

export const RQ_FIXTURE: RetireeQuizResponse = {
  questions: RQ_FIXTURE_QUESTIONS.map((item) => ({ ...item })),
  results: { ...RQ_FIXTURE_RESULTS },
}
