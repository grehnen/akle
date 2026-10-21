import type { GraphVersion, KommunCode } from "./graphVersion";

/**
 * The fewest kommuner outside `known` that a route from `from` to `to` must pass through.
 * Known kommuner are free; dead ends other than the endpoints are never passed through.
 * Returns Infinity when no route exists.
 */
export function routeCost(
  graph: GraphVersion,
  from: KommunCode,
  to: KommunCode,
  known: ReadonlySet<KommunCode>,
): number {
  return findCheapestRoute(graph, from, to, known)?.cost ?? Infinity;
}

/** The number of intermediate kommuner on a shortest route (N). */
export function shortestRouteLength(graph: GraphVersion, from: KommunCode, to: KommunCode): number {
  return routeCost(graph, from, to, new Set());
}

/** N from `from` to every other kommun it can reach, as one breadth-first search. */
export function shortestRouteLengthsFrom(
  graph: GraphVersion,
  from: KommunCode,
): Map<KommunCode, number> {
  const steps = new Map<KommunCode, number>([[from, 0]]);
  const queue: KommunCode[] = [from];
  for (let index = 0; index < queue.length; index++) {
    const current = queue[index];
    if (current !== from && graph.deadEnds.has(current)) continue;
    for (const next of graph.neighbors.get(current) ?? []) {
      if (steps.has(next)) continue;
      steps.set(next, (steps.get(current) as number) + 1);
      queue.push(next);
    }
  }
  steps.delete(from);
  return new Map([...steps].map(([code, step]) => [code, step - 1]));
}

/**
 * One cheapest route under `routeCost`, as the list of kommuner from `from` to `to`.
 * Ties go to the route found first when neighbors are visited in kommun-code order.
 */
export function cheapestRoute(
  graph: GraphVersion,
  from: KommunCode,
  to: KommunCode,
  known: ReadonlySet<KommunCode>,
): KommunCode[] | undefined {
  return findCheapestRoute(graph, from, to, known)?.route;
}

/**
 * The shortest route (fewest intermediate kommuner) that contains the most of `guesses`.
 * Ties go to the route whose kommun codes come first, compared in route order from `from`.
 * Dead ends other than the endpoints are never passed through. Undefined when no route exists.
 */
export function preferredShortestRoute(
  graph: GraphVersion,
  from: KommunCode,
  to: KommunCode,
  guesses: ReadonlySet<KommunCode>,
): KommunCode[] | undefined {
  const fromDistance = stepsFrom(graph, from);
  const toDistance = stepsFrom(graph, to);
  const length = fromDistance.get(to);
  if (length === undefined) return undefined;

  const onShortestRoute = (code: KommunCode) =>
    (code === from || !graph.deadEnds.has(code)) &&
    (fromDistance.get(code) ?? Infinity) + (toDistance.get(code) ?? Infinity) === length;

  // Best route from each kommun on a shortest route to `to`, built outward from `to`.
  const best = new Map<KommunCode, { score: number; route: KommunCode[] }>([
    [to, { score: guesses.has(to) ? 1 : 0, route: [to] }],
  ]);
  const layers = [...toDistance.entries()]
    .filter(([code, distance]) => distance > 0 && onShortestRoute(code))
    .sort((a, b) => a[1] - b[1]);
  for (const [code, distance] of layers) {
    let chosen: { score: number; route: KommunCode[] } | undefined;
    for (const next of graph.neighbors.get(code) ?? []) {
      const candidate = best.get(next);
      if (candidate === undefined || toDistance.get(next) !== distance - 1) continue;
      if (
        chosen === undefined ||
        candidate.score > chosen.score ||
        (candidate.score === chosen.score && compareRoutes(candidate.route, chosen.route) < 0)
      ) {
        chosen = candidate;
      }
    }
    if (chosen === undefined) continue;
    best.set(code, {
      score: chosen.score + (guesses.has(code) ? 1 : 0),
      route: [code, ...chosen.route],
    });
  }
  return best.get(from)?.route;
}

/** Steps from `origin` to every reachable kommun (one more than N), never through a dead end. */
function stepsFrom(graph: GraphVersion, origin: KommunCode): Map<KommunCode, number> {
  const steps = new Map<KommunCode, number>([[origin, 0]]);
  for (const [code, n] of shortestRouteLengthsFrom(graph, origin)) steps.set(code, n + 1);
  return steps;
}

function compareRoutes(a: readonly KommunCode[], b: readonly KommunCode[]): number {
  for (let index = 0; index < Math.min(a.length, b.length); index++) {
    const order = (a[index] as KommunCode).localeCompare(b[index] as KommunCode);
    if (order !== 0) return order;
  }
  return a.length - b.length;
}

function findCheapestRoute(
  graph: GraphVersion,
  from: KommunCode,
  to: KommunCode,
  known: ReadonlySet<KommunCode>,
): { cost: number; route: KommunCode[] } | undefined {
  if (from === to) {
    return { cost: 0, route: [from] };
  }
  const stepCost = (code: KommunCode) => (code === to || known.has(code) ? 0 : 1);
  const canPassThrough = (code: KommunCode) => code === from || !graph.deadEnds.has(code);

  // 0-1 BFS: free steps go to the front of the deque, paid steps to the back.
  const cost = new Map<KommunCode, number>([[from, 0]]);
  const previous = new Map<KommunCode, KommunCode>();
  const deque: KommunCode[] = [from];
  const settled = new Set<KommunCode>();

  while (deque.length > 0) {
    const current = deque.shift() as KommunCode;
    if (settled.has(current)) continue;
    settled.add(current);
    if (current === to) break;
    if (!canPassThrough(current)) continue;

    const currentCost = cost.get(current) ?? Infinity;
    const sortedNeighbors = [...(graph.neighbors.get(current) ?? [])].sort();
    for (const next of sortedNeighbors) {
      const step = stepCost(next);
      const nextCost = currentCost + step;
      if (nextCost < (cost.get(next) ?? Infinity)) {
        cost.set(next, nextCost);
        previous.set(next, current);
        if (step === 0) deque.unshift(next);
        else deque.push(next);
      }
    }
  }

  const finalCost = cost.get(to);
  if (finalCost === undefined) return undefined;

  const route = [to];
  let cursor = to;
  while (cursor !== from) {
    cursor = previous.get(cursor) as KommunCode;
    route.unshift(cursor);
  }
  return { cost: finalCost, route };
}
