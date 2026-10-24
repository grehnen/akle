import { type MouseEvent, type ReactNode, useCallback, useEffect, useState } from "react";
import { type DailyTripLoad, type DailyTripSource, loadDailyTrip } from "./daily/loadDailyTrip";
import { readHistory } from "./progress/history";
import { deriveStats } from "./progress/stats";
import { browserStorage, type KeyValueStorage } from "./progress/storage";
import { FREE_PLAY_PATH } from "./freePlay/tripLink";
import { DailyTripView } from "./ui/DailyTripView";
import { FreePlayView } from "./ui/FreePlayView";
import { RulesDialog, RulesIcon } from "./ui/RulesDialog";
import { StatsDialog, StatsIcon } from "./ui/StatsDialog";

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
};

/** Whether a path is the free-play page, however the server or the dev server spells it. */
function isFreePlayPath(path: string): boolean {
  return [FREE_PLAY_PATH, `${FREE_PLAY_PATH}/`, `${FREE_PLAY_PATH}.html`].includes(path);
}

export function App({
  source,
  now = () => new Date(),
  storage,
  sessionStorage,
  path: initialPath = globalThis.location?.pathname ?? "/",
  search: initialSearch = globalThis.location?.search ?? "",
}: AppProps) {
  const [daily, setDaily] = useState<DailyTripLoad>();
  const [failed, setFailed] = useState(false);
  const [openedAt] = useState(now);
  const [progressStorage] = useState(() => storage ?? browserStorage());
  const [statsOpen, setStatsOpen] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [path, setPath] = useState(initialPath);
  const [search, setSearch] = useState(initialSearch);
  // Each visit to free play, even from free play itself, starts it afresh on the setup screen.
  const [visit, setVisit] = useState(0);
  const freePlay = isFreePlayPath(path);
  // Without today's trip (still loading, or no trip today) there is no streak to keep alive.
  const today = daily?.kind === "trip" ? daily.trip.number : Number.POSITIVE_INFINITY;

  useEffect(() => {
    let cancelled = false;
    loadDailyTrip(source, openedAt)
      .then((loaded) => !cancelled && setDaily(loaded))
      .catch((error: unknown) => {
        console.error(error);
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [source, openedAt]);

  useEffect(() => {
    const onPopState = () => {
      setPath(window.location.pathname);
      setSearch(window.location.search);
      setVisit((count) => count + 1);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    document.title = freePlay ? "Åkle – Fri resa" : "Åkle";
  }, [freePlay]);

  const navigate = (to: string) => {
    window.history.pushState(null, "", to);
    setPath(to);
    setSearch("");
    setVisit((count) => count + 1);
  };

  // A trip picked on the setup screen gets its own entry, so Back returns to `/fri`; a trip
  // opened from its link or resumed on `/fri` keeps its entry, tidied to just the link.
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
    <main>
      <header className="site-header">
        <button
          type="button"
          className="header-button rules-open"
          aria-label="Så spelar du"
          onClick={() => setRulesOpen(true)}
        >
          <RulesIcon />
        </button>
        {freePlay ? (
          <h1>
            <AppLink href="/" onNavigate={navigate}>
              Åkle
            </AppLink>
          </h1>
        ) : (
          <h1>Åkle</h1>
        )}
        <AppLink
          href={FREE_PLAY_PATH}
          className="header-button free-play-open"
          aria-label="Fri resa"
          onNavigate={navigate}
        >
          {/* A placeholder icon until free play gets its own. */}
          <span aria-hidden="true">🎲</span>
        </AppLink>
        <button
          type="button"
          className="header-button stats-open"
          aria-label="Visa statistik"
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
          storage={progressStorage}
          sessionStorage={sessionStorage}
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
  );
}

/**
 * A link to another page of the app that stays in the app, through the History API, so Back
 * returns. A click that asks for a new tab or window is left to the browser.
 */
function AppLink({
  href,
  onNavigate,
  children,
  ...attributes
}: {
  href: string;
  onNavigate: (to: string) => void;
  children: ReactNode;
  className?: string;
  "aria-label"?: string;
}) {
  const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }
    event.preventDefault();
    onNavigate(href);
  };
  return (
    <a href={href} onClick={onClick} {...attributes}>
      {children}
    </a>
  );
}
