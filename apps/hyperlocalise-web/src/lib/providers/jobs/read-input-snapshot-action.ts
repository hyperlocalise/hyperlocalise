export function readInputSnapshotAction(
  inputSnapshot: Record<string, unknown> | undefined,
): string | null {
  const action = inputSnapshot?.action;
  return typeof action === "string" ? action : null;
}
