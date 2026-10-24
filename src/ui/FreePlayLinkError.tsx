import "./FreePlayScreen.css";

/**
 * The free-play error screen for a link that can't be played (ADR 0007): it names the trip when
 * one could be decoded, and leads to today's trip or to free play, never to another trip.
 */
export function FreePlayLinkError({ trip }: { trip?: { start: string; destination: string } }) {
  return (
    <section className="free-play-error" aria-labelledby="free-play-error-heading">
      <h2 id="free-play-error-heading">Länken fungerar inte</h2>
      <p>
        {trip === undefined
          ? "Länken till den fria resan är trasig eller ogiltig."
          : `Resan från ${trip.start} till ${trip.destination} i länken kan inte spelas.`}
      </p>
      <nav className="free-play-error-actions" aria-label="Vidare">
        <a href="/">Dagens resa</a>
        <a href="/fri">Fri resa</a>
      </nav>
    </section>
  );
}
