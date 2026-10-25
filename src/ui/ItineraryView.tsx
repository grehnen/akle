import { useCallback, useState } from "react";
import type { DailyTripSource } from "../daily/loadDailyTrip";
import type { Clock } from "../engine/clock";
import { type BuilderDraft, restoreBuilderDraft, saveBuilderDraft } from "../freePlay/builderDraft";
import {
  loadCurrentVersion,
  loadPinnedVersion,
  type PinnedVersion,
} from "../freePlay/currentVersion";
import {
  itineraryLinkPath,
  type OpenedItineraryLink,
  openItineraryLink,
} from "../freePlay/itineraryLink";
import type { ItineraryPlay } from "../freePlay/itineraryPlay";
import {
  latestItineraryVersion,
  resumeItinerary,
  saveItinerary,
  type UnfinishedItinerary,
  unfinishedItinerary,
} from "../freePlay/itinerarySaves";
import { browserSessionStorage, browserStorage, type KeyValueStorage } from "../progress/storage";
import { AppLink } from "./AppLink";
import { FreePlayLinkError } from "./FreePlayLinkError";
import { ItineraryBuilder } from "./ItineraryBuilder";
// PROTOTYPE (F): the redesigned builder replaces the real one in dev. Never merge to main.
import { ItineraryBuilderPrototype } from "./ItineraryBuilderPrototype";
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
  /** Where itineraries' saves and the builder's draft are kept; localStorage by default. */
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
 * version that every trip of the built itinerary is pinned to. Only the versions needed load.
 * Every itinerary begun keeps a save: its exact link resumes it, finished or not, and the
 * builder links back to the most recently played while it's unfinished. The builder's draft is
 * kept on every change and reopens with it, unless made on another version or unreadable.
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
  const [savesStorage] = useState(() => storage ?? browserStorage());
  const [fallbackSessionStorage] = useState(browserSessionStorage);
  const { loaded, failed } = useLoaded(
    useCallback(
      (): Promise<Loaded> =>
        linkPayload === undefined
          ? loadBuilder(source, now, savesStorage)
          : openItineraryLink(source, now, title, linkPayload).then((opened) =>
              opened.kind === "itinerary"
                ? { ...opened, resumed: resumeItinerary(savesStorage, opened) }
                : opened,
            ),
      [source, now, linkPayload, title, savesStorage],
    ),
  );

  const savePlay = useCallback(
    (play: ItineraryPlay) => {
      if (loaded?.kind !== "itinerary") return;
      const { version, title: savedTitle, trips } = loaded;
      saveItinerary(savesStorage, {
        versionOrdinal: version.ordinal,
        title: savedTitle,
        trips,
        play,
      });
    },
    [loaded, savesStorage],
  );

  const saveDraft = useCallback(
    (draft: BuilderDraft) => {
      if (loaded?.kind === "builder") saveBuilderDraft(savesStorage, loaded.version.ordinal, draft);
    },
    [loaded, savesStorage],
  );

  if (failed) return <p role="alert">Kunde inte ladda resplanen. Försök igen senare.</p>;
  if (loaded === undefined) return <p>Laddar resplan…</p>;
  if (loaded.kind === "invalid") return <FreePlayLinkError trip={loaded.trip} itinerary />;
  if (loaded.kind === "builder") {
    const { graph, ordinal } = loaded.version;
    const { draft, unfinished } = loaded;
    if (import.meta.env?.DEV) return <ItineraryBuilderPrototype graph={graph} onPlay={onPlay} />;
    return (
      <ItineraryBuilder
        graph={graph}
        ordinal={ordinal}
        onPlay={onPlay}
        initialDraft={draft}
        onDraftChange={saveDraft}
        banner={unfinished && <ResumeBanner unfinished={unfinished} />}
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

/**
 * The builder on the current version, its draft, and the most recently played itinerary while
 * it's unfinished, resumed on the version it's pinned to, which is reused when current.
 */
async function loadBuilder(
  source: DailyTripSource,
  now: Date,
  storage: KeyValueStorage,
): Promise<Loaded> {
  const ordinal = latestItineraryVersion(storage);
  const pinned = ordinal === undefined ? undefined : await loadPinnedVersion(source, now, ordinal);
  const version = await loadCurrentVersion(source, now, pinned);
  return {
    kind: "builder",
    version,
    draft: restoreBuilderDraft(storage, version),
    unfinished: pinned && unfinishedItinerary(storage, pinned),
  };
}

/** The builder's way back to the unfinished itinerary, opened in place like `Spela`. */
function ResumeBanner({
  unfinished: { title, tripNumber, tripCount, link },
}: {
  unfinished: UnfinishedItinerary;
}) {
  const named = title === undefined ? "" : `${title}, `;
  return (
    <AppLink className="resume-link itinerary-resume" href={link}>
      Fortsätt resplanen: {named}resa {tripNumber} av {tripCount}
    </AppLink>
  );
}
