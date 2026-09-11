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
"use client";
import { useState } from "react";
import { useIntl } from "react-intl";
import { ReactFlow, Background } from "@xyflow/react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import type { VisualWorkflowRunRecord } from "@/lib/visual-workflows/visual-workflow-run-types";
import type { VisualWorkflowDefinition } from "@/lib/visual-workflows/schema/types";
export function WorkflowRunDetails({
  run,
  organizationSlug,
  onRefresh,
}: {
  run: VisualWorkflowRunRecord;
  organizationSlug: string;
  onRefresh: () => void;
}) {
  const intl = useIntl();
  const [confirm, setConfirm] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  const snapshot = run.inputSnapshot.definitionSnapshot as VisualWorkflowDefinition | undefined;
  const act = async (action: "cancel" | "retry") => {
    setPending(true);
    setError(false);
    try {
      const response = await fetch(
        `/api/orgs/${encodeURIComponent(organizationSlug)}/visual-workflows/${encodeURIComponent(run.visualWorkflowId)}/runs/${encodeURIComponent(run.id)}/${action}`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(action === "retry" ? { acknowledgePossibleDuplication: true } : {}),
        },
      );
      if (!response.ok) throw new Error("run_action_failed");
      setConfirm(false);
      onRefresh();
    } catch {
      setError(true);
    } finally {
      setPending(false);
    }
  };
  const runs = new Map(run.nodeRuns?.map((node) => [node.nodeId, node.status]));
  return (
    <>
      {snapshot?.nodes && snapshot.edges ? (
        <div
          className="h-64 rounded-md border border-border"
          aria-label={intl.formatMessage({
            defaultMessage: "Executed workflow graph",
            id: "Q5JCrL+c5X",
            description: "Read-only historical workflow canvas",
          })}
        >
          <ReactFlow
            nodes={snapshot.nodes.map((node) => ({
              id: node.id,
              position: snapshot.editor.positions[node.id] ?? { x: 0, y: 0 },
              data: { label: `${node.id} · ${runs.get(node.id) ?? "queued"}` },
            }))}
            edges={snapshot.edges.map((edge) => ({
              id: edge.id,
              source: edge.source,
              target: edge.target,
              label: edge.sourceHandle ?? undefined,
            }))}
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable={false}
            fitView
          >
            <Background />
          </ReactFlow>
        </div>
      ) : null}
      <div className="flex items-center gap-2">
        {["running", "queued"].includes(run.status) ? (
          <Button variant="outline" disabled={pending} onClick={() => void act("cancel")}>
            {intl.formatMessage({
              defaultMessage: "Cancel run",
              id: "p5tAWwc/1r",
              description: "Cancel selected workflow run",
            })}
          </Button>
        ) : null}
        {["failed", "needs_attention"].includes(run.status) ? (
          <Button variant="outline" disabled={pending} onClick={() => setConfirm(true)}>
            {intl.formatMessage({
              defaultMessage: "Retry remaining actions",
              id: "0XaMa+DGJ+",
              description: "Retry failed workflow actions",
            })}
          </Button>
        ) : null}
      </div>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {intl.formatMessage({
            defaultMessage: "Could not update this run. Try again.",
            id: "78EzqzfFIN",
            description: "Workflow run action error",
          })}
        </p>
      ) : null}
      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {intl.formatMessage({
                defaultMessage: "Retry this run?",
                id: "qJSt/PSXpn",
                description: "Workflow retry confirmation title",
              })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {intl.formatMessage({
                defaultMessage:
                  "Completed actions will be preserved. An action with an unknown outcome may run again and create a duplicate request or notification. Check the provider before retrying.",
                id: "SWpAwiQbIG",
                description: "Workflow retry duplication warning",
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>
              {intl.formatMessage({
                defaultMessage: "Go back",
                id: "lmNMhLYtR0",
                description: "Cancel workflow retry",
              })}
            </AlertDialogCancel>
            <Button disabled={pending} onClick={() => void act("retry")}>
              {intl.formatMessage({
                defaultMessage: "Retry with possible duplicates",
                id: "W8JU7siT0y",
                description: "Confirm workflow retry despite duplicate risk",
              })}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
