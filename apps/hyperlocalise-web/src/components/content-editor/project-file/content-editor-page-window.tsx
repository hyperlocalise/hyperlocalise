"use client";

/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in this application's LICENSE file.
 *
 * Change Date: Four years after publication of the applicable version.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { createContext, useContext, useLayoutEffect, useRef, type RefObject } from "react";
import type { Virtualizer } from "@tanstack/react-virtual";

const Context = createContext({
  hasPreviousPage: false,
  isFetchingPage: false,
  loadPreviousPage: () => {},
});
export const ContentEditorPageWindowProvider = Context.Provider;

/** Anchor by stable segment identity rather than an index that changes when a page is evicted. */
export function useEditorPageWindow(
  segments: readonly { id: string }[],
  scrollRef: RefObject<HTMLDivElement | null>,
  virtualizer: Virtualizer<HTMLDivElement, Element>,
) {
  const pagination = useContext(Context);
  const anchor = useRef<{ id: string; delta: number } | null>(null);
  const previousFirst = useRef(segments[0]?.id);
  const restoring = useRef(false);
  const requestedFirst = useRef<string | undefined>(undefined);
  useLayoutEffect(() => {
    const first = segments[0]?.id;
    if (first !== previousFirst.current && anchor.current) {
      const index = segments.findIndex((segment) => segment.id === anchor.current?.id);
      if (index >= 0) {
        restoring.current = true;
        const offset = virtualizer.getOffsetForIndex(index, "start")?.[0];
        if (offset !== undefined) virtualizer.scrollToOffset(offset + anchor.current.delta);
        restoring.current = false;
      }
    }
    previousFirst.current = first;
    const element = scrollRef.current;
    if (!element) return;
    const capture = () => {
      if (restoring.current) return;
      const item = virtualizer.getVirtualItems().find((row) => row.end > element.scrollTop);
      if (item && segments[item.index])
        anchor.current = { id: segments[item.index].id, delta: element.scrollTop - item.start };
      if (
        element.scrollTop < 160 &&
        pagination.hasPreviousPage &&
        !pagination.isFetchingPage &&
        requestedFirst.current !== first
      ) {
        requestedFirst.current = first;
        pagination.loadPreviousPage();
      }
    };
    capture();
    element.addEventListener("scroll", capture, { passive: true });
    return () => element.removeEventListener("scroll", capture);
  }, [segments, scrollRef, virtualizer, pagination]);
  useLayoutEffect(() => {
    if (!pagination.isFetchingPage) requestedFirst.current = undefined;
  }, [pagination.isFetchingPage]);
}
