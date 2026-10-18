# Åkle

A daily geography game: find a chain of neighboring kommuner from a start kommun to a destination kommun in as few steps as possible.

## Language

**Kommun** (plural _kommuner_):
One of Sweden's municipalities, the unit the whole game is played in.
_Avoid_: Municipality, county, region

**Neighbor**:
A kommun connected to another for gameplay purposes, so a route may pass directly between them.
_Avoid_: Adjacent, bordering

**Daily puzzle**:
The single start/destination pair that every player gets on a given day.
_Avoid_: Level, round, challenge

**Guess**:
A kommun the player names during a daily puzzle; only valid, new kommuner other than the start and destination count.
_Avoid_: Step, move, attempt

**Route**:
A chain of neighbors connecting the start kommun to the destination kommun.
_Avoid_: Path, chain, journey

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
