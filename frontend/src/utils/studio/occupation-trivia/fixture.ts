import type { OccupationTriviaQuestion } from '@/types/studio-occupation-trivia.types'

/**
 * A reply shaped like one the content service returns for a Teacher pack.
 *
 * Every question here already passes the gates in `content.ts`, carries the
 * service's `verified` mark, and tests a different fact from every other —
 * twelve questions, more than a full pack. A fixture that needed thinning
 * before use would test the gates instead of the pages. The backend test uses
 * the same twelve.
 */
export const OT_FIXTURE_QUESTIONS: readonly OccupationTriviaQuestion[] = [
  {
    topic: 'blackboard chalk',
    question: 'What did teachers write on the blackboard with?',
    answer: 'Chalk',
    distractors: ['Charcoal', 'Crayon', 'Graphite'],
    explanation: 'Sticks of chalk left bright white marks on the dark board.',
    verified: true,
  },
  {
    topic: 'spirit duplicator ink',
    question: 'Worksheets printed on a spirit duplicator came out in what colour ink?',
    answer: 'Purple',
    distractors: ['Green', 'Brown', 'Orange'],
    explanation: 'Spirit duplicators, or ditto machines, printed in a purple ink.',
    verified: true,
  },
  {
    topic: 'counting frame',
    question: 'What counting frame with sliding beads was used to teach arithmetic?',
    answer: 'The abacus',
    distractors: ['The slide rule', 'The tally stick', 'The protractor'],
    explanation: 'The abacus helped children see numbers as rows of beads.',
    verified: true,
  },
  {
    topic: 'school slates',
    question: 'Before paper was cheap, what did pupils write their lessons on?',
    answer: 'A slate',
    distractors: ['A clay tablet', 'A wax board', 'A birch bark sheet'],
    explanation: 'Children wrote on small framed slates with slate pencils.',
    verified: true,
  },
  {
    topic: 'overhead projector',
    question: "What machine shone a teacher's writing on clear sheets onto a screen?",
    answer: 'An overhead projector',
    distractors: ['A slide projector', 'A filmstrip viewer', 'A microfiche reader'],
    explanation: 'Overhead projectors shone transparencies onto a screen.',
    verified: true,
  },
  {
    topic: 'school hand bell',
    question: 'What did a teacher ring by hand to call pupils in from the yard?',
    answer: 'A hand bell',
    distractors: ['A whistle', 'A gong', 'A triangle'],
    explanation: 'Before electric bells, teachers rang a brass hand bell.',
    verified: true,
  },
  {
    topic: 'cursive penmanship',
    question: 'Penmanship lessons drilled which flowing style of joined-up writing?',
    answer: 'Cursive',
    distractors: ['Italic print', 'Block capitals', 'Shorthand'],
    explanation: 'Pupils practised cursive, joining each letter to the next.',
    verified: true,
  },
  {
    topic: 'school yearbook',
    question: 'What is the yearly book of class photos and school highlights called?',
    answer: 'A yearbook',
    distractors: ['A scrapbook', 'An almanac', 'A day book'],
    explanation: "A yearbook collects each class's photos from the school year.",
    verified: true,
  },
  {
    topic: 'desk inkwell',
    question: 'What were wooden school desks fitted with to hold ink for dip pens?',
    answer: 'An inkwell',
    distractors: ['A quill rack', 'A blotter tray', 'A pen drawer'],
    explanation: 'Inkwells set into the desk held ink for dip pens.',
    verified: true,
  },
  {
    topic: 'one-room schoolhouse',
    question: 'In a one-room schoolhouse, how many teachers taught every grade?',
    answer: 'One',
    distractors: ['Two', 'Three', 'Four'],
    explanation: 'A single teacher taught pupils of every age in one room.',
    verified: true,
  },
  {
    topic: 'lesson plan',
    question: "What is a teacher's written outline for a single class period called?",
    answer: 'A lesson plan',
    distractors: ['A syllabus', 'A timetable', 'A curriculum'],
    explanation: 'A lesson plan sets out the aims and activities for one class.',
    verified: true,
  },
  {
    topic: "teacher's edition",
    question: 'What was the desk copy of a textbook with the answers printed in it called?',
    answer: "The teacher's edition",
    distractors: ['The answer atlas', 'The master file', 'The key ledger'],
    explanation: "A teacher's edition held the answers and notes for each lesson.",
    verified: true,
  },
]

export const OT_FIXTURE = {
  occupation: 'teacher' as const,
  questions: OT_FIXTURE_QUESTIONS.map((q) => ({ ...q, distractors: [...q.distractors] })),
}
