# One saved game per free-play link, capped, with no auto-resume

Free play used to keep one trip slot and one itinerary slot ([#69](https://github.com/grehnen/akle/issues/69)). That meant opening another trip link, or starting another itinerary, silently wiped the game already there. A won trip's link then reopened as a fresh game, and an itinerary could be replayed from scratch. Now the device keeps **one saved game per link**: a free-play trip is keyed by its version, endpoints, mode and thinking time, and an itinerary by its version, title and trips in order. Opening any link that has a save resumes it, or reopens its result or summary if it's finished. Trips and itineraries stay separate, and an itinerary's trips are never trip saves. We chose this so that opening another link never loses progress, and so that an itinerary really is played once ([#90](https://github.com/grehnen/akle/issues/90)).

- **Capped**: the device keeps the 100 most recently played trips and the 50 most recently played itineraries, finished or not. Past the cap, the least recently played save is dropped. Opening a save counts as playing it. The cap keeps free play from filling the storage quota that daily progress needs. So "a finished link always reopens" holds until the save becomes one of the oldest.
- **When a save is written** is the same as before. A trip gets its save when it starts (at `Starta` for a trip on the clock), and an itinerary at `Starta resplanen`. Opening a link without starting writes nothing.
- **A setup start is a new game.** A trip picked or drawn in `/fri` setup, or drawn by Slumpa ny resa, replaces the save of the same link when it starts. Only opening a link resumes. That's the one way to replay a trip. An itinerary has no setup path, so it can be replayed only once its save has been dropped past the cap.
- **No auto-resume.** `/fri` without a link always opens setup. If the most recently played trip is unfinished, setup shows a single entry leading back to it. The builder likewise shows one banner for the most recently played itinerary if it's unfinished. This reverses #69's "`/fri` resumes an unfinished trip straight onto its play screen". The daily trip opens straight on its board because there's only one per day, while free play has many saves and nothing marks one of them as _the_ trip. Landing straight on a resumed timed or tie-breaker trip would also run its clock before the player chose to come back.
- **No records.** Saves exist only to resume or reopen a link. Free play still shows no list of played trips, no best score per link and no stats, so #69 still holds there.

## Considered Options

- **Keep one slot per kind** (#69): simple, but another link or itinerary silently wipes a game.
- **No cap, drop only when storage is full**: closer to "always", but free play could crowd out daily progress first.
- **Resume the latest unfinished trip straight from `/fri`** (#74): mirrors the daily trip, but it picks one of many saves without asking and starts its clock on arrival.
- **List every unfinished save in setup and the builder**: a record list, against free play keeping no records.
