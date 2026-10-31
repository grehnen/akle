import type { ModeKind } from "../freePlay/linkPayload";

/** A mode's colour, set beside its name; the name always says which mode it is. */
export function ModeDot({ kind }: { kind: ModeKind }) {
  return <span className="mode-dot" data-mode={kind} aria-hidden="true" />;
}
