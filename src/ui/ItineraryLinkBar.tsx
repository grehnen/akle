import { useState } from "react";
import { ITINERARY_TRIPS } from "../freePlay/itineraryLink";
import { SITE_URL } from "../siteUrl";
import { CopyLinkButton } from "./CopyLinkButton";
import { UndoToast } from "./UndoToast";

/**
 * The sticky bar: how many trips, and Kopiera länk and Starta resplanen once the itinerary has two. Above it
 * float, without moving it, the latest removal's Ångra, the link to copy by hand when copying
 * failed, and the copy toast.
 */
export function LinkBar({
  count,
  link,
  onPlay,
  undo,
}: {
  count: number;
  link?: string;
  onPlay: (link: string) => void;
  undo?: {
    number: number;
    onUndo: () => void;
    onHold: (held: boolean) => void;
  };
}) {
  const [overlays, setOverlays] = useState<HTMLDivElement | null>(null);
  return (
    <div className="itinerary-bar">
      <div className="itinerary-bar-content">
        <div className="itinerary-bar-overlays" ref={setOverlays}>
          {undo && <UndoToast {...undo} />}
        </div>
        <p className="itinerary-count" tabIndex={-1}>
          {count} av {ITINERARY_TRIPS.max} resor
          {count < ITINERARY_TRIPS.min && (
            <span className="itinerary-count-minimum"> · minst {ITINERARY_TRIPS.min}</span>
          )}
        </p>
        <CopyLinkButton
          url={link === undefined ? undefined : `${SITE_URL}${link}`}
          fallbackTarget={overlays}
        />
        <button
          type="button"
          className="itinerary-play"
          disabled={link === undefined}
          onClick={() => link !== undefined && onPlay(link)}
        >
          Starta resplanen
        </button>
      </div>
    </div>
  );
}
