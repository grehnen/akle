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
