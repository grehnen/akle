# Åkle

I want to create a daily game that is basically a mix of [kommunle](https://kommunle.se/) ([GitHub-repo](https://github.com/aommm/kommunle)) and [travle](https://travle.earth/), where the goal is to travel between two kommuner in Sweden, similar to how you travel between countries in Travle.

## General gameplay

The game will present players with a starting kommun and a destination kommun, and they must figure out how to travel between them in as few steps as possible, by making a chain of neighboring kommuner.

### Some loose ideas

- The gameplay is mostly inspired by Travle. My idea though, is that instead of a blank canvas (like in Travle), the background will be a satellite image of Sweden, similar in style to the satellite images used in Kommunle.
- Only kommuner that share a land border or have a bridge connection can be considered neighbors. My hope is that land connections can be determined automatically via a script based on e.g. OSM data. Bridge connections might need to be manually curated. For kommuner without a bridge or land neighbor (I think there is only 2: Gotland and Öckerö), we could probably go based on ferry connections.

## Frameworks and technologies:

- React (Static Web App with only client-side logic)
- Bun
- Vite
- oxlint
- oxfmt
- Cloudflare Workers (for hosting the web app)
- GitHub Actions (for CI/CD)
