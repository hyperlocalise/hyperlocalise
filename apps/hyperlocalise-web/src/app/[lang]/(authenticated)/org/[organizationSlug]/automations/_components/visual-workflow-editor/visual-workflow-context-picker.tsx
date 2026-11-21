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
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

import type { VisualCatalogType } from "@/lib/visual-workflows/schema/types";
import type { VisualWorkflowAddIntent } from "@/lib/visual-workflows/editor/visual-workflow-add-from";

import { visualWorkflowEditorMessages as messages } from "./visual-workflow-editor.messages";
import { VisualWorkflowNodePicker } from "./visual-workflow-node-picker";

const PICKER_WIDTH = 320;
const PICKER_HEIGHT = 420;

export type VisualWorkflowContextPickerState = {
  client: { x: number; y: number };
  intent: VisualWorkflowAddIntent;
  allowedTypes?: readonly VisualCatalogType[];
};

export function VisualWorkflowContextPicker({
  state,
  hasTrigger,
  onPick,
  onClose,
}: {
  state: VisualWorkflowContextPickerState;
  hasTrigger: boolean;
  onPick: (type: VisualCatalogType, intent: VisualWorkflowAddIntent) => void;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const left = Math.max(
    8,
    Math.min(
      state.client.x,
      (typeof window === "undefined" ? 0 : window.innerWidth) - PICKER_WIDTH - 8,
    ),
  );
  const top = Math.max(
    8,
    Math.min(
      state.client.y,
      (typeof window === "undefined" ? 0 : window.innerHeight) - PICKER_HEIGHT - 8,
    ),
  );

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }
    function onPointer(event: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        onClose();
      }
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onPointer);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onPointer);
    };
  }, [onClose]);

  if (typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div
      ref={panelRef}
      role="dialog"
      aria-label="Add a step"
      className="fixed z-50 flex max-h-[min(26rem,70vh)] w-80 flex-col overflow-hidden rounded-xl border border-border bg-background shadow-xl"
      style={{ left, top, width: PICKER_WIDTH, height: PICKER_HEIGHT }}
    >
      <VisualWorkflowNodePicker
        disableTriggers={hasTrigger || Boolean(state.intent.from || state.intent.spliceEdgeId)}
        allowedTypes={state.allowedTypes}
        heading={messages.contextPickerTitle}
        autoFocusSearch
        onPick={(type) => onPick(type, state.intent)}
      />
    </div>,
    document.body,
  );
}
