/**
 * A button label with its counter, `Gissa (1/7)`, read out as `Gissa (1 av 7 använda)`; with no
 * limit, `Gissa (1)`, read out as `Gissa (1 använda)`.
 */
export function UsedCounter({
  label,
  used,
  limit,
}: {
  label: string;
  used: number;
  limit?: number;
}) {
  return (
    <>
      {label} <span aria-hidden="true">({limit === undefined ? used : `${used}/${limit}`})</span>
      <span className="visually-hidden">
        ({limit === undefined ? used : `${used} av ${limit}`} använda)
      </span>
    </>
  );
}
