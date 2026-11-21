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
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  useReactFlow,
  type EdgeProps,
} from "@xyflow/react";
import { PlusIcon } from "@phosphor-icons/react";
import { useIntl } from "react-intl";

import type { VisualWorkflowCanvasEdge } from "@/lib/visual-workflows/schema/types";

import { useVisualWorkflowCanvasActions } from "./visual-workflow-canvas-actions";
import { visualWorkflowEditorMessages as messages } from "./visual-workflow-editor.messages";

export function VisualWorkflowInsertEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  markerEnd,
  style,
  data,
}: EdgeProps<VisualWorkflowCanvasEdge>) {
  const intl = useIntl();
  const reactFlow = useReactFlow();
  const { onInsertOnEdge } = useVisualWorkflowCanvasActions();
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });
  const canInsert = data?.kind !== "reference" && Boolean(onInsertOnEdge);

  return (
    <>
      <BaseEdge id={id} path={edgePath} markerEnd={markerEnd} style={style} />
      {canInsert ? (
        <EdgeLabelRenderer>
          <button
            type="button"
            data-visual-workflow-insert-edge={id}
            className="nodrag nopan pointer-events-auto absolute flex size-5 items-center justify-center rounded-full border border-border bg-background text-foreground shadow-sm hover:bg-muted"
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
            aria-label={intl.formatMessage(messages.insertOnWire)}
            onClick={(event) => {
              event.stopPropagation();
              onInsertOnEdge?.({
                edgeId: id,
                client: { x: event.clientX, y: event.clientY },
                position: reactFlow.screenToFlowPosition({
                  x: event.clientX,
                  y: event.clientY,
                }),
              });
            }}
          >
            <PlusIcon className="size-3" />
          </button>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
}
