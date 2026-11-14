import {
  type ItinerarySummary,
  type ItinerarySummaryRow,
  LOST_TIE_BREAKER_TIME,
} from "../freePlay/itinerarySummary";
import { ITINERARY_PATH } from "../freePlay/itineraryLink";
import { itineraryShareText } from "../freePlay/shareText";
import { FREE_PLAY_PATH } from "../freePlay/tripLink";
import { AppLink } from "./AppLink";
import { ButtonGroup } from "./ButtonGroup";
import {
  LOST_TIE_BREAKER_TIME_EXPLANATION,
  modeName,
  scoreText,
  timeText,
  tripsWonText,
} from "./messages";
import { ScoreLabel } from "./ScoreLabel";
import { ScoreTooltip } from "./ScoreTooltip";
import { ShareButton } from "./ShareButton";
import { Tooltip } from "./Tooltip";
import "./ItinerarySummary.css";

/**
 * A finished itinerary's summary: its title, how many trips were won, a row per trip (its ends,
 * mode, outcome label as the share text words it, a tie-breaker trip's time and its score), and
 * the list's footer with the total score in its score column, and under it the total time when
 * there is a tie-breaker trip. A lost tie-breaker trip shows the time it counts as, explained.
 * Then share, the primary, over a Vidare group: the builder, today's trip and free play.
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
  const { rows, standing } = summary;
  const hasTieBreakerTrip = rows.some((row) => row.mode.kind === "tie-breaker");
  return (
    <section className="itinerary-summary" aria-labelledby="itinerary-summary-heading">
      <h2 id="itinerary-summary-heading">{title ?? "Resplan"}</h2>
      <p className="itinerary-summary-subtitle">Sammanfattning</p>
      <p className="itinerary-summary-headline">{tripsWonText(standing.tripsWon, rows.length)}</p>
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
        {hasTieBreakerTrip && (
          <div className="itinerary-summary-totals-row">
            <dt>Total tid</dt>
            <dd className="itinerary-summary-total">{timeText(standing.tieBreakerTime)}</dd>
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
        {row.time === undefined && row.mode.kind === "tie-breaker" && (
          <span className="itinerary-summary-time">
            <Tooltip text={LOST_TIE_BREAKER_TIME_EXPLANATION}>
              {timeText(LOST_TIE_BREAKER_TIME)}
            </Tooltip>
          </span>
        )}
      </p>
      <p className="itinerary-summary-score">
        <ScoreTooltip>{scoreText(row.score)}</ScoreTooltip>
      </p>
    </li>
  );
}
