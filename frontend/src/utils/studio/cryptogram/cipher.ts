import type { StudioRng } from '../studio-rng'

export const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

/** Slot width in em units for letter codes. */
export const SLOT_WIDTH_EM = 1.15

/**
 * Substitution alphabet where no letter stands for itself. A single forward pass
 * is enough: swapping a fixed point with its neighbour cannot create a new one,
 * because a permutation never repeats a symbol.
 */
function derangedAlphabet(rng: StudioRng): string[] {
  const plain = ALPHABET.split('')
  const cipher = rng.shuffle(plain)
  for (let i = 0; i < cipher.length; i++) {
    if (cipher[i] !== plain[i]) continue
    const partner = (i + 1) % cipher.length
    ;[cipher[i], cipher[partner]] = [cipher[partner]!, cipher[i]!]
  }
  return cipher
}

export function buildCipher(rng: StudioRng): Map<string, string> {
  const plain = ALPHABET.split('')
  const cipher = derangedAlphabet(rng)
  return new Map(plain.map((letter, i) => [letter, cipher[i]!]))
}

export function encodeLetter(letter: string, cipher: ReadonlyMap<string, string>): string {
  return cipher.get(letter) ?? letter
}
