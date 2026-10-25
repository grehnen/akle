import { useState } from "react";

/**
 * A polite announcement for a live region. The same words twice in a row differ by a trailing
 * no-break space, so screen readers read them again.
 */
export function useAnnouncer(): { announcement: string; announce: (text: string) => void } {
  const [announcement, setAnnouncement] = useState("");
  const announce = (text: string) =>
    setAnnouncement((previous) => (previous === text ? `${text} ` : text));
  return { announcement, announce };
}
