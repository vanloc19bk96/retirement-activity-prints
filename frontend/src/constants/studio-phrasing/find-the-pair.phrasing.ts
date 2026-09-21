import type { PhrasingPool } from '@/utils/studio/_shared/uniqueness/phrasing'

/**
 * Find the Pair instruction variants (§4.7). Hand-written, never generated.
 *
 * Two pools, because the puzzle genuinely changes: with one pair the reader is
 * hunting a single repeat, and with several the page becomes a sweep. An
 * instruction that says "two of these" over a page holding three pairs is the
 * kind of small wrongness that earns a one-star review.
 */
export const FIND_THE_PAIR_INSTRUCTIONS: PhrasingPool = {
  single: [
    'Two of these pictures are exactly the same. Find them and circle both.',
    'Everything here appears once — except one picture, which appears twice. Circle the two.',
    'Somewhere below, one picture is repeated. Circle both copies of it.',
    'Look carefully: one design has a twin. Ring the matching pair.',
    'All but two of these are different. Circle the two that match each other.',
    'One picture on this page has been printed twice. Find it and circle both.',
    'Hunt for the repeat. Two of these are identical — circle them.',
    'Compare the pictures until you find two that are exactly alike, then circle them.',
    'Only one pair on this page matches. Draw a ring around both of its pictures.',
    'Every picture is unique but one. Circle the two that are the same.',
  ],
  multiple: [
    'Some of these pictures are printed twice. Find every matching pair and circle them.',
    'Several designs below have a twin. Circle both halves of every pair you find.',
    'More than one picture is repeated here. Ring each matching pair.',
    'Hunt for the repeats: every picture that appears twice should be circled.',
    'A few of these pictures have an exact match on the page. Circle all of them.',
    'Work across the page and ring every picture that turns up twice.',
    'Some pictures appear once and some appear twice. Circle the ones that appear twice.',
    'Find each matching pair below and draw a ring around both of its pictures.',
    'Several pairs are hiding on this page. Circle every one you can find.',
    'Compare the pictures and circle each design that has been printed twice.',
  ],
}
