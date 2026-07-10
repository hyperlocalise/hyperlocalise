import type { MutableRefObject } from "react";

export type CatPageNavigationGuard = (proceed: () => void) => void;

export type CatPageNavigationGuardRef = MutableRefObject<CatPageNavigationGuard | null>;

export function attemptCatPageNavigation(
  guardRef: CatPageNavigationGuardRef | undefined,
  proceed: () => void,
) {
  const guard = guardRef?.current;
  if (guard) {
    guard(proceed);
    return;
  }

  proceed();
}
