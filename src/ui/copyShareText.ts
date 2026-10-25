/** The slice of the Clipboard API the share button needs. */
export type ShareClipboard = Pick<Clipboard, "writeText">;

/** Whether a copy worked, with the toast that says so. */
export type CopyResult = { copied: boolean; message: string };

/** Copies the share text and says how it went. There is no Web Share API on purpose. */
export async function copyShareText(
  clipboard: ShareClipboard | undefined,
  text: string,
): Promise<CopyResult> {
  try {
    if (clipboard === undefined) throw new Error("No clipboard");
    await clipboard.writeText(text);
    return { copied: true, message: "Kopierat!" };
  } catch {
    return { copied: false, message: "Kunde inte kopiera" };
  }
}
