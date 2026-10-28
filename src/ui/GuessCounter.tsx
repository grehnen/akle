/**
 * The Gissa button's label with its counter. During a trip it counts the guess about to be made,
 * `Gissa (1/7)` read out as `Gissa (gissning 1 av 7)`; once the trip is over, the guesses made,
 * `Gissa (4/7)` read out as `Gissa (4 av 7 använda)`. With no limit, `Gissa (1)` read out as
 * `Gissa (gissning 1)`, and once over, `Gissa (4)` read out as `Gissa (4 använda)`.
 */
export function GuessCounter({
  label,
  made,
  limit,
  over,
}: {
  label: string;
  made: number;
  limit?: number;
  over: boolean;
}) {
  const shown = over ? made : made + 1;
  const outOf = limit === undefined ? "" : ` av ${limit}`;
  return (
    <>
      {label} <span aria-hidden="true">({limit === undefined ? shown : `${shown}/${limit}`})</span>
      <span className="visually-hidden">
        {over ? `(${shown}${outOf} använda)` : `(gissning ${shown}${outOf})`}
      </span>
    </>
  );
}
