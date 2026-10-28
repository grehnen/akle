const NEW_ISSUE_URL = "https://github.com/grehnen/akle/issues/new";

type ReportContext = {
  tripNumber: number;
  graphVersion: string;
};

/** A prefilled GitHub issue for reporting wrong neighbors or names in a trip. */
export function reportIssueUrl({ tripNumber, graphVersion }: ReportContext): string {
  const body = [
    `Resa: #${tripNumber}`,
    `Grafversion: ${graphVersion}`,
    "",
    "Vad är fel? (t.ex. kommuner som borde eller inte borde vara grannar, eller ett namn som stavas fel)",
    "",
  ].join("\n");
  const params = new URLSearchParams({ title: `Fel i resa #${tripNumber}`, body });
  return `${NEW_ISSUE_URL}?${params}`;
}
