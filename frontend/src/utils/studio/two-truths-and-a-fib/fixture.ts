import type { TwoTruthsFibItem } from '@/types/studio-two-truths-fib.types'

/**
 * A reply shaped like one the content service returns.
 *
 * Every set here already passes the gates in `content.ts` and carries the
 * service's `verified` mark, and the facts are real: two true statements, one
 * fib, and a correction that is true. A fixture that needed thinning before
 * use would test the gates instead of the page.
 */
export const TTF_FIXTURE_ITEMS: readonly TwoTruthsFibItem[] = [
  {
    title: 'Early Telephones',
    truths: [
      'Alexander Graham Bell was granted a patent for the telephone in 1876.',
      'Early telephone exchanges connected calls by hand using switchboards.',
    ],
    fib: 'The first telephone directory was printed in London in 1920.',
    fact: 'The first telephone directory was printed in New Haven, Connecticut, in 1878.',
    verified: true,
  },
  {
    title: 'Tea Time',
    truths: [
      'Afternoon tea became fashionable in England in the 1840s.',
      'Green tea and black tea are made from the leaves of the same plant.',
    ],
    fib: 'Tea was first brought to Europe by Spanish traders in the 1800s.',
    fact: 'Dutch traders brought tea to Europe in the early 1600s.',
    verified: true,
  },
  {
    title: 'Steam Railways',
    truths: [
      'The Stockton and Darlington Railway opened in England in 1825.',
      'Steam locomotives had to stop regularly to take on water for their boilers.',
    ],
    fib: 'The famous Rocket steam locomotive was built in 1869.',
    fact: 'The Rocket locomotive won the Rainhill Trials in 1829.',
    verified: true,
  },
  {
    title: 'The Zip Fastener',
    truths: [
      'Gideon Sundback patented an improved zip fastener in 1917.',
      'Before zips, many clothes fastened with buttons or hooks and eyes.',
    ],
    fib: 'The first zip fasteners were made of plastic in the 1890s.',
    fact: 'Early zip fasteners from the 1890s were made of metal.',
    verified: true,
  },
  {
    title: 'Postage Stamps',
    truths: [
      'The Penny Black postage stamp was issued in Britain in 1840.',
      'Stamp collecting is also known as philately.',
    ],
    fib: 'The first postage stamps were sold with holes punched between them for tearing.',
    fact: 'Stamp sheets were first perforated in 1854; before that they were cut with scissors.',
    verified: true,
  },
  {
    title: 'Remarkable Birds',
    truths: [
      'Hummingbirds can hover in place by beating their wings very rapidly.',
      'Owls can turn their heads much further round than people can.',
    ],
    fib: 'Flamingos are born with bright pink feathers.',
    fact: 'Flamingo chicks hatch with grey feathers and turn pink from their diet.',
    verified: true,
  },
]

export const TTF_FIXTURE = {
  items: TTF_FIXTURE_ITEMS.map((item) => ({ ...item, truths: [...item.truths] })),
}
