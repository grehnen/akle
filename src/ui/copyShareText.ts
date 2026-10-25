/** The slice of the Clipboard API the share button needs. */
export type ShareClipboard = Pick<Clipboard, "writeText">;

/** The toast for a copy that worked. */
export const COPIED = "Kopierat!";

/** Copies the share text and returns the toast to show. There is no Web Share API on purpose. */
export async function copyShareText(
  clipboard: ShareClipboard | undefined,
  text: string,
): Promise<string> {
  try {
    if (clipboard === undefined) throw new Error("No clipboard");
    await clipboard.writeText(text);
    return COPIED;
  } catch {
    return "Kunde inte kopiera";
  }
}
