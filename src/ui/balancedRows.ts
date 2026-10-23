/** Splits items into the fewest rows that fit, with row lengths differing by at most one (longer rows first). */
export function balancedRows(itemCount: number, fitPerRow: number): number[] {
  if (itemCount <= 0) return [];
  const perRow = Math.max(1, Math.floor(fitPerRow));
  const rowCount = Math.ceil(itemCount / perRow);
  const shortLength = Math.floor(itemCount / rowCount);
  const longRows = itemCount % rowCount;
  return Array.from({ length: rowCount }, (_, row) =>
    row < longRows ? shortLength + 1 : shortLength,
  );
}
