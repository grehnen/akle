# Marking a copied builder link as stale

The itinerary builder doesn't track whether the link it last copied still matches the itinerary. It never shows "ändrad sedan kopiering" or anything like it after an edit.

## Why this is out of scope

The builder computes its link live from the title and trips on every render, so **Kopiera länk always copies the current itinerary**. A link copied earlier and pasted somewhere else is a snapshot the builder can't see or change. A stale marker could only say "you copied something before and changed things since". To do that, the builder would have to remember the last copied link across reloads, next to the draft (#91), and decide which edits count. Undoing an edit, for example, would make the old link right again. That's state and wording for a case the player can handle by copying again.

The real gap from the same finding, no fallback when copying fails, is handled: a failed copy shows the link to select by hand (#102).

## Prior requests

- #97: "the copied link … isn't marked stale after edits" (UX exploration, 2026-10-25)
