import { useEffect, useState } from "react";
import type { DailyTripSource } from "../daily/loadDailyTrip";
import { loadCurrentVersion, type PinnedVersion } from "../freePlay/currentVersion";
import { ItineraryBuilder } from "./ItineraryBuilder";

type ItineraryViewProps = {
  source: DailyTripSource;
  now: Date;
  /** An itinerary link's payload, the page's `r`; without one the page is the builder. */
  linkPayload?: string;
  /** Opens a built itinerary's link in place, `/resplan?namn=…&r=…`. */
  onPlay: (link: string) => void;
};

/**
 * The itinerary page: without `r` the builder, on the current version that every trip of the
 * built itinerary is pinned to.
 */
export function ItineraryView({ source, now, linkPayload, onPlay }: ItineraryViewProps) {
  const [version, setVersion] = useState<PinnedVersion>();
  const [failed, setFailed] = useState(false);
  const building = linkPayload === undefined;

  useEffect(() => {
    if (!building) return;
    let cancelled = false;
    loadCurrentVersion(source, now)
      .then((current) => !cancelled && setVersion(current))
      .catch((error: unknown) => {
        console.error(error);
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [source, now, building]);

  // Playing an itinerary from its link is #81's; until then the page only says so.
  if (!building) return <p>Resplaner kan inte spelas än.</p>;
  if (failed) return <p role="alert">Kunde inte ladda resplanen. Försök igen senare.</p>;
  if (version === undefined) return <p>Laddar resplan…</p>;
  return <ItineraryBuilder graph={version.graph} ordinal={version.ordinal} onPlay={onPlay} />;
}
