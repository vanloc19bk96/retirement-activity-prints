import type { PhrasingPool } from '@/utils/studio/_shared/uniqueness/phrasing'

/**
 * Word Fit-In instruction variants (§4.7). Hand-written, never generated.
 *
 * Separate pools per mode because the nouns change: a page of numbers must not
 * say "word", and a page that prints no starter must not promise one. Getting
 * that wrong is the kind of small inaccuracy a reader notices immediately and a
 * reviewer quotes.
 */
export const WORD_FIT_INSTRUCTIONS: PhrasingPool = {
  words: [
    'Fit every word into the grid. Each word is used once.',
    'Every word below belongs somewhere in the grid. Work out where, using the letters that cross.',
    'Slot each word into the grid so all of them fit. Nothing is left over.',
    'Use the word lengths and the crossing letters to place every word in the grid.',
    'Each word fits one place and one place only. Fill the grid.',
    'Write the words into the grid. Count the squares to see which words can go where.',
    'Every word on the list has a home in the grid. Find it.',
    'Fill the grid using all the words below, one word to a run of squares.',
    'Match each word to a run of the right length, then check the letters where words cross.',
    'Place all the words in the grid. The letters they share will tell you when you are right.',
  ],
  wordsWithStarter: [
    'Fit every word into the grid. One has been filled in to start you off.',
    'Every word below belongs in the grid. One is already placed — work out the rest from the crossings.',
    'One word is done for you. Fit all the others into the grid.',
    'Use the lengths and the crossing letters to place every word. The first is already in.',
    'A starting word is written in. Fill the grid with the rest of the list.',
    'Each word is used once. One has been entered to get you going.',
    'Slot the remaining words into the grid, using the one already written as your foothold.',
    'The grid holds every word below. One is filled in; find the places for the others.',
    'Begin from the word already in the grid, then fit the rest of the list around it.',
    'All the words fit. One is on the page already — count squares and letters for the rest.',
  ],
  numbers: [
    'Fit every number into the grid. Each number is used once.',
    'Every number below belongs somewhere in the grid. Work out where, using the digits that cross.',
    'Slot each number into the grid so all of them fit. Nothing is left over.',
    'Use the lengths and the crossing digits to place every number in the grid.',
    'Each number fits one place and one place only. Fill the grid.',
    'Write the numbers into the grid. Count the squares to see which numbers can go where.',
    'Every number on the list has a home in the grid. Find it.',
    'Fill the grid using all the numbers below, one to a run of squares.',
    'Match each number to a run of the right length, then check the digits where they cross.',
    'Place all the numbers in the grid. The digits they share will tell you when you are right.',
  ],
  numbersWithStarter: [
    'Fit every number into the grid. One has been filled in to start you off.',
    'Every number below belongs in the grid. One is already placed — work out the rest from the crossings.',
    'One number is done for you. Fit all the others into the grid.',
    'Use the lengths and the crossing digits to place every number. The first is already in.',
    'A starting number is written in. Fill the grid with the rest of the list.',
    'Each number is used once. One has been entered to get you going.',
    'Slot the remaining numbers into the grid, using the one already written as your foothold.',
    'The grid holds every number below. One is filled in; find the places for the others.',
    'Begin from the number already in the grid, then fit the rest of the list around it.',
    'All the numbers fit. One is on the page already — count squares and digits for the rest.',
  ],
}
