import { useEffect, useState } from "react";
import { type DailyTripLoad, type DailyTripSource, loadDailyTrip } from "./daily/loadDailyTrip";
import { readHistory } from "./progress/history";
import { deriveStats } from "./progress/stats";
import { browserStorage, type KeyValueStorage } from "./progress/storage";
import { DailyTripView } from "./ui/DailyTripView";
import { RulesDialog, RulesIcon } from "./ui/RulesDialog";
import { StatsDialog, StatsIcon } from "./ui/StatsDialog";

type AppProps = {
  source: DailyTripSource;
  now?: () => Date;
  /** Where progress and history are kept; localStorage by default. */
  storage?: KeyValueStorage;
};

export function App({ source, now = () => new Date(), storage }: AppProps) {
  const [daily, setDaily] = useState<DailyTripLoad>();
  const [failed, setFailed] = useState(false);
  const [openedAt] = useState(now);
  const [progressStorage] = useState(() => storage ?? browserStorage());
  const [statsOpen, setStatsOpen] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
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
        <h1>Åkle</h1>
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
      {failed ? (
        <p role="alert">Kunde inte ladda dagens resa. Försök igen senare.</p>
      ) : (
        <DailyTripView daily={daily} storage={progressStorage} now={openedAt} />
      )}
    </main>
  );
}
