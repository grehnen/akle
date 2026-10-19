# Åkle

A daily geography game: find a chain of neighboring kommuner from a start kommun to a destination kommun in as few steps as possible.

## Language

**Kommun** (plural _kommuner_):
One of Sweden's municipalities, the unit the whole game is played in.
_Avoid_: Municipality, county, region

**Neighbor**:
A kommun connected to another for gameplay purposes, so a route may pass directly between them: by a land border, by a fixed link, or by ferry when a kommun has no other link.
_Avoid_: Adjacent, bordering

**Neighbor graph**:
The set of all neighbor pairs between kommuner, the source every route, shortest route and daily puzzle is computed from.
_Avoid_: Map, adjacency list, network

**Fixed link**:
A public bridge, tunnel or causeway running directly between two kommuner across water, whatever traffic it carries.
_Avoid_: Crossing, connection

**Dead end**:
A kommun linked to others only by ferry; a route may begin or end there but never pass through it.
_Avoid_: Island, leaf

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

**Guess limit**:
The number of guesses allowed in a daily puzzle, set by the length of its shortest route.
_Avoid_: Max guesses, lives

**Extra**:
How many more guesses a win took than the shortest route has intermediate kommuner, shown as `+extra`.
_Avoid_: Penalty, over par

**Perfect**:
A win whose every guess lay on a shortest route connected to the start, with no hints used.
_Avoid_: Flawless, optimal

**Streak**:
The number of daily puzzles won on consecutive puzzle numbers; a loss or a puzzle not finished ends it.
_Avoid_: Run, chain, combo

**Share text**:
The short, spoiler-free summary of a finished daily puzzle that a player copies to post elsewhere.
_Avoid_: Score card, result string
