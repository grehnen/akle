# How comparable games handle free play, timed modes, shared puzzles and multi-puzzle scoring

Research for issue #51 (map #50). Question: how do Travle, Globle, Worldle, Tradle, GeoGuessr and similar games handle practice or free play, timed variants, custom or shared puzzles via link, and scoring across a sequence of puzzles; is there any scheme that puts time and guess count on one scale; and how do such games stay fair without a backend?

Researched 2026-10-24. Sources are the games' own sites, their served JavaScript and data, official support articles, and published source code. Anything not confirmed from such a source is marked **unverified**.

## Summary

- **Free play is a thin mode on top of the daily game everywhere.** Globle (source), Travle and Worldle all run the same engine with a random or user-picked answer instead of the date-derived one, and practice results do not touch daily stats.
- **Travle is the closest comparable and the only one with configurable free play and shareable custom puzzles.** Its practice mode has route, "extra guesses" (default, none, unlimited), continent limit and avoid-list. But its shared "Challenge friends" links are **backend-stored** (create endpoint, per-challenge leaderboard), so they are not a model for a no-backend link.
- **No researched game mixes time and guess count on one scale.** Travle scores by guesses over the shortest route (Perfect, +1, +2). GeoGuessr and Seterra record time and score separately. A comparable scale, if Åkle wants one, has to be designed rather than copied.
- **Fairness without a backend is done by determinism, not verification.** The daily answer is a pure function of the date (Globle) or a pre-generated schedule; results are honour-system, shared as spoiler-free text or images. Every game with a leaderboard or a "challenge" uses a server.

## Travle (Teuteuf Games)

Sources: the served page and its SvelteKit data and bundles at <https://travle.earth/> (inspected 2026-10-24), App Store listing <https://apps.apple.com/us/app/travle-country-border-puzzle/id6760892359>.

**Modes.** The page menu lists Daily, Weekly Challenge (every Monday, "longer routes for experienced players" per the App Store listing) and "Practice & Challenge". Embedded translation strings describe practice as "Play Unlimited Travle, generate custom routes and more!"

**Practice configuration** (from the `practice` strings in the page data):
- Route: random, or select start and target.
- Game mode: Normal or Hard (hides country names).
- "Extra guesses": **Default**, **None: Shortest route only**, **Unlimited Guesses**. This is the same idea as Åkle's "endless" mode.
- Continent limit, and a "Without going through" avoid-list (App Store: up to 3 forbidden countries, added v1.27). The game warns that practice only generates routes made longer by the avoided regions.
- "Challenge friends" is listed as "Available in Practice".

**Scoring unit is guesses, relative to the optimum.** The help text says a perfect score is the shortest path guessed in order from start to end; "+0" is the shortest route not in order. Results show "N away" and "N guesses", and the distribution chart is by "# Extra Guesses". The App Store changelog shows past-daily results as "Perfect, +1, +2". Hints (max 3 per game) are tracked and shown separately ("without hints" / "with hints"), not folded into a score.

**Per-guess feedback** is a five-level emoji (perfect, nearperf, good, notGreat, poor) based on the shortest-path distance.

**Shared custom puzzles are server-backed.** The bundled client code (`chunks/cULLRDGH.js`) calls a Teuteuf API:
- create a challenge from a config, then `GET /travle/challenge/{id}` ("Challenge not found" if missing);
- `POST /travle/challenge/{id}/leaderboard` with `{anonId, name, emoji, score, guesses}` and a matching `GET` with a `limit`;
- a pseudonymous `anonId` plus a player-chosen display name and emoji identify entries; no account is needed.

So the link carries only an id, the puzzle definition lives on their server, and fairness of the leaderboard rests on the server (and trust in the client-reported `score`). **Unverified:** whether the server validates submitted scores.

Other relevant detail: the Weekly Challenge is a second fixed-schedule puzzle; there is a "Previous Dailys" calendar (v1.28) and a paid archive for replaying old dailies; stats can be moved between devices with a pasted "migration code" (a client-side export, i.e. a no-backend pattern for state transfer).

## Globle

Sources: source code at <https://github.com/the-abe-train/globle> (`src/util/answer.ts`, `src/pages/Game.tsx`, master branch, inspected 2026-10-24).

- **Daily answer is a pure function of the date**: the country list is sorted deterministically, the UTC day number is divided by a shuffle key and taken modulo the list length. Every client computes the same answer with no server.
- **Practice mode** is `?practice_mode=true`. Entering it picks `Math.random()` over the country list, stores the answer in `localStorage`, and skips all daily-guess and stats persistence (`!practiceMode` guards around storing guesses and updating stats). It is explicitly a separate, non-scoring state.
- Stats and guesses live in `localStorage`; there is no leaderboard.
- Note the side effect: because the answer is a public function of the date, anyone reading the code can compute future answers. Globle accepts this.

## Worldle (Teuteuf Games)

Source: <https://worldle.teuteuf.fr> (fetched 2026-10-24; page text is limited).

- Daily answer is chosen "at random" with published constraints: no repeat within 100 days, small countries (under 5,000 km²) not within 7 days, no same-continent consecutive days for some continents. New puzzle at local midnight, so the day boundary is per device time zone. (Åkle's cooldown in the glossary is the same idea.)
- Share is a spoiler-free emoji grid with proximity rounded to the nearest 10%.
- A `/practice` route exists, but the fetched description reads as a separate learning mode (matching countries with maps, flags, languages; XP) rather than unlimited Worldle rounds. **Treat as unclear.** No custom or shared-link puzzle was found.

## Tradle (OEC)

Source: <https://games.oec.world/en/tradle/> (page fetched; no FAQ or rules text was retrievable). Secondary press only reports one country per day, six guesses, and distance and direction feedback. No practice, timed or shared-puzzle feature was found. **Unverified beyond that.**

## GeoGuessr and Seterra

Sources: GeoGuessr support articles <https://www.geoguessr.support/support/solutions/articles/206000056710-what-is-the-daily-challenge-> and <https://www.geoguessr.support/support/solutions/articles/206000056676-how-do-i-create-a-custom-quiz->; <https://www.geoguessr.com/organizations>; <https://www.geoguessr.com/free>.

- **Daily Challenge:** five locations, **3 minutes per round**, one shared puzzle per day. The article does not state scoring, ties or the leaderboard rule.
- **Challenge links** ("Challenge a friend") let everyone play the same fixed set of locations at any time and compare on a leaderboard afterwards; the organizations page says it is a Pro feature for the creator with free joining for recipients. Free tier has the Daily Challenge and Duels.
- **Seterra custom challenges** (Pro to create): the creator sets title and description and chooses a public leaderboard or anonymized nicknames; the creator can delete scores from the leaderboard. The leaderboard lists nickname, score and time as separate columns. The support article does not say how entries are ranked.
- All of this is server-side: challenge storage, leaderboards, and moderation (score deletion by the creator) all assume a backend.
- GeoGuessr's per-round point formula and the ranking rule were **not found in a primary source**; third-party pages disagree on constants. Do not rely on a remembered formula.

## Time and guess count on one scale

Not found in any primary source researched. What the games do:

| Game | Guess-quality metric | Time | Combined? |
| --- | --- | --- | --- |
| Travle | guesses over shortest route (Perfect, +1, +2); hints counted separately | not used | no |
| Globle, Worldle, Tradle | guesses (max 6 for Worldle and Tradle) | not used | no |
| GeoGuessr Daily | points per round | hard 3 min cap per round | no formula documented |
| Seterra challenge | score | shown as separate column | ranking rule undocumented |

A small third-party project, <https://github.com/t4ll4t/puzzle-gauntlet>, speedruns six daily-style puzzles on one clock with the date as the seed and "records saved in your browser only"; its README documents no combined score formula. It is the closest example of a no-backend multi-puzzle run, but it is a hobby project and says nothing about verification.

## Fairness without a backend: what is actually done

- **Deterministic seed from the date** (Globle code) or a pre-generated schedule (Åkle's ADR 0001). Same input, same puzzle, no server.
- **Local persistence only** for stats and in-progress games (Globle `localStorage`; Travle transfer codes; puzzle-gauntlet "browser only").
- **Honour-system sharing**: spoiler-free emoji or text summaries (Worldle grid, Travle result text and share image). Nothing is verified; a player can fabricate a result.
- **Server for anything competitive**: Travle challenge leaderboards, GeoGuessr and Seterra leaderboards all use a backend with an anonymous or account identity. None of the games researched ships a link-encoded puzzle with a verified score.
- No game researched used signed or checksummed score payloads. **Unverified/not found**, so no precedent to cite for tamper-resistance without a server; any such scheme in Åkle would be original design (and client-side code can always be bypassed).

## Takeaways for Åkle (design inputs, not decisions)

- Endless free play is cheap and proven: Travle's "Unlimited Guesses" and Globle's separate practice state show the pattern. Keep practice results out of daily stats (Globle guards on a practice flag).
- A link-encoded playlist has no direct precedent among these games; Travle's equivalent is server-stored. Encoding the full playlist (puzzle ids or seeds, modes, parameters) in the URL is feasible because the schedule and neighbor graph are static and versioned (ADR 0004), but any resulting comparison is honour-system.
- Time and guesses on one scale is original design. Travle's "extra guesses over optimum" is a natural guess-side unit (an integer relative to the shortest route) that a time term could be converted into, e.g. seconds per penalty point, but that conversion is not borrowed from any source here.
- Keeping hints out of the headline score and displaying them separately (Travle) is a precedent if Åkle adds assistance.
