import type { Position } from "./sharedBorders";

export type CoastlineWay = { id: string; nodes: string[] };

export type CoastlineClosure = {
  /** Ways of open fragments cut off at the extract's edge, outside Sweden. */
  droppedWays: string[];
  /** OPL with the synthetic nodes and way that close the mainland coastline. */
  opl: string;
};

/**
 * An extract cuts the mainland coastline where it leaves the extract, so it can't be assembled
 * into land. The longest open chain is the mainland: this joins its end back to its start along
 * a route around the outside of the country. OSM coastlines have land on their left, so the
 * route must keep the country on its left too. Other open chains are fragments outside the
 * country and are dropped.
 */
export function closeMainlandCoastline(
  ways: readonly CoastlineWay[],
  positions: ReadonlyMap<string, Position>,
  outsideRoute: readonly Position[],
): CoastlineClosure {
  const chains = openChains(ways);
  if (chains.length === 0) throw new Error("The coastline has no open chain to close");
  const mainland = chains.reduce((longest, chain) =>
    chain.nodes.length > longest.nodes.length ? chain : longest,
  );
  const droppedWays = chains
    .filter((chain) => chain !== mainland)
    .flatMap((chain) => chain.ways)
    .sort((a, b) => Number(a) - Number(b));

  const [start, end] = [mainland.nodes[0], mainland.nodes[mainland.nodes.length - 1]];
  for (const node of [start, end]) {
    if (!positions.has(node)) throw new Error(`No position for coastline node ${node}`);
  }
  const syntheticNodes = outsideRoute.map(([x, y], index) => `n-${index + 1} v1 x${x} y${y}`);
  const routeNodes = outsideRoute.map((_, index) => `n-${index + 1}`);
  const closingWay = `w-1 v1 Tnatural=coastline N${[`n${end}`, ...routeNodes, `n${start}`].join(",")}`;
  return { droppedWays, opl: [...syntheticNodes, closingWay, ""].join("\n") };
}

type Chain = { ways: string[]; nodes: string[] };

function openChains(ways: readonly CoastlineWay[]): Chain[] {
  const byFirstNode = new Map(ways.map((way) => [way.nodes[0], way]));
  const lastNodes = new Set(ways.map((way) => way.nodes[way.nodes.length - 1]));
  const chains: Chain[] = [];
  for (const way of ways) {
    if (lastNodes.has(way.nodes[0])) continue;
    const chain: Chain = { ways: [way.id], nodes: [...way.nodes] };
    const visited = new Set([way]);
    let next = byFirstNode.get(chain.nodes[chain.nodes.length - 1]);
    while (next && !visited.has(next)) {
      visited.add(next);
      chain.ways.push(next.id);
      chain.nodes.push(...next.nodes.slice(1));
      next = byFirstNode.get(chain.nodes[chain.nodes.length - 1]);
    }
    chains.push(chain);
  }
  return chains;
}
