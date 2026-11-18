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

/**
 * A rough 95% range on the remaining wrongs, from Chapman's variance (Seber 1970):
 * Var(N) = (n1+1)(n2+1)(n1-m)(n2-m) / ((m+1)^2 (m+2)); N +- 1.96 sd, less the wrongs already found, floored at 0.
 * lowConfidence when the overlap m is under 3: the estimator is unstable there, and a pass with no finds gives 0
 * by construction.
 */
export function estimateRange(n1, n2, m) {
  const N = chapman(n1, n2, m);
  const found = n1 + n2 - m;
  const sd = Math.sqrt(((n1 + 1) * (n2 + 1) * (n1 - m) * (n2 - m)) / ((m + 1) ** 2 * (m + 2)));
  const out = {
    remainingLow: round2(Math.max(0, N - 1.96 * sd - found)),
    remainingHigh: round2(Math.max(0, N + 1.96 * sd - found)),
    lowConfidence: m < 3,
  };
  if (found === 0) out.why = 'no reader found a wrong: the estimate is 0 by construction and shows nothing';
  else if (m < 3) out.why = `overlap m = ${m} (under 3): the estimate is unstable`;
  return out;
}

export function round2(x) {
  return Math.round(x * 100) / 100;
}
