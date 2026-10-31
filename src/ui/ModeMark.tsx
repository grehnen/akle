import type { ReactNode } from "react";
import type { ModeKind } from "../freePlay/linkPayload";

/** PROTOTYPE (#126): a mode's name, marked with its colour however `?marker=` says. */
export function ModeMark({ kind, children }: { kind: ModeKind; children: ReactNode }) {
  return (
    <span className="mode-mark" data-mode={kind}>
      {children}
    </span>
  );
}
