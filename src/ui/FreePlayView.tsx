import { useEffect, useState } from "react";
import type { DailyTripSource } from "../daily/loadDailyTrip";
import { loadCurrentVersion, type PinnedVersion } from "../freePlay/currentVersion";
import type { LinkedTrip } from "../freePlay/linkPayload";
import { type OpenedTripLink, openTripLink } from "../freePlay/tripLink";
import { kommunName } from "../graph/graphVersion";
import { browserSessionStorage, type KeyValueStorage } from "../progress/storage";
import { FreePlayLinkError } from "./FreePlayLinkError";
import { FreePlayScreen, type ShowTripLink } from "./FreePlayScreen";

type FreePlayViewProps = {
  source: DailyTripSource;
  now: Date;
  /** A trip link's payload, the page's `r`; without one free play opens on its setup screen. */
  linkPayload?: string;
  /** Shows a trip's link in the address bar while it is played. */
  onShowTripLink?: ShowTripLink;
  /** Where view choices that last one browser session are kept; sessionStorage by default. */
  sessionStorage?: KeyValueStorage;
};

type Loaded =
  | { kind: "setup"; version: PinnedVersion }
  | Extract<OpenedTripLink, { kind: "trip" }>
  | Extract<OpenedTripLink, { kind: "invalid" }>;

/**
 * Loads free play: a trip link's pinned version and trip, or else the current version for the
 * setup screen. Only that one graph version is loaded.
 */
export function FreePlayView({
  source,
  now,
  linkPayload,
  onShowTripLink = () => {},
  sessionStorage,
}: FreePlayViewProps) {
  const [loaded, setLoaded] = useState<Loaded>();
  const [failed, setFailed] = useState(false);
  const [fallbackSessionStorage] = useState(browserSessionStorage);

  useEffect(() => {
    let cancelled = false;
    const loading: Promise<Loaded> =
      linkPayload === undefined
        ? loadCurrentVersion(source, now).then((version) => ({ kind: "setup", version }))
        : openTripLink(source, now, linkPayload).then(playableLink);
    loading
      .then((result) => !cancelled && setLoaded(result))
      .catch((error: unknown) => {
        console.error(error);
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [source, now, linkPayload]);

  if (failed) return <p role="alert">Kunde inte ladda fri resa. Försök igen senare.</p>;
  if (loaded === undefined) return <p>Laddar fri resa…</p>;
  if (loaded.kind === "invalid") return <FreePlayLinkError trip={loaded.trip} />;
  const { graph, ordinal } = loaded.version;
  return (
    <FreePlayScreen
      graph={graph}
      ordinal={ordinal}
      linkedTrip={loaded.kind === "trip" ? loaded.trip : undefined}
      onShowTripLink={onShowTripLink}
      sessionStorage={sessionStorage ?? fallbackSessionStorage}
    />
  );
}

/**
 * Only standard mode can be played so far; a link to a trip in another mode is invalid until
 * that mode's ticket lands. The app makes no such links yet.
 */
function playableLink(opened: OpenedTripLink): Loaded {
  if (opened.kind === "invalid" || opened.trip.mode.kind === "standard") return opened;
  return { kind: "invalid", trip: tripNames(opened.version, opened.trip) };
}

function tripNames({ graph }: PinnedVersion, trip: LinkedTrip) {
  return { start: kommunName(graph, trip.start), destination: kommunName(graph, trip.destination) };
}
