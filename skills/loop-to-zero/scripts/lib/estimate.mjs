// Chapman capture-recapture estimate of the wrongs in a chunk, from two readers.
export const ESTIMATE_CAVEAT = 'low estimate: readers share a brief, so they are not independent; foundByNone adds to this';

/** N = ((n1+1)(n2+1)/(m+1)) - 1 */
export function chapman(n1, n2, m) {
  if (![n1, n2, m].every((x) => Number.isInteger(x) && x >= 0)) throw new Error('chapman: counts must be non-negative integers');
  if (m > n1 || m > n2) throw new Error('chapman: m cannot exceed n1 or n2');
  return ((n1 + 1) * (n2 + 1)) / (m + 1) - 1;
}

/** {N, foundByReaders, remaining}; remaining = N - (n1 + n2 - m). */
export function estimateRemaining(n1, n2, m) {
  const N = chapman(n1, n2, m);
  const foundByReaders = n1 + n2 - m;
  return { N: round2(N), foundByReaders, remaining: round2(N - foundByReaders) };
}

export function round2(x) {
  return Math.round(x * 100) / 100;
}
