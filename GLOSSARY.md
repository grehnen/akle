# Åkle

A daily geography game: find a chain of neighboring kommuner from a start kommun to a destination kommun in as few steps as possible.

## Language

**Kommun** (plural _kommuner_):
One of Sweden's municipalities, the unit the whole game is played in.
_Avoid_: Municipality, county, region

**Län**:
One of Sweden's counties; every kommun lies in exactly one.
_Avoid_: County, region, province

**Neighbor**:
A kommun connected to another for gameplay purposes, so a route may pass directly between them: by a land border on the mainland or on an island of at least 1 km², by a fixed link, or by ferry when a kommun has no other link. A corner touch, where two borders meet at a single point on such land, counts as a land border. A border with no land, only river water, counts as a land border when it is 1000 m or more. A land border only on islands and under 1000 m, a river border under 1000 m, or a land border wholly on an exclave, doesn't count; such a pair is a neighbor only through a fixed link or a human's verdict.
_Avoid_: Adjacent, bordering

**Neighbor graph**:
The set of all neighbor pairs between kommuner, the source every route, shortest route and daily trip is computed from.
_Avoid_: Map, adjacency list, network

**Graph version**:
The neighbor graph, kommun names and kommun shapes that apply from a given trip number onward; it never changes once a daily trip has used it.
_Avoid_: Snapshot, release, map version

**Current version**:
The graph version that applies to today's trip number, or before launch day the one trip #1 uses; a free-play trip not pinned to another version is played on it.
_Avoid_: Latest version, newest version

**Fixed link**:
A public road, path or railway crossing the border between two kommuner, over water on a bridge, in a tunnel or over a causeway, or on land, whatever traffic it carries, that reaches meaningful land (the mainland or an island of at least 1 km²) on both sides, in each kommun's main part rather than an exclave. Only such a qualifying link makes the kommuner neighbors; a private road, driveway or track, a bridge to an islet, or a road into an exclave doesn't. A link of several ways qualifies when at least one of them does. Most fixed links join kommuner that are land neighbors anyway; one matters where the land border doesn't count, as with a road across a small island border.
_Avoid_: Crossing, connection

**Dead end**:
A kommun linked to others only by ferry; a route may begin or end there but never pass through it.
_Avoid_: Island, leaf

**Exclave**:
Any part of a kommun's boundary, water included, other than its largest part; an island inside the boundary is not one.
_Avoid_: Enclave, detached part

**Flagged pair**:
A pair of kommuner the graph build can't decide on alone, such as a very short land border, a land border only on small islands or only on an exclave, or a fixed link that doesn't qualify, so a human must give it a verdict.
_Avoid_: Warning, suspect pair

**Verdict**:
A human's committed decision on a flagged pair: keep what the build decided, or override it with a reason and evidence.
_Avoid_: Approval, exception

**Trip** (in the UI: _resa_):
A start kommun and a destination kommun for the player to find a route between.
_Avoid_: Puzzle, level, round, journey

**Daily trip**:
The single trip that every player gets on a given day.
_Avoid_: Daily puzzle, level, round, challenge

**Trip number**:
The sequential number of a daily trip, counting Åkle's launch day as #1.
_Avoid_: Puzzle number, day, index, id

**Schedule**:
The predetermined list of daily trips, one per trip number.
_Avoid_: Calendar, queue, rotation

**Cooldown**:
The number of daily trips after one with a given kommun as start or destination before that kommun can be one again.
_Avoid_: Quarantine, rest period, gap

**Län cooldown**:
The number of daily trips after one with a start or destination in a given län before any kommun in that län can be one again.
_Avoid_: County cooldown, regional cooldown

**Runway**:
How many days of trips the schedule has left: the scheduled daily trips after today's trip number in the earliest time zone.
_Avoid_: Buffer, remaining days, backlog

**Extension PR**:
The pull request the quarterly cron opens to append daily trips to the schedule when the runway runs low; it may be curated by hand before it merges.
_Avoid_: Schedule PR, refill, top-up

**Guess**:
A kommun the player names during a trip; only valid, new kommuner other than the start and destination count.
_Avoid_: Step, move, attempt

**Route**:
A chain of neighbors connecting the start kommun to the destination kommun.
_Avoid_: Path, chain, journey

**Connected**:
Said of a guess linked to the start kommun through an unbroken chain of neighbors that are all guesses; a guess can become connected later, when another guess links it up.
_Avoid_: Reached, linked, on the route

**Shortest route**:
A route with the fewest intermediate kommuner; a trip may have several. In the UI: _Kortaste rutt_, showing the one with the most guesses on it.
_Avoid_: Optimal path, solution

**Distance**:
The number of intermediate kommuner on a shortest route of a trip.
_Avoid_: N, par, length, steps

**Cheapest route**:
A route through the fewest kommuner the player hasn't guessed, with guessed kommuner free; it can be longer than a shortest route. In the UI: _Min rutt_.
_Avoid_: Shortest route (for this), best route, kortaste vägen

**Away** (in the UI: _ifrån_):
How many kommuner the player hasn't guessed lie on a cheapest route; a trip starts with away equal to its distance and is won when it reaches zero.
_Avoid_: Remaining, left, missing

**Guess limit**:
The number of guesses allowed in a trip, set by its distance; unlimited mode has none.
_Avoid_: Max guesses, lives

**Extra**:
How many more guesses a win took than the trip's distance, shown as `+extra`.
_Avoid_: Penalty, over par

**Perfect**:
A win whose every guess lay on a shortest route connected to the start, with no hints used and no timeouts.
_Avoid_: Flawless, optimal

**Hint**:
One of three optional reveals a player can take during a trip (in the UI: _ledtråd_); it never costs a guess but rules out Perfect, and adds to a free-play score.
_Avoid_: Clue, help, tip

**Score**:
The number a finished free-play trip earns, lower being better: a win's extra, or for a loss its guesses beyond the distance plus a multiple of its away, larger for a give-up than for reaching the guess limit, then a cost for each hint and each timeout and a bonus for Perfect; an itinerary's score is the sum of its trips' scores. Time never enters it: equal scores are separated first by more won tie-breaker trips, then by lower total time.
_Avoid_: Points, result, total

**Give up** (in the UI: _ge upp_):
To end an unwon free-play trip before its guess limit, which counts as a loss; it is allowed once the player has made as many guesses as the distance, and never in a daily trip.
_Avoid_: Surrender, quit, forfeit, abandon

**Streak**:
The number of daily trips won on consecutive trip numbers; a loss or a daily trip not finished ends it.
_Avoid_: Run, chain, combo

**Share text**:
The short, spoiler-free summary of a finished daily trip, free-play trip or itinerary that a player copies to post elsewhere; only a daily one carries a trip number.
_Avoid_: Score card, result string

**Free play** (in the UI: _Fri resa_):
Playing outside the schedule; it never touches the streak, stats or history.
_Avoid_: Practice, training, sandbox

**Mode**:
One of a fixed set of named rule sets a free-play trip is played under: standard, unlimited, timed or tie-breaker.
_Avoid_: Variant, ruleset, settings

**Standard mode** (in the UI: _Standard_):
The default mode, played by the daily-trip rules with no time kept.
_Avoid_: Classic, normal, daily mode

**Unlimited mode** (in the UI: _Obegränsad_):
The mode with no guess limit, otherwise played like standard mode.
_Avoid_: Endless, infinite, free mode

**Timed mode** (in the UI: _Tidspress_):
The mode in which every guess must be made within the thinking time.
_Avoid_: Speed mode, blitz, countdown

**Tie-breaker mode** (in the UI: _Tidtagning_):
The mode in which time is kept, so a win's time can separate equal scores.
_Avoid_: Race, time trial, stopwatch mode

**Free-play trip**:
A trip played in free play rather than taken from the schedule, whether picked or drawn at random.
_Avoid_: Practice puzzle, custom puzzle, random puzzle

**Itinerary** (in the UI: _resplan_):
An ordered list of free-play trips, each with its own mode, shared as a link.
_Avoid_: Playlist, challenge, set, quiz, pack

**Draft**:
The itinerary being built in the builder, its title and trips kept on this device until _Ny resplan_ empties it; one made on an older version is dropped.
_Avoid_: Unsaved itinerary, work in progress

**Time**:
The elapsed real time from starting a tie-breaker-mode trip to winning it, including any time the player is away; only a won tie-breaker trip has a time.
_Avoid_: Clock, timer, stopwatch

**Thinking time** (in the UI: _betänketid_):
The whole seconds a player has for each guess in a timed-mode trip, set per trip; each counted guess starts it again, and it keeps running while the player is away.
_Avoid_: Clock, timer, time limit, shot clock

**Timeout** (in the UI: _tiden ute_):
The thinking time running out before a guess; it adds to the score and rules out Perfect but uses no guess, and the thinking time starts again.
_Avoid_: Penalty, strike, miss
