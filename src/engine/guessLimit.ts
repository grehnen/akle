/** Guesses allowed for a daily trip whose shortest route has `n` intermediate kommuner. */
export function guessLimit(n: number): number {
  if (n <= 3) return n + 4;
  if (n <= 6) return n + 5;
  if (n <= 9) return n + 6;
  if (n <= 12) return n + 7;
  return n + 8;
}
