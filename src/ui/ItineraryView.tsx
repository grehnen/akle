import { useEffect, useState } from "react";
import type { DailyTripSource } from "../daily/loadDailyTrip";
import type { Clock } from "../engine/clock";
import { loadCurrentVersion, type PinnedVersion } from "../freePlay/currentVersion";
import {
  itineraryLinkPath,
  type OpenedItineraryLink,
  openItineraryLink,
} from "../freePlay/itineraryLink";
import { browserSessionStorage, type KeyValueStorage } from "../progress/storage";
import { FreePlayLinkError } from "./FreePlayLinkError";
import { ItineraryBuilder } from "./ItineraryBuilder";
import { ItineraryScreen } from "./ItineraryScreen";

type ItineraryViewProps = {
  source: DailyTripSource;
  now: Date;
  /** An itinerary link's payload, the page's `r`; without one the page is the builder. */
  linkPayload?: string;
  /** An itinerary link's title, the page's `namn`. */
  title?: string;
  /** Opens a built itinerary's link in place, `/resplan?namn=…&r=…`. */
  onPlay: (link: string) => void;
  /** Where view choices that last one browser session are kept; sessionStorage by default. */
  sessionStorage?: KeyValueStorage;
  /** What a trip's time is read from; the system clock by default. */
  clock?: Clock;
};

type Loaded = { kind: "builder"; version: PinnedVersion } | OpenedItineraryLink;

/**
 * The itinerary page: with `r` the itinerary its link opens, on the version it pins, or the
 * free-play error screen when the link is invalid; without `r` the builder, on the current
 * version that every trip of the built itinerary is pinned to. Only that one version loads.
 */
export function ItineraryView({
  source,
  now,
  linkPayload,
  title,
  onPlay,
  sessionStorage,
  clock,
}: ItineraryViewProps) {
  const [loaded, setLoaded] = useState<Loaded>();
  const [failed, setFailed] = useState(false);
  const [fallbackSessionStorage] = useState(browserSessionStorage);

  useEffect(() => {
    let cancelled = false;
    const loading: Promise<Loaded> =
      linkPayload === undefined
        ? loadCurrentVersion(source, now).then((version) => ({ kind: "builder", version }))
        : openItineraryLink(source, now, title, linkPayload);
    loading
      .then((result) => !cancelled && setLoaded(result))
      .catch((error: unknown) => {
        console.error(error);
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [source, now, linkPayload, title]);

  if (failed) return <p role="alert">Kunde inte ladda resplanen. Försök igen senare.</p>;
  if (loaded === undefined) return <p>Laddar resplan…</p>;
  if (loaded.kind === "invalid") return <FreePlayLinkError trip={loaded.trip} itinerary />;
  if (loaded.kind === "builder") {
    const { graph, ordinal } = loaded.version;
    return <ItineraryBuilder graph={graph} ordinal={ordinal} onPlay={onPlay} />;
  }
  return (
    <ItineraryScreen
      graph={loaded.version.graph}
      title={loaded.title}
      trips={loaded.trips}
      link={itineraryLinkPath(loaded.version.ordinal, loaded.title ?? "", loaded.trips)}
      sessionStorage={sessionStorage ?? fallbackSessionStorage}
      clock={clock}
    />
  );
}
