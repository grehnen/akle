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
  const search = searchTowards(graph, from, to, known);
  const totalWeight = search.weightToEnd.get(from);
  return totalWeight === undefined ? Infinity : Math.floor(totalWeight / search.stepsPerCost);
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
 * One cheapest route under `routeCost`, as the list of kommuner from `from` to `to`. Among
 * equally cheap routes it takes the one with the fewest kommuner, then the one whose kommun
 * codes come first, compared in route order from `from`.
 */
export function cheapestRoute(
  graph: GraphVersion,
  from: KommunCode,
  to: KommunCode,
  known: ReadonlySet<KommunCode>,
): KommunCode[] | undefined {
  return routeAlong(graph, from, to, searchTowards(graph, from, to, known));
}

/**
 * One shortest route, as the list of kommuner from `from` to `to`. Among shortest routes it
 * takes the one with the most `guesses` on it, then the one whose kommun codes come first,
 * compared in route order from `from`.
 */
export function shortestRoute(
  graph: GraphVersion,
  from: KommunCode,
  to: KommunCode,
  guesses: ReadonlySet<KommunCode>,
): KommunCode[] | undefined {
  const stepWeight = graph.kommuner.size + 1;
  const enterWeight = (code: KommunCode) => stepWeight + (code === to || guesses.has(code) ? 0 : 1);
  return routeAlong(graph, from, to, dijkstraTowards(graph, from, to, enterWeight));
}

/** Walks a finished search from `from` to `to`, taking the first neighbor by code at each fork. */
function routeAlong(
  graph: GraphVersion,
  from: KommunCode,
  to: KommunCode,
  { weightToEnd, canPassThrough, enterWeight }: ReturnType<typeof dijkstraTowards>,
): KommunCode[] | undefined {
  if (!weightToEnd.has(from)) return undefined;
  const route = [from];
  let cursor = from;
  while (cursor !== to) {
    const remaining = weightToEnd.get(cursor) as number;
    cursor = [...(graph.neighbors.get(cursor) ?? [])]
      .sort()
      .find(
        (next) =>
          canPassThrough(next) &&
          (weightToEnd.get(next) ?? Infinity) + enterWeight(next) === remaining,
      ) as KommunCode;
    route.push(cursor);
  }
  return route;
}

/**
 * The search behind `routeCost` and `cheapestRoute`: a route's weight orders by cost, then by
 * length: cost × stepsPerCost + steps.
 */
function searchTowards(
  graph: GraphVersion,
  from: KommunCode,
  to: KommunCode,
  known: ReadonlySet<KommunCode>,
) {
  const stepsPerCost = graph.kommuner.size + 1;
  const enterWeight = (code: KommunCode) => (code === to || known.has(code) ? 0 : stepsPerCost) + 1;
  return { ...dijkstraTowards(graph, from, to, enterWeight), stepsPerCost };
}

/**
 * Dijkstra outward from `to`, stopping once `from` is settled: the weight of the best route
 * from each settled kommun to `to`, where entering a kommun costs `enterWeight`. Dead ends other
 * than the endpoints are never passed through.
 */
function dijkstraTowards(
  graph: GraphVersion,
  from: KommunCode,
  to: KommunCode,
  enterWeight: (code: KommunCode) => number,
) {
  const canPassThrough = (code: KommunCode) => code === to || !graph.deadEnds.has(code);

  const weightToEnd = new Map<KommunCode, number>([[to, 0]]);
  const settled = new Set<KommunCode>();
  const frontier = new Set<KommunCode>([to]);
  while (frontier.size > 0 && !settled.has(from)) {
    let current = to;
    let currentWeight = Infinity;
    for (const code of frontier) {
      const weight = weightToEnd.get(code) as number;
      if (weight < currentWeight) [current, currentWeight] = [code, weight];
    }
    frontier.delete(current);
    settled.add(current);
    if (!canPassThrough(current)) continue;
    const weight = currentWeight + enterWeight(current);
    for (const previous of graph.neighbors.get(current) ?? []) {
      if (settled.has(previous) || weight >= (weightToEnd.get(previous) ?? Infinity)) continue;
      weightToEnd.set(previous, weight);
      frontier.add(previous);
    }
  }

  return { weightToEnd, canPassThrough, enterWeight };
}
