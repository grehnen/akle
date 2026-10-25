/**
 * The Gissa button's label with its counter. During a trip it counts the guess about to be made,
 * `Gissa (1/7)` read out as `Gissa (gissning 1 av 7)`; once the trip is over, the guesses made,
 * `Gissa (4/7)` read out as `Gissa (4 av 7 använda)`.
 */
export function GuessCounter({
  label,
  made,
  limit,
  over,
}: {
  label: string;
  made: number;
  limit: number;
  over: boolean;
}) {
  const shown = over ? made : made + 1;
  return (
    <>
      {label}{" "}
      <span aria-hidden="true">
        ({shown}/{limit})
      </span>
      <span className="visually-hidden">
        {over ? `(${shown} av ${limit} använda)` : `(gissning ${shown} av ${limit})`}
      </span>
    </>
  );
}
