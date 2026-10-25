import { ITINERARY_PATH } from "../freePlay/itineraryLink";
import { FREE_PLAY_PATH } from "../freePlay/tripLink";
import { AppLink } from "./AppLink";
import "./FreePlayScreen.css";

/**
 * The free-play error screen for a link that can't be played (ADR 0007): it names the trip when
 * one could be decoded, and leads first to where another can be made, free play's setup for a
 * trip or the builder for an itinerary, then to today's trip; never to another trip.
 */
export function FreePlayLinkError({
  trip,
  itinerary = false,
}: {
  trip?: { start: string; destination: string };
  /** Whether the link is an itinerary's rather than one trip's. */
  itinerary?: boolean;
}) {
  return (
    <section className="free-play-error" aria-labelledby="free-play-error-heading">
      <h2 id="free-play-error-heading">Länken fungerar inte</h2>
      <p>
        {trip === undefined
          ? `Länken till ${itinerary ? "resplanen" : "den fria resan"} är trasig eller ogiltig.`
          : `Resan från ${trip.start} till ${trip.destination} i länken kan inte spelas.`}
      </p>
      <nav className="free-play-error-actions" aria-label="Vidare">
        {itinerary ? (
          <>
            <AppLink className="primary-link" href={ITINERARY_PATH}>
              Bygg en resplan
            </AppLink>
            <AppLink href="/">Dagens resa</AppLink>
            <AppLink href={FREE_PLAY_PATH}>Fri resa</AppLink>
          </>
        ) : (
          <>
            <AppLink className="primary-link" href={FREE_PLAY_PATH}>
              Fri resa
            </AppLink>
            <AppLink href="/">Dagens resa</AppLink>
          </>
        )}
      </nav>
    </section>
  );
}
