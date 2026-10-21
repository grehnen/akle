import { useEffect, useState } from "react";
import { type DailyPuzzle, type DailyPuzzleSource, loadDailyPuzzle } from "./daily/loadDailyPuzzle";
import { browserStorage, type KeyValueStorage } from "./progress/storage";
import { DailyPuzzleView } from "./ui/DailyPuzzleView";

type AppProps = {
  source: DailyPuzzleSource;
  now?: () => Date;
  /** Where progress and history are kept; localStorage by default. */
  storage?: KeyValueStorage;
};

export function App({ source, now = () => new Date(), storage }: AppProps) {
  const [daily, setDaily] = useState<DailyPuzzle>();
  const [failed, setFailed] = useState(false);
  const [openedAt] = useState(now);
  const [progressStorage] = useState(() => storage ?? browserStorage());

  useEffect(() => {
    let cancelled = false;
    loadDailyPuzzle(source, openedAt)
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
      <h1>Åkle</h1>
      {failed ? (
        <p role="alert">Kunde inte ladda dagens pussel. Försök igen senare.</p>
      ) : (
        <DailyPuzzleView daily={daily} storage={progressStorage} now={openedAt} />
      )}
    </main>
  );
}
