# PROTOTYPE: Åkle play screen

Throwaway prototype for the ticket "What does the map look like, and how do players enter guesses?" (grehnen/akle#8). Never merged.

```sh
cd prototype/play-screen
bun install
bun run data   # only needed if public/ is missing
bun dev
```

Puzzle via URL: `?from=Ystad&to=Växjö`. Data: SCB kommun boundaries (CC0, Kommunle's 2021 snapshot); neighbors are rough (shared SCB vertices plus a few hand-added island links). Imagery: EOX Sentinel-2 cloudless 2016 (CC BY 4.0), loaded live.
