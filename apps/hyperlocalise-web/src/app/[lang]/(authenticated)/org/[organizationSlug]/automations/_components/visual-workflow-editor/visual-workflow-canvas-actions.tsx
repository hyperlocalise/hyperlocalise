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
import { createContext, useContext, type ReactNode } from "react";

export type VisualWorkflowAddFrom = {
  nodeId: string;
  handleId?: string;
};

const VisualWorkflowCanvasActionsContext = createContext<{
  onAddFromNode: (from: VisualWorkflowAddFrom) => void;
} | null>(null);

export function VisualWorkflowCanvasActionsProvider({
  onAddFromNode,
  children,
}: {
  onAddFromNode: (from: VisualWorkflowAddFrom) => void;
  children: ReactNode;
}) {
  return (
    <VisualWorkflowCanvasActionsContext.Provider value={{ onAddFromNode }}>
      {children}
    </VisualWorkflowCanvasActionsContext.Provider>
  );
}

export function useVisualWorkflowCanvasActions() {
  const value = useContext(VisualWorkflowCanvasActionsContext);
  if (!value) {
    throw new Error("Visual workflow canvas actions are unavailable");
  }
  return value;
}
