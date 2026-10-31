import type { ReactNode } from "react";
import type { ModeKind } from "../freePlay/linkPayload";

/** A mode's name in its colour, where no card or row around it carries that colour. */
export function ModeName({ kind, children }: { kind: ModeKind; children: ReactNode }) {
  return (
    <span className="mode-name" data-mode={kind}>
      {children}
    </span>
  );
}
