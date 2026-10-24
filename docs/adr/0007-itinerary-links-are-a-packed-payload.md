# Itinerary links are a packed payload

A single free-play trip link is readable and can be typed by hand (`/fri?fran=…&till=…&v=…&lage=…`), but an itinerary link is not: it is `/resplan?namn=<title>&r=<payload>`, where `r` is a bit-packed, unpadded base64url payload and only the optional title stays plain. We chose packing so a 20-trip itinerary stays around 100 characters, and so the link itself doesn't spoil which kommuner the trips run between. Itineraries are only ever made by the app, so nobody needs to read or type the payload.

- The payload holds a format version, the graph version, the trip count, and for each trip the start and destination **SCB codes**, the mode and, in timed mode only, the thinking time. It ends with an 8-bit checksum.
- The graph version is written as its **ordinal**, its position among graph versions ordered by start trip, not as its id. This is safe because free play only pins versions a daily trip has already used ([ADR 0006](./0006-free-play-links-pin-their-graph-version.md)), those are never edited ([ADR 0004](./0004-versioned-graphs-keyed-by-trip-number.md)), and any new version starts at a later trip number, so the ordinal of a usable version never changes.
- Kommuner stay SCB codes rather than indices, as ADR 0006 requires, at a cost of about 30 characters on 20 trips.
- The count and checksum turn a truncated or garbled link into an error instead of a silently different itinerary. A bad checksum, count, format version, ordinal or code shows the same clear error as any invalid free-play link.
- `/resplan` without `r` is not an invalid link but the itinerary builder, the only place an itinerary link is made.
- The format version lets a later codec be added. Every format ever shipped must stay decodable, because links live on in chats.

## Considered Options

- **One readable `resa` parameter per trip, like `/fri`:** hand-editable and debuggable, but about 650 characters for 20 trips, and it shows the endpoints.
- **A compact readable list** (`r=0180.1280.s,…`): about 260 characters, but it still shows the endpoints and is a second hand-written format.
- **The full version id inside the payload:** self-describing, but about 19 characters more, for no gain given the frozen-version rule.
