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
  applyNodeChanges,
  applyEdgeChanges,
  type Connection,
  type EdgeChange,
  type NodeChange,
  type OnSelectionChangeParams,
} from "@xyflow/react";
import { useCallback, useMemo, useRef, useState } from "react";
import { useIntl } from "react-intl";
import { toast } from "sonner";

import { runFakeWorkflow } from "@/lib/visual-workflows/preview/fake-run";
import {
  createDefaultConfig,
  getVisualNodeDimensions,
  isTriggerType,
} from "@/lib/visual-workflows/catalog/node-catalog";
import { visualWorkflowDemoDraft } from "@/lib/visual-workflows/fixtures/demo-draft";
import { toVisualWorkflowDefinition } from "@/lib/visual-workflows/schema/serializers";
import type {
  MockNodeRunStatus,
  VisualCatalogType,
  VisualNodeConfig,
  VisualWorkflowDefinition,
  VisualWorkflowRfEdge,
  VisualWorkflowRfNode,
  VisualWorkflowValidationIssue,
} from "@/lib/visual-workflows/schema/types";
import type { VisualWorkflowStatus } from "@/lib/visual-workflows/visual-workflow-types";
import { validateVisualWorkflowGraph } from "@/lib/visual-workflows/validation/validate-workflow";
import { assertNever } from "@/lib/primitives/assert-never/assert-never";

import { applyVisualWorkflowConnection, VisualWorkflowCanvas } from "./visual-workflow-canvas";
import {
  VisualWorkflowCanvasActionsProvider,
  type VisualWorkflowAddFrom,
} from "./visual-workflow-canvas-actions";
import { VisualWorkflowChrome } from "./visual-workflow-chrome";
import { VisualWorkflowConfigPanel } from "./visual-workflow-config-panel";
import { VisualWorkflowExecutionsPanel } from "./visual-workflow-executions-panel";
import { visualWorkflowEditorMessages as messages } from "./visual-workflow-editor.messages";
import { VisualWorkflowNodePicker } from "./visual-workflow-node-picker";
import type { VisualWorkflowsApi } from "../visual-workflows-api";

const NODE_GAP_X = 260;
const NODE_GAP_Y = 36;

export function VisualWorkflowEditor({
  initialNodes = [],
  initialEdges = [],
  initialName,
  previewMode = false,
  onSave,
  isSaving = false,
  organizationSlug,
  visualWorkflowId,
  visualWorkflowsApi,
  onPersistBeforeTest,
  workflowStatus = "draft",
  onStatusChange,
  statusUpdating = false,
}: {
  initialNodes?: VisualWorkflowRfNode[];
  initialEdges?: VisualWorkflowRfEdge[];
  initialName?: string;
  previewMode?: boolean;
  onSave?: (definition: VisualWorkflowDefinition) => void | Promise<void>;
  isSaving?: boolean;
  organizationSlug?: string;
  visualWorkflowId?: string;
  visualWorkflowsApi?: VisualWorkflowsApi;
  onPersistBeforeTest?: (definition: VisualWorkflowDefinition) => Promise<unknown>;
  workflowStatus?: VisualWorkflowStatus;
  onStatusChange?: (active: boolean) => void | Promise<void>;
  statusUpdating?: boolean;
}) {
  const intl = useIntl();
  const [activeTab, setActiveTab] = useState<"editor" | "executions">("editor");
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [name, setName] = useState(initialName ?? intl.formatMessage(messages.untitledName));
  const [nodes, setNodes] = useState<VisualWorkflowRfNode[]>(initialNodes);
  const [edges, setEdges] = useState<VisualWorkflowRfEdge[]>(initialEdges);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [panelMode, setPanelMode] = useState<"picker" | "config">("picker");
  const [addFrom, setAddFrom] = useState<VisualWorkflowAddFrom | null>(null);
  const [copied, setCopied] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const runAbortRef = useRef<AbortController | null>(null);

  const selectedNode = nodes.find((node) => node.id === selectedNodeId) ?? null;
  const issues = useMemo(() => validateVisualWorkflowGraph(nodes, edges), [nodes, edges]);
  const hasTrigger = nodes.some((node) => isTriggerType(node.data.catalogType));
  const showConfig = panelMode === "config" && selectedNode !== null;
  const saveDisabled = issues.length > 0;

  const onNodesChange = useCallback((changes: NodeChange<VisualWorkflowRfNode>[]) => {
    setNodes((current) => applyNodeChanges(changes, current));
  }, []);

  const onEdgesChange = useCallback((changes: EdgeChange<VisualWorkflowRfEdge>[]) => {
    setEdges((current) => applyEdgeChanges(changes, current));
  }, []);

  const onConnect = useCallback((connection: Connection) => {
    setEdges((current) => applyVisualWorkflowConnection(current, connection));
  }, []);

  const onSelectionChange = useCallback((params: OnSelectionChangeParams) => {
    const nextId = params.nodes[0]?.id ?? null;
    setSelectedNodeId(nextId);
    if (nextId) {
      setPanelMode("config");
      setAddFrom(null);
    }
  }, []);

  const openPicker = useCallback((from: VisualWorkflowAddFrom | null = null) => {
    setAddFrom(from);
    setPanelMode("picker");
    if (from) {
      setSelectedNodeId(null);
    }
  }, []);

  const addNode = useCallback(
    (type: VisualCatalogType) => {
      const id =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? `vw_${crypto.randomUUID().slice(0, 8)}`
          : `vw_${Date.now()}`;
      const source = addFrom ? nodes.find((node) => node.id === addFrom.nodeId) : undefined;
      const position = source
        ? {
            x: source.position.x + NODE_GAP_X,
            y: source.position.y + (addFrom?.handleId === "false" ? NODE_GAP_Y + 80 : 0),
          }
        : { x: 120 + nodes.length * 24, y: 160 + nodes.length * 16 };

      const nextNode: VisualWorkflowRfNode = {
        id,
        type,
        position,
        ...getVisualNodeDimensions(type),
        data: {
          catalogType: type,
          config: createDefaultConfig(type),
          runStatus: "idle",
        },
      };

      setNodes((current) => [...current, nextNode]);
      if (source && !isTriggerType(type)) {
        const branchHandle =
          addFrom?.handleId === "true" || addFrom?.handleId === "false" ? addFrom.handleId : null;
        setEdges((current) =>
          applyVisualWorkflowConnection(current, {
            source: source.id,
            target: id,
            sourceHandle: branchHandle,
            targetHandle: null,
          }),
        );
      }
      setAddFrom(null);
      setSelectedNodeId(id);
      setPanelMode("config");
    },
    [addFrom, nodes],
  );

  const onChangeConfig = useCallback(
    (config: VisualNodeConfig) => {
      if (!selectedNodeId) {
        return;
      }
      setNodes((current) =>
        current.map((node) =>
          node.id === selectedNodeId ? { ...node, data: { ...node.data, config } } : node,
        ),
      );
    },
    [selectedNodeId],
  );

  const setRunStatus = useCallback((nodeId: string, status: MockNodeRunStatus) => {
    setNodes((current) =>
      current.map((node) =>
        node.id === nodeId ? { ...node, data: { ...node.data, runStatus: status } } : node,
      ),
    );
  }, []);

  const applyNodeRunStatuses = useCallback(
    (nodeRuns: Array<{ nodeId: string; status: string }>) => {
      const statusByNodeId = new Map(
        nodeRuns.map((nodeRun) => [nodeRun.nodeId, nodeRun.status] as const),
      );
      setNodes((current) =>
        current.map((node) => {
          const status = statusByNodeId.get(node.id);
          if (!status) {
            return node;
          }
          const mappedStatus: MockNodeRunStatus =
            status === "running"
              ? "running"
              : status === "succeeded"
                ? "succeeded"
                : status === "failed"
                  ? "failed"
                  : "idle";
          return { ...node, data: { ...node.data, runStatus: mappedStatus } };
        }),
      );
    },
    [],
  );

  const onTestWorkflowClick = useCallback(async () => {
    runAbortRef.current?.abort();
    const controller = new AbortController();
    runAbortRef.current = controller;
    setIsRunning(true);
    setNodes((current) =>
      current.map((node) => ({ ...node, data: { ...node.data, runStatus: "idle" } })),
    );

    const definition = toVisualWorkflowDefinition({ name, nodes, edges });

    try {
      if (organizationSlug && visualWorkflowId && visualWorkflowsApi && onPersistBeforeTest) {
        await onPersistBeforeTest(definition);
        const idempotencyKey = `manual-${visualWorkflowId}-${Date.now()}`;
        const { run } = await visualWorkflowsApi.createVisualWorkflowRun(
          organizationSlug,
          visualWorkflowId,
          { idempotencyKey },
        );

        const terminalStatuses = new Set(["succeeded", "failed", "cancelled", "skipped"]);
        let latestRun = run;
        while (!terminalStatuses.has(latestRun.status)) {
          if (controller.signal.aborted) {
            return;
          }
          await sleep(750, controller.signal);
          latestRun = await visualWorkflowsApi.getVisualWorkflowRun(
            organizationSlug,
            visualWorkflowId,
            latestRun.id,
          );
          applyNodeRunStatuses(latestRun.nodeRuns ?? []);
        }

        applyNodeRunStatuses(latestRun.nodeRuns ?? []);
        if (latestRun.status === "failed") {
          toast.error(intl.formatMessage(messages.testRunFailed));
        }
      } else {
        await runFakeWorkflow({
          nodes,
          edges,
          signal: controller.signal,
          onStatus: setRunStatus,
        });
      }
    } finally {
      if (!controller.signal.aborted) {
        setIsRunning(false);
      }
    }
  }, [
    applyNodeRunStatuses,
    edges,
    intl,
    name,
    nodes,
    onPersistBeforeTest,
    organizationSlug,
    setRunStatus,
    visualWorkflowId,
    visualWorkflowsApi,
  ]);

  const draftJson = useCallback(() => {
    return `${JSON.stringify(toVisualWorkflowDefinition({ name, nodes, edges }), null, 2)}\n`;
  }, [edges, name, nodes]);

  const onExport = useCallback(() => {
    const blob = new Blob([draftJson()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "visual-workflow.json";
    link.click();
    URL.revokeObjectURL(url);
  }, [draftJson]);

  const onCopy = useCallback(async () => {
    await navigator.clipboard.writeText(draftJson());
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }, [draftJson]);

  const handleSave = useCallback(() => {
    if (!onSave || saveDisabled) {
      return;
    }
    void onSave(toVisualWorkflowDefinition({ name, nodes, edges }));
  }, [edges, name, nodes, onSave, saveDisabled]);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
      <VisualWorkflowChrome
        name={name}
        onNameChange={setName}
        copied={copied}
        onExport={onExport}
        onCopy={onCopy}
        onSave={onSave ? handleSave : undefined}
        isSaving={isSaving}
        saveDisabled={saveDisabled}
        previewMode={previewMode}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        workflowStatus={workflowStatus}
        onStatusChange={onStatusChange}
        statusDisabled={statusUpdating || saveDisabled}
      />
      {activeTab === "executions" && organizationSlug && visualWorkflowId && visualWorkflowsApi ? (
        <VisualWorkflowExecutionsPanel
          organizationSlug={organizationSlug}
          visualWorkflowId={visualWorkflowId}
          visualWorkflowsApi={visualWorkflowsApi}
          selectedRunId={selectedRunId}
          onSelectRun={setSelectedRunId}
        />
      ) : (
        <div className="flex min-h-0 flex-1">
          <VisualWorkflowCanvasActionsProvider onAddFromNode={openPicker}>
            <VisualWorkflowCanvas
              nodes={nodes}
              edges={edges}
              isRunning={isRunning}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onSelectionChange={onSelectionChange}
              onAddFirstStep={() => openPicker(null)}
              onLoadSample={() => {
                setName(visualWorkflowDemoDraft.name);
                setNodes(visualWorkflowDemoDraft.nodes);
                setEdges(visualWorkflowDemoDraft.edges);
                setSelectedNodeId(null);
                setPanelMode("picker");
                setAddFrom(null);
              }}
              onTestWorkflow={onTestWorkflowClick}
            />
          </VisualWorkflowCanvasActionsProvider>
          <aside className="flex w-[360px] shrink-0 flex-col border-l border-border bg-background">
            {showConfig && selectedNode ? (
              <VisualWorkflowConfigPanel
                node={selectedNode}
                issues={issues}
                onBack={() => {
                  setPanelMode("picker");
                  setSelectedNodeId(null);
                }}
                onChangeConfig={onChangeConfig}
              />
            ) : (
              <>
                <VisualWorkflowNodePicker
                  disableTriggers={hasTrigger || addFrom !== null}
                  onPick={addNode}
                />
                {issues.length > 0 ? (
                  <div className="border-t border-border px-4 py-3 text-sm text-destructive">
                    {issues.map((issue) => (
                      <p key={`${issue.code}-${issue.nodeId ?? issue.edgeId ?? "all"}`}>
                        {intl.formatMessage(issueMessage(issue.code))}
                      </p>
                    ))}
                  </div>
                ) : null}
              </>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}

function issueMessage(code: VisualWorkflowValidationIssue["code"]) {
  switch (code) {
    case "missing_trigger":
      return messages.missingTrigger;
    case "multiple_triggers":
      return messages.multipleTriggers;
    case "orphan_node":
      return messages.orphanNode;
    case "invalid_edge":
      return messages.invalidEdge;
    case "invalid_trigger_config":
      return messages.invalidTriggerConfig;
    case "nested_for_each":
      return messages.nestedForEach;
    default:
      return assertNever(code);
  }
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve();
      return;
    }
    const timeout = window.setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        window.clearTimeout(timeout);
        resolve();
      },
      { once: true },
    );
  });
}
