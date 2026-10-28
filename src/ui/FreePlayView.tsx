import { useCallback, useState } from "react";
import type { DailyTripSource } from "../daily/loadDailyTrip";
import type { Clock } from "../engine/clock";
import { reviewGame } from "../engine/game";
import { loadCurrentVersion, type PinnedVersion } from "../freePlay/currentVersion";
import { type OpenedTripLink, openTrip, openTripLink, tripLinkPath } from "../freePlay/tripLink";
import { latestTrip, type ResumedTrip, resumeTrip } from "../freePlay/tripSaves";
import { browserSessionStorage, browserStorage, type KeyValueStorage } from "../progress/storage";
import { FreePlayLinkError } from "./FreePlayLinkError";
import { FreePlayScreen, type ShowTripLink, type UnfinishedTrip } from "./FreePlayScreen";
import { useLoaded } from "./useLoaded";

type FreePlayViewProps = {
  source: DailyTripSource;
  now: Date;
  /** A trip link's payload, the page's `r`; without one free play opens on its setup screen. */
  linkPayload?: string;
  /** The page's state, which may hold what setup opens on, as when going back to it from a trip. */
  pageState?: unknown;
  /** Shows a trip's link in the address bar while it is played. */
  onShowTripLink?: ShowTripLink;
  /** Where trips' saves are kept; localStorage by default. */
  storage?: KeyValueStorage;
  /** Where view choices that last one browser session are kept; sessionStorage by default. */
  sessionStorage?: KeyValueStorage;
  /** What a trip's time is read from; the system clock by default. */
  clock?: Clock;
};

type Loaded =
  | { kind: "setup"; version: PinnedVersion; unfinished?: UnfinishedTrip }
  | (Extract<OpenedTripLink, { kind: "trip" }> & { resumed?: ResumedTrip })
  | Extract<OpenedTripLink, { kind: "invalid" }>;

/**
 * Loads free play: a trip link's pinned version and trip, resuming it when the link has a save;
 * without a link, the setup screen on the current version, offering the way back to the most
 * recently played trip while it is unfinished. Only the graph versions needed are loaded.
 */
export function FreePlayView({
  source,
  now,
  linkPayload,
  pageState,
  onShowTripLink = () => {},
  storage,
  sessionStorage,
  clock,
}: FreePlayViewProps) {
  const [savesStorage] = useState(() => storage ?? browserStorage());
  const [fallbackSessionStorage] = useState(browserSessionStorage);
  const { loaded, failed } = useLoaded(
    useCallback((): Promise<Loaded> => {
      if (linkPayload === undefined) {
        return loadUnfinishedTrip(source, now, savesStorage).then(
          async ({ unfinished, version }) => ({
            kind: "setup",
            version: await loadCurrentVersion(source, now, version),
            unfinished,
          }),
        );
      }
      return openTripLink(source, now, linkPayload).then((opened): Loaded =>
        opened.kind === "trip"
          ? { ...opened, resumed: resumeTrip(savesStorage, opened.version, opened.trip) }
          : opened,
      );
    }, [source, now, linkPayload, savesStorage]),
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
      unfinished={loaded.kind === "setup" ? loaded.unfinished : undefined}
      pageState={loaded.kind === "setup" ? pageState : undefined}
      onShowTripLink={onShowTripLink}
      storage={savesStorage}
      sessionStorage={sessionStorage ?? fallbackSessionStorage}
      clock={clock}
    />
  );
}

/**
 * The most recently played trip while it is unfinished and still playable on its pinned
 * version; a finished, stale or corrupt save gives none, and an older unfinished trip never
 * stands in for it. Also the version loaded for that trip, which setup reuses when current.
 */
async function loadUnfinishedTrip(
  source: DailyTripSource,
  now: Date,
  storage: KeyValueStorage,
): Promise<{ unfinished?: UnfinishedTrip; version?: PinnedVersion }> {
  const latest = latestTrip(storage);
  if (latest === undefined) return {};
  const opened = await openTrip(source, now, latest.versionOrdinal, latest.trip);
  if (opened.kind !== "trip") return {};
  const { version, trip } = opened;
  // Already the most recently played, so looking it up changes nothing stored.
  const resumed = resumeTrip(storage, version, trip);
  if (resumed === undefined || reviewGame(version.graph, resumed.game).status !== "playing") {
    return { version };
  }
  return {
    unfinished: {
      mode: trip.mode,
      guesses: resumed.game.guesses.length,
      link: tripLinkPath(version.ordinal, trip),
    },
    version,
  };
}
