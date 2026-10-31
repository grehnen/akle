import type { ItinerarySummary, ItinerarySummaryRow } from "../freePlay/itinerarySummary";
import { ITINERARY_PATH } from "../freePlay/itineraryLink";
import { itineraryShareText } from "../freePlay/shareText";
import { FREE_PLAY_PATH } from "../freePlay/tripLink";
import { AppLink } from "./AppLink";
import { ButtonGroup } from "./ButtonGroup";
import { modeName, scoreText, timeText, wonTieBreakersText } from "./messages";
import { ScoreLabel } from "./ScoreLabel";
import { ScoreTooltip } from "./ScoreTooltip";
import { ShareButton } from "./ShareButton";
import { Tooltip } from "./Tooltip";
import "./ItinerarySummary.css";

/**
 * A finished itinerary's summary: its title, a row per trip (its ends, mode, outcome label as the
 * share text words it, a won tie-breaker trip's time and its score), and the list's footer of
 * totals in its score column: the total score, and the total time when it
 * has a tie-breaker trip, with the won count in a tooltip on Total tid. Then share, the primary, over
 * a Vidare group: the builder, today's trip and free play.
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
      <p className="itinerary-summary-subtitle">Sammanfattning</p>
      <ol className="itinerary-summary-trips" aria-label="Resorna">
        {rows.map((row, index) => (
          // oxlint-disable-next-line react/no-array-index-key -- the order is fixed: a trip is its place.
          <SummaryRow key={index} row={row} />
        ))}
      </ol>
      <dl className="itinerary-summary-totals">
        <div className="itinerary-summary-totals-row">
          <dt>Totalt</dt>
          <dd className="itinerary-summary-total">
            <ScoreTooltip>{scoreText(standing.score)}</ScoreTooltip>
          </dd>
        </div>
        {hasTieBreaker && (
          <div className="itinerary-summary-totals-row">
            <dt>
              <Tooltip text={wonTieBreakersText(standing.wonTieBreakers)}>Total tid</Tooltip>
            </dt>
            <dd className="itinerary-summary-total-time">{timeText(standing.totalTime)}</dd>
          </div>
        )}
      </dl>
      <ShareButton text={itineraryShareText({ title, summary, link })} primary />
      <ButtonGroup as="nav" label="Vidare">
        <AppLink href={ITINERARY_PATH}>Bygg en resplan</AppLink>
        <AppLink href="/">Dagens resa</AppLink>
        <AppLink href={FREE_PLAY_PATH}>Fri resa</AppLink>
      </ButtonGroup>
    </section>
  );
}

function SummaryRow({ row }: { row: ItinerarySummaryRow }) {
  return (
    <li className="itinerary-summary-trip" data-mode={row.mode.kind}>
      <p className="itinerary-summary-pair">
        {row.start} → {row.destination}
      </p>
      <p className="itinerary-summary-facts">
        <span className="itinerary-summary-mode">{modeName(row.mode)}</span>
        <span className="itinerary-summary-outcome">
          <ScoreLabel outcome={row.outcome} />
        </span>
        {row.time !== undefined && (
          <span className="itinerary-summary-time">{timeText(row.time)}</span>
        )}
      </p>
      <p className="itinerary-summary-score">
        <ScoreTooltip>{scoreText(row.score)}</ScoreTooltip>
      </p>
    </li>
  );
}
