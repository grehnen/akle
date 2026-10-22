# Åkle

A daily geography game: find a chain of neighboring kommuner from a start kommun to a destination kommun in as few steps as possible.

## Language

**Kommun** (plural _kommuner_):
One of Sweden's municipalities, the unit the whole game is played in.
_Avoid_: Municipality, county, region

**Neighbor**:
A kommun connected to another for gameplay purposes, so a route may pass directly between them: by a land border on the mainland or on an island of at least 1 km², by a fixed link, or by ferry when a kommun has no other link. A land border only on islands and under 1000 m, or wholly on an exclave, doesn't count, nor does a corner touch; such a pair is a neighbor only through a fixed link or a human's verdict.
_Avoid_: Adjacent, bordering

**Neighbor graph**:
The set of all neighbor pairs between kommuner, the source every route, shortest route and daily puzzle is computed from.
_Avoid_: Map, adjacency list, network

**Graph version**:
The neighbor graph, kommun names and kommun shapes that apply from a given puzzle number onward; it never changes once a daily puzzle has used it.
_Avoid_: Snapshot, release, map version

**Fixed link**:
A public bridge, tunnel or causeway running directly between two kommuner across water, whatever traffic it carries, with both ends on meaningful land: the mainland or an island of at least 1 km². Only such a qualifying link makes the kommuner neighbors; a private road, driveway or track, or a bridge to an islet, doesn't.
_Avoid_: Crossing, connection

**Dead end**:
A kommun linked to others only by ferry; a route may begin or end there but never pass through it.
_Avoid_: Island, leaf

**Exclave**:
Any part of a kommun's boundary, water included, other than its largest part; an island inside the boundary is not one.
_Avoid_: Enclave, detached part

**Flagged pair**:
A pair of kommuner the graph build can't decide on alone, such as a very short land border, a land border only on small islands or only on an exclave, or a disagreement with SCB's map, so a human must give it a verdict.
_Avoid_: Warning, suspect pair

**Verdict**:
A human's committed decision on a flagged pair: keep what the build decided, or override it with a reason and evidence.
_Avoid_: Approval, exception

**Daily puzzle**:
The single start/destination pair that every player gets on a given day.
_Avoid_: Level, round, challenge

**Puzzle number**:
The sequential number of a daily puzzle, counting Åkle's launch day as #1.
_Avoid_: Day, index, id

**Schedule**:
The predetermined list of daily puzzles, one per puzzle number.
_Avoid_: Calendar, queue, rotation

**Guess**:
A kommun the player names during a daily puzzle; only valid, new kommuner other than the start and destination count.
_Avoid_: Step, move, attempt

**Route**:
A chain of neighbors connecting the start kommun to the destination kommun.
_Avoid_: Path, chain, journey

**Connected**:
Said of a guess linked to the start kommun through an unbroken chain of neighbors that are all guesses; a guess can become connected later, when another guess links it up.
_Avoid_: Reached, linked, on the route

**Shortest route**:
A route with the fewest intermediate kommuner; a daily puzzle may have several.
_Avoid_: Optimal path, solution

**Cheapest route**:
A route through the fewest kommuner the player hasn't guessed, with guessed kommuner free; it can be longer than a shortest route. In the UI: _bästa vägen med dina gissningar_.
_Avoid_: Shortest route (for this), best route, kortaste vägen

**Guess limit**:
The number of guesses allowed in a daily puzzle, set by the length of its shortest route.
_Avoid_: Max guesses, lives

**Extra**:
How many more guesses a win took than the shortest route has intermediate kommuner, shown as `+extra`.
_Avoid_: Penalty, over par

**Perfect**:
A win whose every guess lay on a shortest route connected to the start, with no hints used.
_Avoid_: Flawless, optimal

**Hint**:
One of three optional reveals a player can take during a daily puzzle (in the UI: _ledtråd_); it never costs a guess but rules out Perfect.
_Avoid_: Clue, help, tip

**Streak**:
The number of daily puzzles won on consecutive puzzle numbers; a loss or a puzzle not finished ends it.
_Avoid_: Run, chain, combo

**Share text**:
The short, spoiler-free summary of a finished daily puzzle that a player copies to post elsewhere.
_Avoid_: Score card, result string
