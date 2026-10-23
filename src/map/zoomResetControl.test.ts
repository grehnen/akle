import { afterAll, afterEach, describe, expect, mock, test } from "bun:test";
import { JSDOM } from "jsdom";
import { LngLat, Point, type Map as MapLibreMap } from "maplibre-gl";
import type { Bounds } from "./mapFeatures";
import { fitPadding, mapOptions } from "./mapStyle";
import { zoomResetControl } from "./zoomResetControl";

const dom = new JSDOM("<!doctype html><html><body></body></html>");
Object.assign(globalThis, { document: dom.window.document });
afterAll(() => Reflect.deleteProperty(globalThis, "document"));
afterEach(() => dom.window.document.body.replaceChildren());

function setup(bounds?: Bounds) {
  const canvas = dom.window.document.createElement("canvas");
  canvas.tabIndex = 0;
  const map = {
    cameraForBounds: mock<MapLibreMap["cameraForBounds"]>(() => ({
      center: [14, 58],
      zoom: 7,
    })),
    fitBounds: mock<MapLibreMap["fitBounds"]>(),
    getCanvas: mock(() => canvas),
    getCenter: mock(() => new LngLat(14, 58)),
    getContainer: mock(() => ({ clientWidth: 864, clientHeight: 648 }) as HTMLElement),
    getZoom: mock(() => 7),
    on: mock<(type: string, listener: () => void) => void>(),
    off: mock<(type: string, listener: () => void) => void>(),
    project: mock<MapLibreMap["project"]>((coordinate) => {
      const { lng, lat } = LngLat.convert(coordinate);
      return new Point(lng * 100, lat * 100);
    }),
  };
  const control = zoomResetControl(bounds);
  const container = control.onAdd(map);
  dom.window.document.body.append(canvas, container);
  const button = container.querySelector("button")!;
  const fire = (type: "movestart" | "moveend" | "resize") => {
    for (const [event, listener] of map.on.mock.calls) {
      if (event === type) listener();
    }
  };
  return { map, control, container, button, canvas, fire };
}

describe("zoomResetControl", () => {
  test("a Swedish-labelled, non-submit button is hidden at the opening view", () => {
    const { container, button } = setup();
    expect(container.hidden).toBe(true);
    expect(button.type).toBe("button");
    expect(button.title).toBe("Återställ kartvyn");
    expect(button.getAttribute("aria-label")).toBe(button.title);
    expect(button.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
  });

  test("appears as soon as movement starts, before the camera changes or movement ends", () => {
    const { map, container, fire } = setup();
    fire("movestart");
    expect(container.hidden).toBe(false);
    expect(map.getCenter()).toEqual(new LngLat(14, 58));
    expect(map.getZoom()).toBe(7);
    fire("moveend");
    expect(container.hidden).toBe(true);
  });

  test("appears after zooming and resets using the opening bounds and padding", () => {
    const bounds: Bounds = [12, 56, 17, 59];
    const { map, container, button, fire } = setup(bounds);
    map.getZoom.mockReturnValue(9);
    fire("moveend");
    expect(container.hidden).toBe(false);
    button.click();
    expect(map.fitBounds).toHaveBeenCalledWith(bounds, {
      padding: fitPadding({ width: 864, height: 648 }),
      duration: 500,
      linear: true,
    });
    // MapLibre's non-essential animations respect prefers-reduced-motion.
    expect(map.fitBounds.mock.calls[0]?.[1]?.essential).not.toBe(true);
  });

  test("also appears after panning without changing the zoom", () => {
    const { map, container, fire } = setup();
    map.getCenter.mockReturnValue(new LngLat(15, 58));
    fire("moveend");
    expect(container.hidden).toBe(false);
  });

  test("hides on returning to the opening view and preserves keyboard focus", () => {
    const { map, container, button, canvas, fire } = setup();
    map.getZoom.mockReturnValue(9);
    fire("moveend");
    button.focus();
    map.getZoom.mockReturnValue(7);
    fire("moveend");
    expect(container.hidden).toBe(true);
    expect(dom.window.document.activeElement).toBe(canvas);
  });

  test("allows sub-pixel and floating-point differences at the opening view", () => {
    const { map, container, fire } = setup();
    map.getCenter.mockReturnValue(new LngLat(14.000001, 58.000001));
    map.getZoom.mockReturnValue(7.000001);
    fire("moveend");
    expect(container.hidden).toBe(true);
  });

  test("recalculates the opening camera after resizing instead of saving an old zoom", () => {
    const { map, container, fire } = setup();
    map.cameraForBounds.mockReturnValue({ center: [14, 58], zoom: 6 });
    fire("resize");
    expect(container.hidden).toBe(false);
    map.getZoom.mockReturnValue(6);
    fire("moveend");
    expect(container.hidden).toBe(true);
  });

  test.each([
    ["a result route's frame", [12, 56, 21, 66] as Bounds],
    ["the Sweden fallback when shapes are unavailable", undefined],
  ])("restores %s with the same framing as map creation", (_, bounds) => {
    const { map, button } = setup(bounds);
    button.click();
    expect(map.fitBounds.mock.calls[0]?.[0]).toEqual(mapOptions(bounds).bounds);
  });

  test("after setBounds, resets to the new default bounds and shows when the map is elsewhere", () => {
    const { map, control, container, button } = setup([12, 56, 17, 59]);
    const grown: Bounds = [12, 56, 21, 66];
    map.cameraForBounds.mockReturnValue({ center: [16, 61], zoom: 5 });
    control.setBounds(grown);
    expect(container.hidden).toBe(false);
    button.click();
    expect(map.fitBounds.mock.calls[0]?.[0]).toEqual(grown);
  });

  test("removes the control and all its listeners when the map is removed", () => {
    const { map, control, container, button } = setup();
    control.onRemove();
    expect(container.isConnected).toBe(false);
    for (const [type, listener] of map.on.mock.calls) {
      expect(map.off).toHaveBeenCalledWith(type, listener);
    }
    button.click();
    expect(map.fitBounds).not.toHaveBeenCalled();
  });
});
