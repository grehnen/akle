# Share links that point to the local or preview origin

Every link Åkle copies, from the itinerary builder's Kopiera länk and from share texts, starts with the production site (`SITE_URL`, https://akle.grehn.net). It does so on localhost and on preview deployments too.

## Why this is out of scope

A share link is meant for other people, so it must open the live game they can reach. A link to `localhost:5181` or a short-lived preview host breaks the moment it leaves the developer's machine or the preview is replaced. Free-play and itinerary links pin their graph version (ADR 0006, ADR 0007), so a link made locally opens the same trips in production, as long as that version has shipped.

Developers testing locally can paste the link's path and query onto their own origin. The surprise is a development concern, not a player one, and it isn't worth a second code path for links.

## Prior requests

- #97: "on localhost it points to production" (UX exploration, 2026-10-25)
