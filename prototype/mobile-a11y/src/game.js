// PROTOTYPE game logic: Travle rules as recorded in "What are Åkle's core rules?" (#5).

export const normalize = (text) =>
  text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");

// Node-weighted distances: entering an unguessed kommun costs 1, a guessed one (or an endpoint) costs 0.
function distancesFrom(origin, neighbors, freeSet) {
  const dist = { [origin]: 0 };
  const queue = [[0, origin]];
  while (queue.length) {
    queue.sort((a, b) => a[0] - b[0]);
    const [d, node] = queue.shift();
    if (d > dist[node]) continue;
    for (const next of neighbors[node]) {
      const nd = d + (freeSet.has(next) ? 0 : 1);
      if (nd < (dist[next] ?? Infinity)) {
        dist[next] = nd;
        queue.push([nd, next]);
      }
    }
  }
  return dist;
}

export function remainingDistance(puzzle, guesses, neighbors) {
  const free = new Set([puzzle.start, puzzle.destination, ...guesses]);
  return distancesFrom(puzzle.start, neighbors, free)[puzzle.destination] ?? Infinity;
}

export function connectedToStart(puzzle, guesses, neighbors) {
  const usable = new Set([puzzle.destination, ...guesses]);
  const seen = new Set([puzzle.start]);
  const stack = [puzzle.start];
  while (stack.length) {
    const node = stack.pop();
    for (const next of neighbors[node]) if (usable.has(next) && !seen.has(next)) (seen.add(next), stack.push(next));
  }
  return seen;
}

export function feedbackFor(puzzle, previousGuesses, guess, neighbors) {
  const free = new Set([puzzle.start, puzzle.destination, ...previousGuesses]);
  const fromStart = distancesFrom(puzzle.start, neighbors, free);
  const fromDestination = distancesFrom(puzzle.destination, neighbors, free);
  const best = fromStart[puzzle.destination];
  const through = (fromStart[guess] ?? Infinity) + (fromDestination[guess] ?? Infinity) - 1;
  if (through === best) return connectedToStart(puzzle, [...previousGuesses, guess], neighbors).has(guess) ? "✅" : "🟩";
  if (through === best + 1) return "🟧";
  return "🟥";
}

export function guessLimit(n) {
  if (n <= 3) return n + 4;
  if (n <= 6) return n + 5;
  if (n <= 9) return n + 6;
  if (n <= 12) return n + 7;
  return n + 8;
}

// --- Added for the mobile/a11y prototype (#15) ---

export function fuzzyScore(query, name) {
  const target = normalize(name);
  let position = 0;
  let score = 0;
  for (const char of query) {
    const found = target.indexOf(char, position);
    if (found === -1) return -Infinity;
    score -= found - position;
    position = found + 1;
  }
  return score + (target.startsWith(query) ? 100 : 0) - target.length * 0.01;
}

// First unguessed kommun on a shortest route (hint 1).
export function nextKommunHint(puzzle, guesses, neighbors) {
  const free = new Set([puzzle.start, puzzle.destination, ...guesses]);
  const dist = { [puzzle.start]: 0 };
  const previous = {};
  const queue = [[0, puzzle.start]];
  while (queue.length) {
    queue.sort((a, b) => a[0] - b[0] || a[1].localeCompare(b[1]));
    const [d, node] = queue.shift();
    if (d > dist[node]) continue;
    for (const next of neighbors[node]) {
      const nd = d + (free.has(next) ? 0 : 1);
      if (nd < (dist[next] ?? Infinity)) {
        dist[next] = nd;
        previous[next] = node;
        queue.push([nd, next]);
      }
    }
  }
  const route = [];
  for (let node = puzzle.destination; node; node = previous[node]) route.unshift(node);
  return route.find((code) => !free.has(code)) ?? null;
}

export const initials = (name) =>
  name
    .split(/[\s-]+/)
    .map((word) => `${word[0].toUpperCase()}…`)
    .join(" ");

export const FEEDBACK_TEXT = {
  "✅": "på kortaste vägen och ansluten",
  "🟩": "på en kortaste väg",
  "🟧": "nära en kortaste väg",
  "🟥": "långt från en kortaste väg",
};
