import type { ItinerarySummary, ItinerarySummaryRow } from "../freePlay/itinerarySummary";
import { ITINERARY_PATH } from "../freePlay/itineraryLink";
import { itineraryShareText } from "../freePlay/shareText";
import { FREE_PLAY_PATH } from "../freePlay/tripLink";
import {
  hintCount,
  modeName,
  scoreText,
  summaryOutcomeText,
  timeoutsText,
  timeText,
  totalTimeText,
} from "./messages";
import { ShareButton } from "./ShareButton";
import "./ItinerarySummary.css";

/**
 * A finished itinerary's summary: its title, a row per trip (its ends, mode, outcome, hints,
 * a timed trip's timeouts, a won tie-breaker trip's time and its score), the total score with
 * the total time when it has a tie-breaker trip, then share, the builder, today's trip and free play.
 */
export function ItinerarySummaryView({
  title,
  summary,
  link,
}: {
  title?: string;
  summary: ItinerarySummary;
  /** The itinerary's link, shared with the summary: `/resplan?namn=…&r=…`. */
  link: string;
}) {
  const { rows, standing, hasTieBreaker } = summary;
  return (
    <section className="itinerary-summary" aria-labelledby="itinerary-summary-heading">
      <h2 id="itinerary-summary-heading">{title ?? "Resplan"}</h2>
      <p className="itinerary-summary-count">Klar · {rows.length} resor</p>
      <ol className="itinerary-summary-trips" aria-label="Resorna">
        {rows.map((row, index) => (
          // oxlint-disable-next-line react/no-array-index-key -- the order is fixed: a trip is its place.
          <SummaryRow key={index} row={row} />
        ))}
      </ol>
      <p className="itinerary-summary-total">Totalt {scoreText(standing.score)}</p>
      {hasTieBreaker && (
        <p className="itinerary-summary-total-time">
          Total tid {totalTimeText(standing.totalTime, standing.wonTieBreakers)}
        </p>
      )}
      <ShareButton text={itineraryShareText({ title, summary, link })} />
      <nav className="itinerary-summary-actions" aria-label="Vidare">
        <a className="primary-link" href={ITINERARY_PATH}>
          Bygg en resplan
        </a>
        <a href="/">Dagens resa</a>
        <a href={FREE_PLAY_PATH}>Fri resa</a>
      </nav>
    </section>
  );
}

function SummaryRow({ row }: { row: ItinerarySummaryRow }) {
  return (
    <li className="itinerary-summary-trip">
      <p className="itinerary-summary-pair">
        {row.start} → {row.destination}
      </p>
      <p className="itinerary-summary-facts">
        <span className="itinerary-summary-mode">{modeName(row.mode)}</span>
        <span className="itinerary-summary-outcome">{summaryOutcomeText(row.outcome)}</span>
        <span className="itinerary-summary-hints">{hintCount(row.hintsUsed)}</span>
        {row.mode.kind === "timed" && (
          <span className="itinerary-summary-timeouts">
            <span aria-hidden="true">{row.timeouts} ⏱</span>
            <span className="visually-hidden">{timeoutsText(row.timeouts)}</span>
          </span>
        )}
        {row.time !== undefined && (
          <span className="itinerary-summary-time">{timeText(row.time)}</span>
        )}
      </p>
      <p className="itinerary-summary-score">{scoreText(row.score)}</p>
    </li>
  );
}
