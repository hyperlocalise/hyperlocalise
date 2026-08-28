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

import { runFakeWorkflow } from "@/lib/visual-workflows/mock/fake-run";
import {
  createDefaultConfig,
  getVisualNodeDimensions,
  isTriggerType,
} from "@/lib/visual-workflows/mock/node-catalog";
import { visualWorkflowDemoDraft } from "@/lib/visual-workflows/mock/demo-draft";
import { toCanonicalDraft } from "@/lib/visual-workflows/mock/to-canonical-draft";
import type {
  MockNodeRunStatus,
  VisualCatalogType,
  VisualNodeConfig,
  VisualWorkflowRfEdge,
  VisualWorkflowRfNode,
} from "@/lib/visual-workflows/mock/types";
import { validateMockWorkflow } from "@/lib/visual-workflows/mock/validate-mock-workflow";

import { applyVisualWorkflowConnection, VisualWorkflowCanvas } from "./visual-workflow-canvas";
import {
  VisualWorkflowCanvasActionsProvider,
  type VisualWorkflowAddFrom,
} from "./visual-workflow-canvas-actions";
import { VisualWorkflowChrome } from "./visual-workflow-chrome";
import { VisualWorkflowConfigPanel } from "./visual-workflow-config-panel";
import { visualWorkflowEditorMessages as messages } from "./visual-workflow-editor.messages";
import { VisualWorkflowNodePicker } from "./visual-workflow-node-picker";

const NODE_GAP_X = 260;
const NODE_GAP_Y = 36;

export function VisualWorkflowEditor({
  initialNodes = [],
  initialEdges = [],
  initialName,
}: {
  initialNodes?: VisualWorkflowRfNode[];
  initialEdges?: VisualWorkflowRfEdge[];
  initialName?: string;
}) {
  const intl = useIntl();
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
  const issues = useMemo(() => validateMockWorkflow(nodes, edges), [nodes, edges]);
  const hasTrigger = nodes.some((node) => isTriggerType(node.data.catalogType));
  const showConfig = panelMode === "config" && selectedNode !== null;

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

  const onTestWorkflow = useCallback(async () => {
    runAbortRef.current?.abort();
    const controller = new AbortController();
    runAbortRef.current = controller;
    setIsRunning(true);
    setNodes((current) =>
      current.map((node) => ({ ...node, data: { ...node.data, runStatus: "idle" } })),
    );
    await runFakeWorkflow({
      nodes,
      edges,
      signal: controller.signal,
      onStatus: setRunStatus,
    });
    setIsRunning(false);
  }, [edges, nodes, setRunStatus]);

  const draftJson = useCallback(() => {
    return `${JSON.stringify(toCanonicalDraft({ name, nodes, edges }), null, 2)}\n`;
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

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
      <VisualWorkflowChrome
        name={name}
        onNameChange={setName}
        copied={copied}
        onExport={onExport}
        onCopy={onCopy}
      />
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
            onTestWorkflow={onTestWorkflow}
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
                    <p key={`${issue.code}-${issue.nodeId ?? "all"}`}>
                      {intl.formatMessage(
                        issue.code === "missing_trigger"
                          ? messages.missingTrigger
                          : issue.code === "multiple_triggers"
                            ? messages.multipleTriggers
                            : messages.orphanNode,
                      )}
                    </p>
                  ))}
                </div>
              ) : null}
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
