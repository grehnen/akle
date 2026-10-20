# PROTOTYPE: Åkle on phones and with assistive tech

Throwaway prototype for the ticket "How do the map and guess input work on phones and with assistive tech?" (grehnen/akle#15). Built on top of the play-screen prototype from grehnen/akle#8. Never merged.

Three layouts on one route, switched with `?variant=A|B|C` (orange pill at the top, or ← / →):

- **A, Travle stacked:** the column from #8. While the keyboard is open, the map shrinks and the input is pinned above the keyboard.
- **B, Full-screen map + sheet:** the map fills the screen. The input, hint button and guesses are in a bottom sheet (tap or drag the handle).
- **C, List first:** the input, a guess table and the connected chain come first. The map is a panel you can collapse.

Verdict (#15): **A** wins, with two-finger map panning and dashed outlines for guesses that are not connected (no S/M badges).

The **PROTO** panel (top left) toggles two-finger map panning, non-colour cues, and showing the screen-reader-only text.

```sh
cd prototype/mobile-a11y
bun install
bun dev --host   # --host so a phone on the same network can open it
```

Puzzle via URL: `?from=Ystad&to=Växjö`. Data as in the play-screen prototype (rough SCB-based neighbors).
