# Travle's exact rules

Research for [#2](https://github.com/grehnen/akle/issues/2). Retrieved **2026-10-18** from the live site (daily puzzle #1404, The Gambia → Tunisia).

## Sources

All sources are first-party, served by travle.earth. Bundle file names are content-hashed, so they change with every deploy. Fetch `https://travle.earth/` again to find the current ones.

| Tag | Source | What it contains |
| --- | --- | --- |
| **[EN]** | <https://travle.earth/locales/base/en.json> | All English UI strings: How to Play, scoring legend, alerts, share and result strings |
| **[CORE]** | `https://travle.earth/_app/immutable/chunks/xxUgZ0uJ.js` | Graph and shortest-path code (`dijkstras`, `minimumGuessesToJoin`), `makeGuess`, `possibleGuesses` (guess limit), `shareText`, emoji constants, map visibility, guess input box |
| **[GAME]** | `https://travle.earth/_app/immutable/chunks/CEY4A0uN.js` | Game component: guess handler, game-over summary, hint reveal |
| **[HELP]** | `https://travle.earth/_app/immutable/nodes/0.CHuCmUGY.js` | How to Play modal (the emoji legend it renders) |
| **[STATE]** | `https://travle.earth/_app/immutable/chunks/DwRXeDLz.js` | Save state in localStorage, stats and guess distribution |
| **[MAPS]** | `https://travle.earth/_app/immutable/chunks/DvRqCAgj.js` | Per-map config, including `startDate` (`countries` = 2022-12-15) |
| **[SHARE]** | `https://travle.earth/_app/immutable/chunks/CGGfRrJp.js` | Share URL builder (`https://travle.earth[/map]`) |
| **[PAGE]** | `https://travle.earth/` (SSR HTML) | Server-provided daily route: `route:{start:"GMB",target:"TUN",dist:4}, puzzleIx:1404` |
| **[ADJ]** | <https://travle.earth/data/countries/adjacency.json> | Adjacency graph, built from country *pieces* |

The code is minified. I describe what it does; any inference is marked as one.

## 1. Goal and the graph

- Name countries to travel from the **Start Country** to the **End Country**, in as few guesses as possible [EN `info.txt1`].
- **Neighbors:** "name every country you'd need to pass through on a walk from A to B. **Bridges and tunnels count, exclaves and remote territories don't.**" [EN `info.borders.txt1`]. In the data, Denmark and Sweden are adjacent (Øresund Bridge), and Great Britain is adjacent to metropolitan France (Channel Tunnel) [ADJ].
- The graph is built from **pieces** (landmasses), not whole countries. A country can have several pieces, for example `AZE#2` or `RUS#2`. Paths move from piece to piece. Countries with more than one piece are handled specially, so a path cannot jump between a country's separate pieces [CORE `dijkstras`, ADJ].
- A puzzle can list **avoid countries** ("… without going through X"). These countries are removed from the graph before any distance is computed [GAME, EN `title_avoid1/2`].

### Distance metric (used for everything)

`minimumGuessesToJoin(A, B, known)` runs a 0-1 BFS/Dijkstra over pieces [CORE]:

- Moving into a country in `known` costs **0**. Moving into any other country costs **1**.
- The result is the number of countries on the best A→B path that are **not yet known**.

`known` normally contains the start, the target and every past guess. Let **N** be the number of intermediate countries on the shortest route, counted when nothing has been guessed (that is, path length minus 2). The game calls **N + 1** `shortestSolution` [CORE `shortestSolution`, GAME game-over handler].

## 2. Which guesses are accepted and counted

The input is a text box with fuzzy autocomplete (fuzzysort) over the localized names of **every region on the map**. Pressing Enter needs an exact, case-insensitive name match. Picking a suggestion submits that region [CORE guess input]. Any country can be guessed. It does **not** have to border a previous guess.

`makeGuess` rejects the following guesses. A rejected guess is **not counted**, and the player sees a toast [CORE `makeGuess`, EN `alerts.*`]:

| Case | Alert |
| --- | --- |
| Name not recognized | "Unknown country name: X" |
| Game already over | "Can't guess - game is over!" |
| Already guessed | "Country already guessed: X" |
| Start or end country | "Can't guess start or end countries: X" |
| Avoid country | "Country is one you must avoid: X" |

Every other guess is accepted. It is added to the guess list, it counts toward the limit, and it gets an emoji rating, even when it is far away or on another continent.

## 3. Guess limit

The limit is set from the shortest route [CORE `possibleGuesses`]. With **N** = intermediate countries on the shortest route:

| N | Allowed guesses | Extra guesses |
| --- | --- | --- |
| ≤ 3 | N + 4 | 4 |
| 4–6 | N + 5 | 5 |
| 7–9 | N + 6 | 6 |
| 10–12 | N + 7 | 7 |
| ≥ 13 | N + 8 | 8 |

Examples: N=1→5, 2→6, 3→7, 4→9, 6→11, 7→13, 10→17, 13→21. The button shows `Guess (k/limit)` [EN `guessBar.btn`, GAME].

Practice mode adds two more settings [CORE, EN `practice.numGuesses.*`]:

- **None:** exactly N guesses ("Shortest route only").
- **Unlimited:** no limit. The button shows `?`.

The daily game always uses `extraGuesses: "default"`.

## 4. Feedback per guess (emoji / color)

The emoji is computed when the guess is made. `o` is the distance before the guess and `u` the distance after it, both measured with the start, target and all guesses so far marked as known [CORE `makeGuess`]:

| Emoji | Condition in code | Help text [EN] |
| --- | --- | --- |
| ✅ | `u = o − 1` (the guess lies on a current shortest route) **and** the guess is already connected to the start through known countries | "Guess is **optimal**! You're one step closer." |
| 🟩 | `u = o − 1`, but the guess is **not** connected to the start yet | "Guess is **good**. This guess is on the shortest path, but it's not the next country to go through." |
| 🟧 | Distance unchanged, and the best route forced through the guess (start→guess + guess→target) needs **≤ o + 1** unknown countries | "Guess is **pretty good**. This country is close, but doesn't get you closer." |
| 🟥 | Anything else, including guesses with no path at all (another landmass) | "Guess is **not great**. This country is a significant detour." |

- The How to Play modal shows exactly these four emojis [HELP]. The EN file still has an unused `info.scoring.emojis.poor` string ("different continent or landmass 🤦"), but the code folds that case into 🟥.
- Rating is relative: "Scoring is based on all countries you've already guessed, and whether your last guess gets you closer to a solution" [EN `info.scoring.opening`].
- On the map, guessed countries are drawn in color. **Guesses not connected to the start country are gray** [EN `info.scoring.closing`]. The start and end countries have their own colors.
- A **perfect** flag starts as true. It turns false as soon as any guess is not connected to the start when it is made [CORE `makeGuess`]. A Perfect game therefore means guessing a shortest route **in order** from the start [EN `info.scoring.opening2`, `updates.perfect`].

## 5. Hints

There are up to **3 hints**, revealed one at a time with a button: "Get a hint (n/3)". Hints never cost guesses [EN `hints.*`, GAME hint reveal, CORE `getVisibleCountries`].

1. **Show next country outline.** Reveals the outline of the first still-unknown country on a current shortest route. This is computed from the guesses made so far, when the hint is taken.
2. **Show all country outlines.** Reveals the outline of every country on the map.
3. **Show country initials.** The map tooltip on an outline country shows initials instead of `?` (for example "S… A…"). Without this hint, tooltips on outline countries show `?`.

Effects: the share text adds "(1 hint)" / "(n hints)". If any hint was used, the share text cannot say "(Perfect)". Stats and the leaderboard keep games with and without hints apart [CORE `shareText`, STATE, EN `results.key.*`].

## 6. Win, loss and scoring

- **Win:** right after a guess, the distance becomes **0**. That means the start and target are joined through a chain of guessed countries [CORE `makeGuess`]. Order does not matter, and extra guesses do not matter. The win check runs before the loss check, so a winning last guess is a win. Alert: "You made it!"
- **Loss:** after a non-winning guess, the number of guesses has reached the limit. Alert: "0 guesses remaining... :c". The result shows "{k} away", where k is the number of countries still missing, and lists them ("Missing countries 🔎: …").
- **Score:** `extra = guesses − N`. The result shows `+extra`, or **Perfect** when the perfect flag holds and extra = 0. The share text also requires that no hints were used. The guess-distribution buckets are Perfect, +0, +1, …, Failed. Note that +0 means a shortest route that was not guessed in order [STATE, CORE].
- After the game, the shortest route is shown with guessed and missed countries marked. The text "The shortest solution was …" uses N+1 [GAME, EN `results.breakdown.*`].
- Stats: Played, Win %, Current Streak, Max Streak, and the guess distribution split with/without hints [EN `results.stats.*`]. There is also a live global leaderboard per puzzle ("Today's Global Leaderboard", "Top x%").

## 7. Daily puzzle and reset

- "A new puzzle is released daily at midnight!" [EN `info.schedule`].
- Puzzle number = whole days since the map's `startDate` (**2022-12-15** for the world map) + 1. The countdown computes this from the player's **local** calendar date and counts down to **local midnight** ("Travle #n available in hh:mm:ss") [CORE countdown, MAPS]. Check: 2026-10-18 gives #1404, which matches [PAGE].
- The **server** chooses the route and puts it in the page as `{start, target, dist}`, together with `puzzleIx` [PAGE]. The client does not generate the daily route.
- Progress is saved in `localStorage` per game (`<game>-game-state`). A saved state is ignored ("outdated save") when its `puzzleIx` or route hash differs, so a new day starts fresh [STATE].
- Hard mode ("Hide country names") and the Hide Map setting are game modifiers. A change to hard mode takes effect from the **next** game [EN `settings.cantHardMode`].
- Extras (not core rules): a Weekly Challenge every Monday, Practice mode with custom routes, avoid lists and continent filters, Challenge Friends, a premium-only Archive back to 2022-12-15, other maps (France, GBR, India, Ireland, Italy, Japan, …), and post-game bonus rounds (flags/trivia, "Common Ground").

## 8. Share format

From `shareText` [CORE] and the share URL builder [SHARE]:

```
#travle #1404 +2 (1 hint)
✅🟩🟧✅✅🟥
https://travle.earth
```

- Line 1: `#travle #<puzzleIx>`. Practice mode uses `#travle_practice`, Challenge Friends uses `#travle_challenge_friends`, and other maps use their own tag (e.g. `#travle_fra`). Then, in this order:
  - `(hard mode)` if hard mode was on.
  - `+<extra>` on a win, or `(<k> away)` on a loss.
  - `(🎌)` or `(📝)` if the bonus round was finished in ≤ 3 guesses.
  - `(<n> hint[s])` if hints were used, **otherwise** `(Perfect)` if the game was perfect.
- Line 2: one emoji per accepted guess, in guess order. The results screen groups them in rows of 3, but the share text puts them on a single line.
- Line 3: the URL, `https://travle.earth`, or `https://travle.earth/<map>` for regional maps. Practice mode uses a `/practice?r=…` route link.

## Notes for Åkle (inferences, not Travle facts)

- The whole ruleset carries over directly to a kommun adjacency graph. "Bridges and tunnels count" matches the bridge rule in Åkle's initial prompt. Travle has **no ferry links**, so Gotland and Öckerö need an Åkle-specific decision.
- Travle's distance counts *countries* (nodes), not borders. The limit buckets were tuned for routes on the world map. Sweden has 290 kommuner, so routes may be longer and the buckets may need re-tuning.
