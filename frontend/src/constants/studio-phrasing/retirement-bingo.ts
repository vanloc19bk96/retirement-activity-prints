/**
 * Retirement Bingo phrasing pools (§4.7).
 *
 * The instruction line is the sentence most likely to be byte-identical across
 * two sellers' books, and the first thing a reviewer reads. Every variant here
 * states the same rule — cross off what happens, five in a straight line wins —
 * so a reader never meets a page with different rules from the last one.
 *
 * Each variant is two lines, broken where the sense breaks, and every line is
 * short enough to hold on a 5 x 8 column without stranding "BINGO!" on a line
 * of its own. The free square is never explained: it says FREE on the card.
 */
export const RETIREMENT_BINGO_INSTRUCTIONS: readonly string[] = [
  'Cross off each moment as it happens.\nFive in a row, any direction, is BINGO!',
  'Mark a square each time it happens.\nGet five in a row to call BINGO!',
  'Lived it? Cross it off.\nFive in a line, any direction, wins!',
  "X out each moment once you've done it.\nAny full row, column or diagonal wins!",
  'Check off each square as it comes true.\nFive in a straight line is BINGO!',
  'Cross off a square whenever it happens.\nComplete any line of five for BINGO!',
  "Mark each moment you've enjoyed.\nFive in a straight line is BINGO!",
  'Every time one happens, cross it off.\nFinish a line of five to win BINGO!',
  'Tick off moments as retirement unfolds.\nAny five in a row is BINGO!',
  'Put an X on each moment you live.\nFive across, down or diagonal wins!',
  "Circle each moment once it's happened.\nFive in any straight line is BINGO!",
  "Cross off the moments you've had.\nComplete a row, column or diagonal!",
]

/**
 * The write-in line under the card. Picked once per account as part of the
 * house style, so one seller's books read consistently.
 */
export const RETIREMENT_BINGO_WRITE_INS: readonly string[] = [
  'I got BINGO on',
  'BINGO! Date:',
  'My first BINGO:',
  'Date of my BINGO:',
  'BINGO reached on',
  'Called BINGO on',
  'Five in a row on',
]
