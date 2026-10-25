import { type ComponentProps, useState } from "react";
import { FreePlayBoard, type FreePlayBoardProps } from "./FreePlayBoard";
import { StartGate } from "./StartGate";

type GatedBoardProps = Omit<FreePlayBoardProps, "concealed" | "onMapReady"> & {
  /**
   * The `Starta` gate the trip waits behind, while it does; none once it's started, or for a trip
   * that never waits.
   */
  gate?: Omit<ComponentProps<typeof StartGate>, "label" | "mode" | "ready">;
};

/**
 * A free-play trip's board, behind its `Starta` gate while it has one: the board loads unseen
 * behind the gate, whose `Starta` waits until the board's map is drawn, and the reveal shows that
 * same board. A board revealed at `Starta` opens by the player's own action. Key it by trip, so
 * each trip gets a fresh gate and board.
 */
export function GatedBoard({ gate, openedByPlayer, ...board }: GatedBoardProps) {
  const [mapReady, setMapReady] = useState(false);
  return (
    <>
      {gate && <StartGate {...gate} label={board.label} mode={board.mode} ready={mapReady} />}
      <FreePlayBoard
        {...board}
        concealed={gate !== undefined}
        onMapReady={() => setMapReady(true)}
        openedByPlayer={gate !== undefined || openedByPlayer}
      />
    </>
  );
}
