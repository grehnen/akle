/** A button label with its counter, `Gissa (1/7)`, read out as `Gissa (1 av 7 använda)`. */
export function UsedCounter({
  label,
  used,
  limit,
}: {
  label: string;
  used: number;
  limit: number;
}) {
  return (
    <>
      {label}{" "}
      <span aria-hidden="true">
        ({used}/{limit})
      </span>
      <span className="visually-hidden">
        ({used} av {limit} använda)
      </span>
    </>
  );
}
