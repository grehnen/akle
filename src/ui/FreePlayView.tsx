import { useCallback, useState } from "react";
import type { DailyTripSource } from "../daily/loadDailyTrip";
import type { Clock } from "../engine/clock";
import { reviewGame } from "../engine/game";
import { loadCurrentVersion, type PinnedVersion } from "../freePlay/currentVersion";
import type { LinkedTrip } from "../freePlay/linkPayload";
import { PLAYABLE_MODES } from "../freePlay/modeRules";
import { type OpenedTripLink, openTrip, openTripLink } from "../freePlay/tripLink";
import { type ResumedTrip, resumeTrip, storedTrip } from "../freePlay/tripSlot";
import { kommunName } from "../graph/graphVersion";
import { browserSessionStorage, browserStorage, type KeyValueStorage } from "../progress/storage";
import { FreePlayLinkError } from "./FreePlayLinkError";
import { FreePlayScreen, type ShowTripLink } from "./FreePlayScreen";
import { useLoaded } from "./useLoaded";

type FreePlayViewProps = {
  source: DailyTripSource;
  now: Date;
  /** A trip link's payload, the page's `r`; without one free play opens on its setup screen. */
  linkPayload?: string;
  /** Shows a trip's link in the address bar while it is played. */
  onShowTripLink?: ShowTripLink;
  /** Where the trip slot is kept; localStorage by default. */
  storage?: KeyValueStorage;
  /** Where view choices that last one browser session are kept; sessionStorage by default. */
  sessionStorage?: KeyValueStorage;
  /** What a trip's time is read from; the system clock by default. */
  clock?: Clock;
};

type Loaded =
  | { kind: "setup"; version: PinnedVersion }
  | (Extract<OpenedTripLink, { kind: "trip" }> & { resumed?: ResumedTrip })
  | Extract<OpenedTripLink, { kind: "invalid" }>;

/**
 * Loads free play: a trip link's pinned version and trip, resuming it when it is exactly the
 * stored trip; without a link, the stored trip when it is unfinished, or else the current
 * version for the setup screen. Only the one graph version shown is loaded.
 */
export function FreePlayView({
  source,
  now,
  linkPayload,
  onShowTripLink = () => {},
  storage,
  sessionStorage,
  clock,
}: FreePlayViewProps) {
  const [slotStorage] = useState(() => storage ?? browserStorage());
  const [fallbackSessionStorage] = useState(browserSessionStorage);
  const { loaded, failed } = useLoaded(
    useCallback((): Promise<Loaded> => {
      const resume = (opened: Loaded): Loaded =>
        opened.kind === "trip"
          ? {
              ...opened,
              resumed: resumeTrip(slotStorage, opened.version, opened.trip),
            }
          : opened;
      return linkPayload === undefined
        ? loadUnfinishedTrip(source, now, slotStorage).then(
            async ({ unfinished, version }) =>
              unfinished ??
              loadCurrentVersion(source, now, version).then((current) => ({
                kind: "setup",
                version: current,
              })),
          )
        : openTripLink(source, now, linkPayload).then(playableLink).then(resume);
    }, [source, now, linkPayload, slotStorage]),
  );

  if (failed) return <p role="alert">Kunde inte ladda fri resa. Försök igen senare.</p>;
  if (loaded === undefined) return <p>Laddar fri resa…</p>;
  if (loaded.kind === "invalid") return <FreePlayLinkError trip={loaded.trip} />;
  const { graph, ordinal } = loaded.version;
  return (
    <FreePlayScreen
      graph={graph}
      ordinal={ordinal}
      linkedTrip={loaded.kind === "trip" ? loaded.trip : undefined}
      resumed={loaded.kind === "trip" ? loaded.resumed : undefined}
      onShowTripLink={onShowTripLink}
      storage={slotStorage}
      sessionStorage={sessionStorage ?? fallbackSessionStorage}
      clock={clock}
    />
  );
}

/**
 * The stored trip on its pinned version, when it is still playable there and unfinished; a
 * finished, stale or corrupt slot gives none, so the setup screen opens, on the version loaded
 * for the stored trip when that is the current one.
 */
async function loadUnfinishedTrip(
  source: DailyTripSource,
  now: Date,
  storage: KeyValueStorage,
): Promise<{ unfinished?: Loaded; version?: PinnedVersion }> {
  const stored = storedTrip(storage);
  if (stored === undefined) return {};
  const opened = playableLink(await openTrip(source, now, stored.versionOrdinal, stored.trip));
  if (opened.kind !== "trip") return {};
  const { version } = opened;
  const resumed = resumeTrip(storage, version, opened.trip);
  if (resumed === undefined || reviewGame(version.graph, resumed.game).status !== "playing") {
    return { version };
  }
  return { unfinished: { ...opened, resumed }, version };
}

/**
 * Only the `PLAYABLE_MODES` can be played so far; a link to a trip in another mode is
 * invalid until that mode's ticket lands. The app makes no such links yet.
 */
function playableLink(opened: OpenedTripLink): Loaded {
  if (opened.kind === "invalid" || PLAYABLE_MODES.has(opened.trip.mode.kind)) return opened;
  return { kind: "invalid", trip: tripNames(opened.version, opened.trip) };
}

function tripNames({ graph }: PinnedVersion, trip: LinkedTrip) {
  return { start: kommunName(graph, trip.start), destination: kommunName(graph, trip.destination) };
}
