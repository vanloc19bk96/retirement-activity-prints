import type { StudioRng } from '../studio-rng'

export const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

/**
 * Substitution alphabet where no letter stands for itself. A single forward
 * pass is enough: swapping a fixed point with its neighbour cannot create a new
 * one, because a permutation never repeats a symbol.
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

export function encodeLetter(
  letter: string,
  cipher: ReadonlyMap<string, string>,
): string {
  return cipher.get(letter) ?? letter
}

/**
 * The promise the instruction on the page makes, checked before it prints:
 * 26 letters in, 26 distinct letters out, none of them itself.
 *
 * A cipher that breaks any of these is not a harder puzzle, it is an unsolvable
 * one — two plain letters sharing a code leave the solver with a saying that
 * cannot be read back.
 */
export function cipherIsValid(cipher: ReadonlyMap<string, string>): boolean {
  if (cipher.size !== 26) return false
  if (new Set(cipher.values()).size !== 26) return false
  for (const letter of ALPHABET) {
    const mapped = cipher.get(letter)
    if (!mapped || mapped === letter) return false
  }
  return true
}

/** Read a coded saying back through its own cipher — must equal the plain text. */
export function decodeSaying(
  coded: string,
  cipher: ReadonlyMap<string, string>,
): string {
  const inverse = new Map<string, string>()
  for (const [plain, code] of cipher) inverse.set(code, plain)
  return [...coded].map((ch) => inverse.get(ch) ?? ch).join('')
}
