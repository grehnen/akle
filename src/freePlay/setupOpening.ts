import type { Trip } from "../engine/game";
import type { GraphVersion } from "../graph/graphVersion";
import type { DistanceRange } from "./draw";
import type { LinkedTrip } from "./linkPayload";
import { readSetupChoice, type SetupChoice, setupChoiceOfTrip } from "./setupChoice";
import { isRecord } from "./storedGame";

/**
 * What setup opens on when the player goes back to it from a trip, to change it: the trip's mode
 * and range, and its pair for Välj själv when it was picked. Setup opens on it without keeping
 * it as the setup choice; only a draw or a start does.
 */
export type SetupOpening = { choice: SetupChoice; pair?: Trip };

/**
 * The opening for going back to setup from `trip`: its mode, the range it was drawn from (or the
 * setup choice's, for a trip not drawn), and, for a trip not drawn whose ends the player has
 * seen or picked, its pair. A trip whose ends are still hidden never gives them away.
 */
export function setupOpeningOn(
  trip: LinkedTrip,
  { drawn, range, endsKnown }: { drawn: boolean; range?: DistanceRange; endsKnown: boolean },
  setupChoice: SetupChoice,
): SetupOpening {
  const choice = setupChoiceOfTrip(trip.mode, range, setupChoice);
  const pair =
    !drawn && endsKnown ? { start: trip.start, destination: trip.destination } : undefined;
  return { choice, pair };
}

/** The page state a navigation to setup carries its opening in. */
export const setupOpeningState = (opening: SetupOpening) => ({ setupOpening: opening });

/**
 * The opening a page state carries, its range fitted to `graph`'s `largest` distance and its
 * pair dropped unless both ends are in `graph`; none for any other state.
 */
export function readSetupOpening(
  state: unknown,
  graph: GraphVersion,
  largest: number,
): SetupOpening | undefined {
  if (!isRecord(state) || !isRecord(state.setupOpening)) return undefined;
  const { choice: storedChoice, pair: storedPair } = state.setupOpening;
  const choice = readSetupChoice(storedChoice, largest);
  if (choice === undefined) return undefined;
  const inGraph = (code: unknown): code is string =>
    typeof code === "string" && graph.kommuner.has(code);
  const pair =
    isRecord(storedPair) && inGraph(storedPair.start) && inGraph(storedPair.destination)
      ? { start: storedPair.start, destination: storedPair.destination }
      : undefined;
  return { choice, pair };
}
