const NEW_ISSUE_URL = "https://github.com/grehnen/akle/issues/new";

type ReportContext = {
  puzzleNumber: number;
  graphVersion: string;
};

/** A prefilled GitHub issue for reporting wrong neighbors or names in a puzzle. */
export function reportIssueUrl({ puzzleNumber, graphVersion }: ReportContext): string {
  const body = [
    `Pussel: #${puzzleNumber}`,
    `Grafversion: ${graphVersion}`,
    "",
    "Vad är fel? (t.ex. kommuner som borde eller inte borde vara grannar, eller ett namn som stavas fel)",
    "",
  ].join("\n");
  const params = new URLSearchParams({ title: `Fel i pussel #${puzzleNumber}`, body });
  return `${NEW_ISSUE_URL}?${params}`;
}
