import { describe, expect, mock, test } from "bun:test";
import type { Bounds } from "./mapFeatures";
import { fitPadding } from "./mapStyle";
import { FITTED_BOUNDS, refitOnResize } from "./refitOnResize";

const opening: Bounds = [11, 56, 14, 59];
const guessed: Bounds = [12, 57, 16, 60];

function setup() {
  const listeners = new Map<string, (event: object) => void>();
  const map = {
    fitBounds: mock(),
    getContainer: () => ({ clientWidth: 400, clientHeight: 200 }) as HTMLElement,
    on: (type: "movestart" | "resize", listener: (event: object) => void) => {
      listeners.set(type, listener);
    },
  };
  refitOnResize(map, opening);
  const fire = (type: string, event: object = {}) => listeners.get(type)?.(event);
  const lastFitted = () => map.fitBounds.mock.calls.at(-1)?.[0];
  return { map, fire, lastFitted };
}

describe("refitOnResize", () => {
  test("a resize frames the opening bounds at the new size, at once", () => {
    const { map, fire } = setup();
    fire("resize");
    expect(map.fitBounds).toHaveBeenCalledTimes(1);
    const [bounds, options] = map.fitBounds.mock.calls[0]!;
    expect(bounds).toEqual(opening);
    expect(options).toEqual({ padding: fitPadding({ width: 400, height: 200 }), animate: false });
  });

  test("a player's pan or zoom is left alone by later resizes", () => {
    const { map, fire } = setup();
    fire("movestart", { originalEvent: {} });
    fire("resize");
    expect(map.fitBounds).not.toHaveBeenCalled();
  });

  test("a move the map makes on its own, such as a resize, doesn't count as the player's", () => {
    const { map, fire } = setup();
    fire("movestart");
    fire("resize");
    expect(map.fitBounds).toHaveBeenCalledTimes(1);
  });

  test("a fit, as for a new guess, sets what later resizes frame and clears the player's move", () => {
    const { fire, lastFitted } = setup();
    fire("movestart", { originalEvent: {} });
    fire("movestart", { [FITTED_BOUNDS]: guessed });
    fire("resize");
    expect(lastFitted()).toEqual(guessed);
  });
});
