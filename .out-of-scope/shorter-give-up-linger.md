# Showing the result at once after Ge upp

After the player confirms Ge upp, the board stays up for about 1.5 s before the result view opens, the same as after a winning or final guess.

## Why this is out of scope

The pause is the board's shared finish linger (`finishLingerMs` in the pacing context). Every way a trip ends gets it, so the player sees the final state land on the map before the result covers it. For a give-up, that state is the remaining route outlined in red. Skipping it for Ge upp alone would make one ending behave differently from the others, and hide the map change the player just caused. Ge upp is confirmed in a dialog first, and the pause isn't a dead end: the hints and Ge upp disappear at once, and the guess input is disabled (#88).

## Prior requests

- #97: "Ge upp takes 1–2 s to show the result" (UX exploration, 2026-10-25)
