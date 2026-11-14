const NEW_ISSUE_URL = "https://github.com/grehnen/akle/issues/new";

type ReportContext = {
  /** The daily trip's number; a free-play or itinerary trip has none and gets a generic issue. */
  tripNumber?: number;
  graphVersion: string;
};

/** A prefilled GitHub issue for reporting wrong neighbors or names. */
export function reportIssueUrl({ tripNumber, graphVersion }: ReportContext): string {
  const body = [
    ...(tripNumber === undefined ? [] : [`Resa: #${tripNumber}`]),
    `Grafversion: ${graphVersion}`,
    "",
    "Vad är fel? (t.ex. kommuner som borde eller inte borde vara grannar, eller ett namn som stavas fel)",
    "",
  ].join("\n");
  const title = tripNumber === undefined ? "Fel i Akle" : `Fel i resa #${tripNumber}`;
  const params = new URLSearchParams({ title, body });
  return `${NEW_ISSUE_URL}?${params}`;
}
