# Dismissing the "Oavslutad resplan" banner

The builder's "Oavslutad resplan" banner, with "<title> · resa N av M" and "Fortsätt ›" beside it, can't be dismissed or hidden by the player.

## Why this is out of scope

Under ADR 0008 the banner already shows only when the **most recently played itinerary** is unfinished. It never lists older ones. It goes away by itself once that itinerary is finished or another one is played. Dismissing it would need a new piece of stored state per save ("hidden until played again"), and rules for when a hidden banner comes back. The only gain is hiding one line above the builder, which ADR 0008 deliberately keeps as the single way back to an unfinished itinerary, since free play keeps no list of saves.

The banner's look and wording are being improved instead (#102): it reads as a link and names the next trip to play.

## Prior requests

- #97: "The resume banner … can't be dismissed" (UX exploration, 2026-10-25)
