import { useCallback, useState } from "react";
import type { DailyTripSource } from "../daily/loadDailyTrip";
import type { Clock } from "../engine/clock";
import { type BuilderDraft, restoreBuilderDraft, saveBuilderDraft } from "../freePlay/builderDraft";
import { loadCurrentVersion, type PinnedVersion } from "../freePlay/currentVersion";
import {
  itineraryLinkPath,
  type OpenedItineraryLink,
  openItineraryLink,
} from "../freePlay/itineraryLink";
import type { ItineraryPlay } from "../freePlay/itineraryPlay";
import {
  resumeItinerary,
  saveItinerarySlot,
  type UnfinishedItinerary,
  unfinishedItinerary,
} from "../freePlay/itinerarySlot";
import { browserSessionStorage, browserStorage, type KeyValueStorage } from "../progress/storage";
import { AppLink } from "./AppLink";
import { FreePlayLinkError } from "./FreePlayLinkError";
import { ItineraryBuilder } from "./ItineraryBuilder";
import { ItineraryScreen } from "./ItineraryScreen";
import { useLoaded } from "./useLoaded";

type ItineraryViewProps = {
  source: DailyTripSource;
  now: Date;
  /** An itinerary link's payload, the page's `r`; without one the page is the builder. */
  linkPayload?: string;
  /** An itinerary link's title, the page's `namn`. */
  title?: string;
  /** Opens a built itinerary's link in place, `/resplan?namn=…&r=…`. */
  onPlay: (link: string) => void;
  /** Where the itinerary slot and the builder's draft are kept; localStorage by default. */
  storage?: KeyValueStorage;
  /** Where view choices that last one browser session are kept; sessionStorage by default. */
  sessionStorage?: KeyValueStorage;
  /** What a trip's time is read from; the system clock by default. */
  clock?: Clock;
};

type Loaded =
  | {
      kind: "builder";
      version: PinnedVersion;
      draft?: BuilderDraft;
      unfinished?: UnfinishedItinerary;
    }
  | (OpenedItineraryLink & { resumed?: ItineraryPlay });

/**
 * The itinerary page: with `r` the itinerary its link opens, on the version it pins, or the
 * free-play error screen when the link is invalid; without `r` the builder, on the current
 * version that every trip of the built itinerary is pinned to. Only that one version loads.
 * The itinerary slot keeps the latest itinerary begun: its exact link resumes it, finished or
 * not, and the builder links back to it while it's unfinished. The builder's draft is kept on
 * every change and reopens with it, unless made on another version or unreadable.
 */
export function ItineraryView({
  source,
  now,
  linkPayload,
  title,
  onPlay,
  storage,
  sessionStorage,
  clock,
}: ItineraryViewProps) {
  const [slotStorage] = useState(() => storage ?? browserStorage());
  const [fallbackSessionStorage] = useState(browserSessionStorage);
  const { loaded, failed } = useLoaded(
    useCallback(
      (): Promise<Loaded> =>
        linkPayload === undefined
          ? loadCurrentVersion(source, now).then((version) => ({
              kind: "builder",
              version,
              draft: restoreBuilderDraft(slotStorage, version),
              unfinished: unfinishedItinerary(slotStorage),
            }))
          : openItineraryLink(source, now, title, linkPayload).then((opened) =>
              opened.kind === "itinerary"
                ? { ...opened, resumed: resumeItinerary(slotStorage, opened) }
                : opened,
            ),
      [source, now, linkPayload, title, slotStorage],
    ),
  );

  const savePlay = useCallback(
    (play: ItineraryPlay) => {
      if (loaded?.kind !== "itinerary") return;
      const { version, title: savedTitle, trips } = loaded;
      saveItinerarySlot(slotStorage, {
        versionOrdinal: version.ordinal,
        title: savedTitle,
        trips,
        play,
      });
    },
    [loaded, slotStorage],
  );

  const saveDraft = useCallback(
    (draft: BuilderDraft) => {
      if (loaded?.kind === "builder") saveBuilderDraft(slotStorage, loaded.version.ordinal, draft);
    },
    [loaded, slotStorage],
  );

  if (failed) return <p role="alert">Kunde inte ladda resplanen. Försök igen senare.</p>;
  if (loaded === undefined) return <p>Laddar resplan…</p>;
  if (loaded.kind === "invalid") return <FreePlayLinkError trip={loaded.trip} itinerary />;
  if (loaded.kind === "builder") {
    const { graph, ordinal } = loaded.version;
    const { draft, unfinished } = loaded;
    return (
      <ItineraryBuilder
        graph={graph}
        ordinal={ordinal}
        onPlay={onPlay}
        initialDraft={draft}
        onDraftChange={saveDraft}
        banner={unfinished && <ResumeBanner unfinished={unfinished} onPlay={onPlay} />}
      />
    );
  }
  return (
    <ItineraryScreen
      graph={loaded.version.graph}
      title={loaded.title}
      trips={loaded.trips}
      link={itineraryLinkPath(loaded.version.ordinal, loaded.title ?? "", loaded.trips)}
      sessionStorage={sessionStorage ?? fallbackSessionStorage}
      clock={clock}
      initialPlay={loaded.resumed}
      onPlayChange={savePlay}
    />
  );
}

/** The builder's way back to the unfinished itinerary, opened in place like `Spela`. */
function ResumeBanner({
  unfinished: { title, tripNumber, tripCount, link },
  onPlay,
}: {
  unfinished: UnfinishedItinerary;
  onPlay: (link: string) => void;
}) {
  const named = title === undefined ? "" : `${title}, `;
  return (
    <AppLink className="itinerary-resume" href={link} onNavigate={onPlay}>
      Fortsätt resplanen: {named}resa {tripNumber} av {tripCount}
    </AppLink>
  );
}
