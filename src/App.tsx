import { useCallback, useEffect, useState } from "react";
import { type DailyTripSource, loadDailyTrip } from "./daily/loadDailyTrip";
import { readHistory } from "./progress/history";
import { deriveStats } from "./progress/stats";
import { browserStorage, type KeyValueStorage } from "./progress/storage";
import { ITINERARY_PATH } from "./freePlay/itineraryLink";
import { FREE_PLAY_PATH } from "./freePlay/tripLink";
import { type LoadMapLibre, loadMapLibre, MapLibreLoaderContext } from "./map/mapLibreLoader";
import { AppLink } from "./ui/AppLink";
import { NavigateContext } from "./ui/navigation";
import { DailyTripView } from "./ui/DailyTripView";
import { FreePlayView } from "./ui/FreePlayView";
import { ItineraryView } from "./ui/ItineraryView";
import { DEFAULT_PACING, type Pacing, PacingContext } from "./ui/pacing";
import { RulesDialog, RulesIcon } from "./ui/RulesDialog";
import { StatsDialog, StatsIcon } from "./ui/StatsDialog";
import { useLoaded } from "./ui/useLoaded";

type AppProps = {
  source: DailyTripSource;
  now?: () => Date;
  /** Where progress and history are kept; localStorage by default. */
  storage?: KeyValueStorage;
  /** Where view choices that last one browser session are kept; sessionStorage by default. */
  sessionStorage?: KeyValueStorage;
  /** The page's path at load; the address bar's by default. */
  path?: string;
  /** The page's query at load, such as a trip link's `?r=…`; the address bar's by default. */
  search?: string;
  /** How long the board lingers and how often running displays tick; tests make these short. */
  pacing?: Pacing;
  /** Loads MapLibre for each map; tests stand in for it, to decide when a map is drawn. */
  loadMap?: LoadMapLibre;
};

/** Whether a path is the given page, however the server or the dev server spells it. */
function isPagePath(path: string, page: string): boolean {
  return [page, `${page}/`, `${page}.html`].includes(path);
}

export function App({
  source,
  now = () => new Date(),
  storage,
  sessionStorage,
  path: initialPath = globalThis.location?.pathname ?? "/",
  search: initialSearch = globalThis.location?.search ?? "",
  pacing = DEFAULT_PACING,
  loadMap = loadMapLibre,
}: AppProps) {
  const [openedAt] = useState(now);
  const { loaded: daily, failed } = useLoaded(
    useCallback(() => loadDailyTrip(source, openedAt), [source, openedAt]),
  );
  // A free-play trip's time is read from `now` as it runs, not frozen at opening like the day.
  const [clock] = useState(() => () => now().getTime());
  const [progressStorage] = useState(() => storage ?? browserStorage());
  const [statsOpen, setStatsOpen] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [path, setPath] = useState(initialPath);
  const [search, setSearch] = useState(initialSearch);
  // Each visit to free play, even from free play itself, starts it afresh on the setup screen.
  const [visit, setVisit] = useState(0);
  // Whether this visit came by a link within the app, rather than loading the page or Back.
  const [openedInApp, setOpenedInApp] = useState(false);
  const freePlay = isPagePath(path, FREE_PLAY_PATH);
  const itinerary = isPagePath(path, ITINERARY_PATH);
  // Without today's trip (still loading, or no trip today) there is no streak to keep alive.
  const today = daily?.kind === "trip" ? daily.trip.number : Number.POSITIVE_INFINITY;

  useEffect(() => {
    const onPopState = () => {
      setPath(window.location.pathname);
      setSearch(window.location.search);
      setVisit((count) => count + 1);
      setOpenedInApp(false);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    document.title = freePlay ? "Åkle – Fri resa" : itinerary ? "Åkle – Resplan" : "Åkle";
  }, [freePlay, itinerary]);

  const navigate = useCallback((to: string) => {
    window.history.pushState(null, "", to);
    const { pathname, search: query } = window.location;
    setPath(pathname);
    setSearch(query);
    setVisit((count) => count + 1);
    setOpenedInApp(true);
    // Like a page load, the new page opens at its top.
    if (window.scrollY > 0) window.scrollTo(0, 0);
  }, []);

  // A trip picked on the setup screen gets its own entry, so Back returns to `/fri`; a trip
  // opened from its link keeps its entry, tidied to just the link.
  const showTripLink = useCallback((link: string, replace = false) => {
    const { pathname, search: current } = window.location;
    if (pathname + current === link) return;
    if (replace || new URLSearchParams(current).has("r")) {
      window.history.replaceState(null, "", link);
    } else {
      window.history.pushState(null, "", link);
    }
  }, []);

  return (
    <PacingContext value={pacing}>
      <MapLibreLoaderContext value={loadMap}>
        <NavigateContext value={navigate}>
          <main>
            <header className="site-header">
              {/* In the order they appear, left to right, so Tab follows what the eye sees. */}
              <button
                type="button"
                className="header-button rules-open"
                aria-label="Så spelar du"
                title="Så spelar du"
                onClick={() => setRulesOpen(true)}
              >
                <RulesIcon />
              </button>
              {freePlay || itinerary ? (
                <h1>
                  <AppLink href="/">Åkle</AppLink>
                </h1>
              ) : (
                <h1>Åkle</h1>
              )}
              <AppLink
                href={ITINERARY_PATH}
                className="header-button itinerary-open"
                aria-label="Resplan"
                title="Resplan"
                aria-current={itinerary ? "page" : undefined}
              >
                {/* A placeholder icon until itineraries get their own. */}
                <span aria-hidden="true">🗺</span>
              </AppLink>
              <AppLink
                href={FREE_PLAY_PATH}
                className="header-button free-play-open"
                aria-label="Fri resa"
                title="Fri resa"
                aria-current={freePlay ? "page" : undefined}
              >
                {/* A placeholder icon until free play gets its own. */}
                <span aria-hidden="true">🎲</span>
              </AppLink>
              <button
                type="button"
                className="header-button stats-open"
                aria-label="Visa statistik"
                title="Visa statistik"
                onClick={() => setStatsOpen(true)}
              >
                <StatsIcon />
              </button>
            </header>
            {rulesOpen && <RulesDialog onClose={() => setRulesOpen(false)} />}
            {statsOpen && (
              <StatsDialog
                stats={deriveStats(readHistory(progressStorage), today)}
                onClose={() => setStatsOpen(false)}
              />
            )}
            {freePlay ? (
              <FreePlayView
                key={visit}
                source={source}
                now={openedAt}
                linkPayload={new URLSearchParams(search).get("r") ?? undefined}
                onShowTripLink={showTripLink}
                openedInApp={openedInApp}
                storage={progressStorage}
                sessionStorage={sessionStorage}
                clock={clock}
              />
            ) : itinerary ? (
              <ItineraryView
                key={visit}
                source={source}
                now={openedAt}
                linkPayload={new URLSearchParams(search).get("r") ?? undefined}
                title={new URLSearchParams(search).get("namn") ?? undefined}
                onPlay={navigate}
                openedInApp={openedInApp}
                storage={progressStorage}
                sessionStorage={sessionStorage}
                clock={clock}
              />
            ) : failed ? (
              <p role="alert">Kunde inte ladda dagens resa. Försök igen senare.</p>
            ) : (
              <DailyTripView
                daily={daily}
                storage={progressStorage}
                sessionStorage={sessionStorage}
                now={openedAt}
              />
            )}
          </main>
        </NavigateContext>
      </MapLibreLoaderContext>
    </PacingContext>
  );
}
