# Free-play links pin their graph version

A free-play trip has no trip number, so [ADR 0004](./0004-versioned-graphs-keyed-by-trip-number.md) can't pick its graph version. A newly picked or drawn free-play trip is played on the **current version**, the one that applies to today's trip number, never on a newer version that starts at a future trip number. Every link the app makes, for one trip or an itinerary, pins the version it was made on and names kommuner by SCB code, and it plays on that version for good. We chose pinning so that kommun merges, splits and renames can never break a link or quietly change a trip's distance or guess limit. Everyone opening the same link gets the same trip, which is what lets players compare results through share text.

- Free play only ever uses versions a daily trip has already used, so ADR 0004's rule that such a version is never edited also protects every link.
- An itinerary pins one version for all its trips.
- A hand-typed link with no version tag plays on the current version.
- A link naming a version the app doesn't have, or a code missing from its pinned version, shows a clear error. The app never falls back to another version.
- A free-play trip or itinerary in progress keeps its version when the current version changes.
- A trip on an older pinned version plays with no notice that the data is old.

## Considered Options

- **Re-resolve every link on the current version:** no old shapes to load, but a link could break or give two players different trips across a version change.
- **Newest version for new trips:** that version may still be edited before its start trip, which would change trips that links had already pinned.
