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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useIntl } from "react-intl";
import { toast } from "sonner";

import { runPlaygroundWorkflow } from "@/lib/visual-workflows/preview/playground-run";
import {
  createDefaultConfig,
  getVisualNodeDimensions,
  isTriggerType,
} from "@/lib/visual-workflows/catalog/node-catalog";
import {
  applyVisualWorkflowGraphConnection,
  applyNodeConfigUpdate,
  reconcileFlowBodyMembership,
  removeVisualWorkflowNode,
  replaceVisualWorkflowNodeType,
  reconnectVisualWorkflowGraphConnection,
} from "@/lib/visual-workflows/editor/visual-workflow-editor-graph";
import { visualWorkflowDefinitionsEqual } from "@/lib/visual-workflows/editor/visual-workflow-definition-equality";
import { markFreshVisualWorkflowSteps } from "@/lib/visual-workflows/editor/visual-workflow-fresh-steps";
import {
  nextVisualWorkflowNodeId,
  reservedVisualWorkflowNodeIds,
} from "@/lib/visual-workflows/editor/visual-workflow-node-id";
import { placeNewVisualWorkflowNode } from "@/lib/visual-workflows/editor/visual-workflow-node-placement";
import {
  isVisualWorkflowGraphEqual,
  isVisualWorkflowUndoStepOutOfSight,
  visualWorkflowUndoStackOptions,
  type VisualWorkflowGraph,
  type VisualWorkflowGraphChange,
} from "@/lib/visual-workflows/editor/visual-workflow-undo";
import { visualWorkflowDemoDraft } from "@/lib/visual-workflows/fixtures/demo-draft";
import { toVisualWorkflowV3Definition } from "@/lib/visual-workflows/schema/serializers";
import type {
  MockNodeRunStatus,
  VisualCatalogType,
  VisualNodeConfig,
  VisualWorkflowV3Definition,
  VisualWorkflowEditorState,
  VisualWorkflowRfEdge,
  VisualWorkflowRfNode,
} from "@/lib/visual-workflows/schema/types";
import type { VisualWorkflowStatus } from "@/lib/visual-workflows/visual-workflow-types";
import type { UndoOrigin } from "@/lib/undo-stack/undo-stack";
import { useUndoShortcuts } from "@/lib/undo-stack/use-undo-shortcuts";
import { useUndoStack } from "@/lib/undo-stack/use-undo-stack";
import { validateVisualWorkflowV3Definition } from "@/lib/visual-workflows/validation/validate-workflow-v3";
import {
  EMPTY_VISUAL_WORKFLOW_TEST_SETUP,
  buildTestRunData,
  canRunForReal,
  findMissingTestValues,
  findRealStepsFedByTestData,
  pruneTestSetup,
  realTestNodeIds,
  testDataFromRun,
  testFailureOf,
  type VisualWorkflowTestFailure,
  type VisualWorkflowTestSetup,
} from "@/lib/visual-workflows/editor/visual-workflow-test-data";

import {
  VisualWorkflowCanvas,
  type VisualWorkflowViewCenterReader,
} from "./visual-workflow-canvas";
import {
  VisualWorkflowCanvasActionsProvider,
  type VisualWorkflowAddFrom,
} from "./visual-workflow-canvas-actions";
import { VisualWorkflowChrome } from "./visual-workflow-chrome";
import {
  redactWorkflowSnapshot,
  collectWorkflowSecrets,
} from "@/lib/visual-workflows/runtime/snapshots";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { SlidersHorizontalIcon } from "@phosphor-icons/react";
import { VisualWorkflowConfigPanel, type StepSettingsTab } from "./visual-workflow-config-panel";
import { visualWorkflowNodeTitleMessage } from "./visual-workflow-node-picker";
import { VisualWorkflowEditorPanel } from "./visual-workflow-editor-panel";
import { VisualWorkflowExecutionsPanel } from "./visual-workflow-executions-panel";
import { VisualWorkflowIssueList } from "./visual-workflow-issue-list";
import {
  VisualWorkflowRealTestDialog,
  type RealTestStep,
} from "./visual-workflow-real-test-dialog";
import { visualWorkflowEditorMessages as messages } from "./visual-workflow-editor.messages";
import { VisualWorkflowNodePicker } from "./visual-workflow-node-picker";
import {
  useVisualWorkflowUndoNotice,
  VisualWorkflowUndoRedoButtons,
  type VisualWorkflowUndoStep,
} from "./visual-workflow-undo-buttons";
import type { VisualWorkflowsApi } from "../visual-workflows-api";

const NO_FRESH_STEPS: ReadonlySet<string> = new Set();

export function VisualWorkflowEditor({
  initialNodes = [],
  initialEdges = [],
  initialName,
  previewMode = false,
  playgroundMode = false,
  sampleDraft,
  initialTestSetup,
  onSave,
  isSaving = false,
  savedDefinition,
  savedTestSetup,
  onUnsavedChangesChange,
  organizationSlug,
  visualWorkflowId,
  visualWorkflowsApi,
  workflowStatus = "draft",
  onStatusChange,
  statusUpdating = false,
  onDelete,
  isDeleting = false,
}: {
  initialNodes?: VisualWorkflowRfNode[];
  initialEdges?: VisualWorkflowRfEdge[];
  initialName?: string;
  previewMode?: boolean;
  playgroundMode?: boolean;
  sampleDraft?: VisualWorkflowEditorState;
  /** The test data and test run choices saved with the draft. */
  initialTestSetup?: VisualWorkflowTestSetup;
  onSave?: (
    definition: VisualWorkflowV3Definition,
    testSetup: VisualWorkflowTestSetup,
  ) => void | Promise<void>;
  isSaving?: boolean;
  /** The workflow as last saved. With it, the editor reports whether its graph differs from it. */
  savedDefinition?: VisualWorkflowV3Definition;
  /** The test setup as last saved, compared like the graph. */
  savedTestSetup?: VisualWorkflowTestSetup;
  onUnsavedChangesChange?: (hasUnsavedChanges: boolean) => void;
  organizationSlug?: string;
  visualWorkflowId?: string;
  visualWorkflowsApi?: VisualWorkflowsApi;
  onPersistBeforeTest?: (definition: VisualWorkflowV3Definition) => Promise<unknown>;
  workflowStatus?: VisualWorkflowStatus;
  onStatusChange?: (
    active: boolean,
    definition: VisualWorkflowV3Definition,
  ) => void | Promise<void>;
  statusUpdating?: boolean;
  onDelete?: () => void;
  isDeleting?: boolean;
}) {
  // Each step's test data and test run choices; kept out of the steps, so editing them is no undo
  // step. They are saved with the draft.
  const [testSetup, setTestSetup] = useState<VisualWorkflowTestSetup>(
    initialTestSetup ?? EMPTY_VISUAL_WORKFLOW_TEST_SETUP,
  );
  const testData = testSetup.data;
  // Only a test run on the server can call out, so only there can a step run for real.
  const canTestForReal = Boolean(organizationSlug && visualWorkflowId && visualWorkflowsApi);
  const effectiveTestSetup = useMemo(
    () => (canTestForReal ? testSetup : { ...testSetup, realNodeIds: [] }),
    [canTestForReal, testSetup],
  );
  const [realTestSteps, setRealTestSteps] = useState<RealTestStep[]>([]);
  const [requestedTab, setRequestedTab] = useState<{ tab: StepSettingsTab; key: number }>();
  // The step a value under the pointer in the settings panel comes from, marked on the canvas.
  const [pointedNodeId, setPointedNodeId] = useState<string | null>(null);
  const intl = useIntl();
  const [activeTab, setActiveTab] = useState<"editor" | "executions">("editor");
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  // Every change to the graph, by hand or by the assistant, is a step on this one stack.
  const history = useUndoStack<VisualWorkflowGraph, VisualWorkflowGraphChange>(
    {
      name: initialName ?? intl.formatMessage(messages.untitledName),
      nodes: initialNodes,
      edges: initialEdges,
    },
    visualWorkflowUndoStackOptions,
  );
  const { name, nodes, edges } = history.form;
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [focusNode, setFocusNode] = useState<{ nodeId: string } | null>(null);
  const [panelMode, setPanelMode] = useState<"picker" | "config">("picker");
  const [addFrom, setAddFrom] = useState<VisualWorkflowAddFrom | null>(null);
  const [mobilePanelOpen, setMobilePanelOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const runAbortRef = useRef<AbortController | null>(null);
  const viewCenterRef = useRef<VisualWorkflowViewCenterReader | null>(null);
  // The graph as of the latest change, so changes made in one event build on each other before
  // the next render.
  const graphRef = useRef(history.form);
  graphRef.current = history.form;
  const historyRef = useRef(history);
  historyRef.current = history;
  const selectedNodeIdRef = useRef(selectedNodeId);
  selectedNodeIdRef.current = selectedNodeId;
  useEffect(() => {
    setPointedNodeId(null);
  }, [selectedNodeId]);
  // The graph as it was when a drag began, so the drop records one step from there.
  const dragStartRef = useRef<VisualWorkflowGraph | null>(null);
  const undoNotice = useVisualWorkflowUndoNotice();
  const undoNoticeRef = useRef(undoNotice);
  undoNoticeRef.current = undoNotice;

  /** Records a step. */
  const commit = useCallback((next: VisualWorkflowGraph, meta?: { origin?: UndoOrigin }) => {
    const previous = graphRef.current;
    graphRef.current = next;
    historyRef.current.change(next, meta);
    // A recorded step clears the redo stack, so a notice offering the way back no longer applies.
    if (!isVisualWorkflowGraphEqual(previous, next)) {
      undoNoticeRef.current.dismiss();
    }
  }, []);
  /** Sets the graph without a step: a drag in progress, a selection, a run marker. */
  const place = useCallback((next: VisualWorkflowGraph) => {
    graphRef.current = next;
    historyRef.current.replace(next);
  }, []);
  // Steps that appeared or were changed, and have not been selected since, which the canvas marks.
  const [freshNodeIds, setFreshNodeIds] = useState<ReadonlySet<string>>(NO_FRESH_STEPS);
  const seenNodesRef = useRef(nodes);
  useEffect(() => {
    const previous = seenNodesRef.current;
    seenNodesRef.current = nodes;
    setFreshNodeIds((marked) =>
      markFreshVisualWorkflowSteps({ marked, previous, next: nodes, selectedNodeId }),
    );
  }, [nodes, selectedNodeId]);
  /** Sets the graph and forgets every step. */
  const load = useCallback((next: VisualWorkflowGraph) => {
    graphRef.current = next;
    // A whole workflow put in place is not new step by step.
    seenNodesRef.current = next.nodes;
    historyRef.current.reset(next);
    undoNoticeRef.current.dismiss();
  }, []);
  const setNodes = useCallback(
    (
      update: (current: VisualWorkflowRfNode[]) => VisualWorkflowRfNode[],
      mode: "step" | "quiet" = "step",
    ) => {
      const current = graphRef.current;
      const next = { ...current, nodes: update(current.nodes) };
      if (mode === "step") {
        commit(next);
      } else {
        place(next);
      }
    },
    [commit, place],
  );
  /**
   * Like `setNodes`, for the edges. A change of selection alone is equal under the stack's
   * comparison, so either setter carries it without recording a step.
   */
  const setEdges = useCallback(
    (
      update: (current: VisualWorkflowRfEdge[]) => VisualWorkflowRfEdge[],
      mode: "step" | "quiet" = "step",
    ) => {
      const current = graphRef.current;
      const next = { ...current, edges: update(current.edges) };
      if (mode === "step") {
        commit(next);
      } else {
        place(next);
      }
    },
    [commit, place],
  );
  const setName = useCallback(
    (next: string) => commit({ ...graphRef.current, name: next }),
    [commit],
  );

  /**
   * Puts a step's graph back with the selection as it is now, not as it was then, so an undo
   * neither selects a node of the past nor closes the panel of the node being edited.
   */
  const restore = useCallback(
    (graph: VisualWorkflowGraph) => {
      const selected = selectedNodeIdRef.current;
      place({
        ...graph,
        nodes: graph.nodes.map((node) =>
          (node.selected ?? false) === (node.id === selected)
            ? node
            : { ...node, selected: node.id === selected },
        ),
        edges: graph.edges.map((edge) => (edge.selected ? { ...edge, selected: false } : edge)),
      });
    },
    [place],
  );
  // The step whose settings panel is open; a change to its settings shows there.
  const openNodeIdRef = useRef<string | null>(null);
  openNodeIdRef.current = panelMode === "config" ? selectedNodeId : null;
  // The notice's action runs after later renders, so it reads the callbacks as they are then.
  const undoActionsRef = useRef({ undo: () => {}, redo: () => {} });
  // What the latest undo or redo did, read out where no notice says it.
  const [undoAnnouncement, setUndoAnnouncement] = useState<{ id: number; text: string } | null>(
    null,
  );
  /** Says what an undo or a redo did: in a notice when the page does not show it, else aloud. */
  const reportUndo = useCallback((step: VisualWorkflowUndoStep, direction: "undo" | "redo") => {
    const notice = undoNoticeRef.current;
    if (isVisualWorkflowUndoStepOutOfSight(step, openNodeIdRef.current)) {
      if (direction === "undo") {
        notice.notifyUndo(step, () => undoActionsRef.current.redo());
      } else {
        notice.notifyRedo(step, () => undoActionsRef.current.undo());
      }
      return;
    }
    notice.dismiss();
    const text = direction === "undo" ? notice.undoTitle(step) : notice.redoTitle(step);
    setUndoAnnouncement((current) => ({ id: (current?.id ?? 0) + 1, text }));
  }, []);
  const runUndo = useCallback(() => {
    const step = historyRef.current.undoStep;
    if (!step) {
      return;
    }
    historyRef.current.undo();
    restore(step.before);
    reportUndo(step, "undo");
  }, [reportUndo, restore]);
  const runRedo = useCallback(() => {
    const step = historyRef.current.redoStep;
    if (!step) {
      return;
    }
    historyRef.current.redo();
    restore(step.after);
    reportUndo(step, "redo");
  }, [reportUndo, restore]);
  undoActionsRef.current = { undo: runUndo, redo: runRedo };
  const { rootRef } = useUndoShortcuts({
    onUndo: runUndo,
    onRedo: runRedo,
    onSeal: history.seal,
  });

  const selectedNode = nodes.find((node) => node.id === selectedNodeId) ?? null;
  const definition = useMemo(
    () => toVisualWorkflowV3Definition({ name, nodes, edges }),
    [edges, name, nodes],
  );
  const issues = useMemo(() => validateVisualWorkflowV3Definition(definition), [definition]);
  const prunedTestSetup = useMemo(
    () =>
      pruneTestSetup(
        testSetup,
        nodes.map((node) => node.id),
      ),
    [nodes, testSetup],
  );
  const hasUnsavedChanges = useMemo(
    () =>
      savedDefinition !== undefined &&
      (!visualWorkflowDefinitionsEqual(savedDefinition, definition) ||
        JSON.stringify(
          pruneTestSetup(
            savedTestSetup ?? EMPTY_VISUAL_WORKFLOW_TEST_SETUP,
            nodes.map((node) => node.id),
          ),
        ) !== JSON.stringify(prunedTestSetup)),
    [definition, nodes, prunedTestSetup, savedDefinition, savedTestSetup],
  );
  useEffect(() => {
    onUnsavedChangesChange?.(hasUnsavedChanges);
  }, [hasUnsavedChanges, onUnsavedChangesChange]);
  const issueNodeIds = useMemo(
    () => new Set(issues.flatMap((issue) => (issue.nodeId ? [issue.nodeId] : []))),
    [issues],
  );
  const hasTrigger = nodes.some((node) => isTriggerType(node.data.catalogType));
  const showConfig = panelMode === "config" && selectedNode !== null;
  // What the side panel shows, for the canvas's selection handler, which is told of a change of
  // selection after the render that caused it.
  const showConfigRef = useRef(showConfig);
  showConfigRef.current = showConfig;
  const saveDisabled = issues.length > 0;
  const isActive = workflowStatus === "active";

  const onNodesChange = useCallback(
    (changes: NodeChange<VisualWorkflowRfNode>[]) => {
      const current = graphRef.current;
      // A removed node takes its edges with it, in the same step.
      let graph = current;
      for (const change of changes) {
        if (change.type === "remove") {
          graph = { ...graph, ...removeVisualWorkflowNode(graph.nodes, graph.edges, change.id) };
        }
      }
      const next = {
        ...graph,
        nodes: applyNodeChanges(
          changes.filter((change) => change.type !== "remove"),
          graph.nodes,
        ),
      };
      const positions = changes.filter((change) => change.type === "position");
      if (positions.some((change) => change.dragging)) {
        dragStartRef.current ??= current;
        place(next);
        return;
      }
      // A node settles where it is dropped or where a key nudged it; the rest is selection
      // and measuring.
      if (positions.length === 0 && graph === current) {
        place(next);
        return;
      }
      if (dragStartRef.current) {
        // Back to where the drag began, keeping the selection and measurements made since.
        const flags = new Map(current.nodes.map((node) => [node.id, node]));
        place({
          ...dragStartRef.current,
          nodes: dragStartRef.current.nodes.map((node) => {
            const latest = flags.get(node.id);
            return latest
              ? { ...node, selected: latest.selected, measured: latest.measured }
              : node;
          }),
        });
        dragStartRef.current = null;
      }
      commit(next);
    },
    [commit, place],
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange<VisualWorkflowRfEdge>[]) => {
      const current = graphRef.current;
      const nextEdges = applyEdgeChanges(changes, current.edges);
      if (!changes.some((change) => change.type === "remove")) {
        place({ ...current, edges: nextEdges });
        return;
      }
      commit({
        ...current,
        edges: nextEdges,
        nodes: reconcileFlowBodyMembership(current.nodes, nextEdges),
      });
    },
    [commit, place],
  );

  // Deleting from the keyboard is one step for the nodes and their edges together.
  const onBeforeDelete = useCallback(
    async ({
      nodes: doomedNodes,
      edges: doomedEdges,
    }: {
      nodes: VisualWorkflowRfNode[];
      edges: VisualWorkflowRfEdge[];
    }) => {
      let graph = graphRef.current;
      for (const node of doomedNodes) {
        graph = { ...graph, ...removeVisualWorkflowNode(graph.nodes, graph.edges, node.id) };
      }
      const doomedEdgeIds = new Set(doomedEdges.map((edge) => edge.id));
      const edgesLeft = graph.edges.filter((edge) => !doomedEdgeIds.has(edge.id));
      if (edgesLeft.length !== graph.edges.length) {
        graph = {
          ...graph,
          edges: edgesLeft,
          nodes: reconcileFlowBodyMembership(graph.nodes, edgesLeft),
        };
      }
      commit(graph);
      if (doomedNodes.some((node) => node.id === selectedNodeIdRef.current)) {
        setSelectedNodeId(null);
        setPanelMode("picker");
        setAddFrom(null);
      }
      // The graph is already changed, so React Flow has nothing left to delete.
      return false;
    },
    [commit],
  );

  /** Takes away the data wire that feeds a setting of the open step. */
  const onDisconnectInput = useCallback(
    (portId: string) => {
      const current = graphRef.current;
      const nodeId = selectedNodeIdRef.current;
      const edges = current.edges.filter(
        (edge) =>
          !(edge.data?.kind === "data" && edge.target === nodeId && edge.targetHandle === portId),
      );
      if (edges.length === current.edges.length) {
        return;
      }
      commit({ ...current, edges, nodes: reconcileFlowBodyMembership(current.nodes, edges) });
    },
    [commit],
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      const current = graphRef.current;
      commit({
        ...current,
        ...applyVisualWorkflowGraphConnection(current.nodes, current.edges, connection),
      });
    },
    [commit],
  );

  const onReconnect = useCallback(
    (oldEdge: VisualWorkflowRfEdge, connection: Connection) => {
      const current = graphRef.current;
      commit({
        ...current,
        ...reconnectVisualWorkflowGraphConnection(
          current.nodes,
          current.edges,
          oldEdge.id,
          connection,
        ),
      });
    },
    [commit],
  );

  const onSelectionChange = useCallback((params: OnSelectionChangeParams) => {
    const nextId = params.nodes[0]?.id ?? null;
    setSelectedNodeId(nextId);
    if (nextId) {
      setPanelMode("config");
      setAddFrom(null);
      setMobilePanelOpen(true);
      return;
    }
    // A click on the canvas put the step's settings away. When the panel had already moved on to
    // the picker, it stays open.
    if (showConfigRef.current) {
      setMobilePanelOpen(false);
    }
  }, []);

  /** Takes the selection off the canvas, so a click on the same step selects it again. */
  const deselectNodes = useCallback(() => {
    setNodes((current) =>
      current.some((node) => node.selected)
        ? current.map((node) => (node.selected ? { ...node, selected: false } : node))
        : current,
    );
  }, [setNodes]);

  /** Selects a step from outside the canvas, as a click on it would. */
  const selectNode = useCallback((nodeId: string) => {
    setNodes((current) =>
      current.map((node) =>
        (node.selected ?? false) === (node.id === nodeId)
          ? node
          : { ...node, selected: node.id === nodeId },
      ),
    );
    setEdges((current) =>
      current.map((edge) => (edge.selected ? { ...edge, selected: false } : edge)),
    );
    setSelectedNodeId(nodeId);
    setPanelMode("config");
    setAddFrom(null);
    setMobilePanelOpen(true);
  }, []);

  /** Selects a step and brings it to the middle of the canvas. */
  const showNode = useCallback(
    (nodeId: string) => {
      selectNode(nodeId);
      setFocusNode({ nodeId });
    },
    [selectNode],
  );

  const closeMobilePanel = useCallback(() => {
    setMobilePanelOpen(false);
    setSelectedNodeId(null);
    setPanelMode("picker");
    setAddFrom(null);
    deselectNodes();
  }, [deselectNodes]);

  const openPicker = useCallback(
    (from: VisualWorkflowAddFrom | null = null) => {
      setAddFrom(from);
      setPanelMode("picker");
      setMobilePanelOpen(true);
      if (from) {
        setSelectedNodeId(null);
        deselectNodes();
      }
    },
    [deselectNodes],
  );

  // Every step id the editor has shown, so a deleted step's id is not given to a new step.
  const seenNodeIdsRef = useRef(new Set<string>());
  for (const node of nodes) seenNodeIdsRef.current.add(node.id);
  const testSetupRef = useRef(testSetup);
  testSetupRef.current = testSetup;

  const addNode = useCallback(
    (type: VisualCatalogType) => {
      const current = graphRef.current;
      const { nodes: currentNodes, edges: currentEdges } = current;
      const id = nextVisualWorkflowNodeId(
        type,
        currentNodes,
        reservedVisualWorkflowNodeIds({
          nodes: currentNodes,
          edges: currentEdges,
          setup: testSetupRef.current,
          seenNodeIds: seenNodeIdsRef.current,
        }),
      );
      const source = addFrom ? currentNodes.find((node) => node.id === addFrom.nodeId) : undefined;
      const config = createDefaultConfig(type);
      const size = getVisualNodeDimensions(type, config);
      const position = placeNewVisualWorkflowNode({
        nodes: currentNodes,
        source,
        handleId: addFrom?.handleId,
        viewCenter: viewCenterRef.current?.() ?? null,
        size,
      });

      // The new step is selected, as a click on it would leave it.
      const nextNode: VisualWorkflowRfNode = {
        id,
        type,
        position,
        selected: true,
        ...size,
        data: {
          catalogType: type,
          config,
          runStatus: "idle",
        },
      };
      const otherNodes = currentNodes.map((node) =>
        node.selected ? { ...node, selected: false } : node,
      );
      const otherEdges = currentEdges.map((edge) =>
        edge.selected ? { ...edge, selected: false } : edge,
      );

      if (source && !isTriggerType(type)) {
        commit({
          ...current,
          ...applyVisualWorkflowGraphConnection([...otherNodes, nextNode], otherEdges, {
            source: source.id,
            target: id,
            sourceHandle: addFrom?.handleId ?? null,
            targetHandle: null,
          }),
        });
      } else {
        commit({ ...current, nodes: [...otherNodes, nextNode], edges: otherEdges });
      }
      setAddFrom(null);
      setSelectedNodeId(id);
      setPanelMode("config");
      setMobilePanelOpen(true);
    },
    [addFrom, commit],
  );

  const onChangeConfig = useCallback(
    (config: VisualNodeConfig) => {
      if (!selectedNodeId) {
        return;
      }
      const current = graphRef.current;
      commit({
        ...current,
        ...applyNodeConfigUpdate(current.nodes, current.edges, selectedNodeId, config),
      });
    },
    [commit, selectedNodeId],
  );

  const onChangeNodeType = useCallback(
    (type: VisualCatalogType) => {
      if (!selectedNodeId) {
        return;
      }
      setNodes((current) =>
        current.map((node) =>
          node.id === selectedNodeId ? replaceVisualWorkflowNodeType(node, type) : node,
        ),
      );
    },
    [selectedNodeId, setNodes],
  );

  const onDeleteNode = useCallback(() => {
    if (!selectedNodeId) {
      return;
    }
    const current = graphRef.current;
    commit({
      ...current,
      ...removeVisualWorkflowNode(current.nodes, current.edges, selectedNodeId),
    });
    setSelectedNodeId(null);
    setPanelMode("picker");
    setAddFrom(null);
  }, [commit, selectedNodeId]);

  const setNodeOutputSnapshot = useCallback(
    (
      nodeId: string,
      output: Record<string, unknown> | null,
      error: Record<string, unknown> | null,
    ) => {
      setNodes(
        (current) =>
          current.map((node) =>
            node.id === nodeId
              ? {
                  ...node,
                  data: {
                    ...node.data,
                    lastOutput: output,
                    lastError: error,
                  },
                }
              : node,
          ),
        "quiet",
      );
    },
    [setNodes],
  );

  const setRunStatus = useCallback(
    (nodeId: string, status: MockNodeRunStatus) => {
      setNodes(
        (current) =>
          current.map((node) =>
            node.id === nodeId ? { ...node, data: { ...node.data, runStatus: status } } : node,
          ),
        "quiet",
      );
    },
    [setNodes],
  );

  const applyNodeRunStatuses = useCallback(
    (
      nodeRuns: Array<{
        nodeId: string;
        status: string;
        inputSnapshot?: Record<string, unknown>;
        outputSnapshot?: Record<string, unknown>;
        error?: Record<string, unknown> | null;
      }>,
    ) => {
      const runByNodeId = new Map(nodeRuns.map((nodeRun) => [nodeRun.nodeId, nodeRun]));
      setNodes(
        (current) =>
          current.map((node) => {
            const nodeRun = runByNodeId.get(node.id);
            if (!nodeRun) {
              return node;
            }
            const mappedStatus: MockNodeRunStatus =
              nodeRun.status === "queued" ? "idle" : (nodeRun.status as MockNodeRunStatus);
            return {
              ...node,
              data: {
                ...node.data,
                runStatus: mappedStatus,
                lastOutput:
                  nodeRun.outputSnapshot && Object.keys(nodeRun.outputSnapshot).length > 0
                    ? nodeRun.outputSnapshot
                    : null,
                lastInput: nodeRun.inputSnapshot ?? null,
                lastError: nodeRun.error ?? null,
              },
            };
          }),
        "quiet",
      );
    },
    [setNodes],
  );

  const missingTestValues = useMemo(
    () => findMissingTestValues({ nodes, edges, setup: effectiveTestSetup }),
    [edges, effectiveTestSetup, nodes],
  );
  const realNodeIds = useMemo(
    () => realTestNodeIds(nodes, effectiveTestSetup),
    [effectiveTestSetup, nodes],
  );
  const stepTitle = useCallback(
    (nodeId: string) => {
      const step = nodes.find((node) => node.id === nodeId);
      return step
        ? intl.formatMessage(visualWorkflowNodeTitleMessage(step.data.catalogType))
        : nodeId;
    },
    [intl, nodes],
  );

  const setStepTestData = useCallback((nodeId: string, value: Record<string, unknown>) => {
    setTestSetup((current) => ({ ...current, data: { ...current.data, [nodeId]: value } }));
  }, []);
  const setStepRunsForReal = useCallback((nodeId: string, real: boolean) => {
    setTestSetup((current) => ({
      ...current,
      realNodeIds: real
        ? [...new Set([...current.realNodeIds, nodeId])]
        : current.realNodeIds.filter((id) => id !== nodeId),
    }));
  }, []);
  const setStepFailure = useCallback(
    (nodeId: string, failure: VisualWorkflowTestFailure | undefined) => {
      setTestSetup((current) => {
        const failures = { ...current.failures };
        if (failure) failures[nodeId] = failure;
        else delete failures[nodeId];
        return { ...current, failures };
      });
    },
    [],
  );
  /** Sets every step that can run for real to do so, or every one to use its test data. */
  const setEveryStepRunsForReal = useCallback(
    (real: boolean) => {
      setTestSetup((current) => ({
        ...current,
        realNodeIds: real
          ? nodes.filter((node) => canRunForReal(node.data.catalogType)).map((node) => node.id)
          : [],
      }));
    },
    [nodes],
  );

  /** Starts a test run with the steps' test data and choices as they are. */
  const startTestRun = useCallback(async () => {
    const testRun = buildTestRunData({ nodes, setup: effectiveTestSetup });
    runAbortRef.current?.abort();
    const controller = new AbortController();
    runAbortRef.current = controller;
    setIsRunning(true);
    setNodes(
      (current) =>
        current.map((node) => ({
          ...node,
          data: { ...node.data, runStatus: "idle", lastOutput: null, lastError: null },
        })),
      "quiet",
    );

    try {
      if (organizationSlug && visualWorkflowId && visualWorkflowsApi) {
        const idempotencyKey = `manual-${visualWorkflowId}-${Date.now()}`;
        const { run } = await visualWorkflowsApi.createVisualWorkflowRun(
          organizationSlug,
          visualWorkflowId,
          {
            idempotencyKey,
            definition,
            inputSnapshot: testRun.triggerInput,
            mode: testRun.mode,
            mockOutputs: testRun.mockOutputs,
            realNodeIds: testRun.realNodeIds,
            mockFailures: testRun.mockFailures,
          },
        );

        const terminalStatuses = new Set([
          "succeeded",
          "failed",
          "cancelled",
          "skipped",
          "needs_attention",
        ]);
        setSelectedRunId(run.id);
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
        const result = await runPlaygroundWorkflow({
          name,
          nodes,
          edges,
          triggerInput: testRun.triggerInput,
          mockOutputs: testRun.mockOutputs,
          mockFailures: testRun.mockFailures,
          signal: controller.signal,
          onStatus: setRunStatus,
          onOutput: setNodeOutputSnapshot,
        });
        if (result === "failed") {
          toast.error(intl.formatMessage(messages.testRunFailed));
        }
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        toast.error(intl.formatMessage(messages.testRunCouldNotStart), {
          description: error instanceof Error ? error.message : undefined,
        });
      }
    } finally {
      if (!controller.signal.aborted) {
        setIsRunning(false);
      }
    }
  }, [
    applyNodeRunStatuses,
    effectiveTestSetup,
    definition,
    edges,
    intl,
    name,
    nodes,
    organizationSlug,
    setNodeOutputSnapshot,
    setNodes,
    setRunStatus,
    visualWorkflowId,
    visualWorkflowsApi,
  ]);

  const onTestWorkflowClick = useCallback(() => {
    // A test run invents no values, so one that lacks any is not started.
    const firstMissing = missingTestValues[0];
    if (firstMissing) {
      const step = nodes.find((node) => node.id === firstMissing.nodeId);
      toast.error(
        intl.formatMessage(messages.testRunMissingData, { count: missingTestValues.length }),
        {
          description: step
            ? intl.formatMessage(messages.testRunMissingDataFirst, {
                path: firstMissing.path,
                step: intl.formatMessage(visualWorkflowNodeTitleMessage(step.data.catalogType)),
              })
            : undefined,
          action: {
            label: intl.formatMessage(messages.testRunMissingDataShow),
            onClick: () => {
              showNode(firstMissing.nodeId);
              setRequestedTab({ tab: "test", key: Date.now() });
            },
          },
        },
      );
      return;
    }
    // A step that calls out for real is only run once the person has seen it named.
    if (realNodeIds.size > 0) {
      const fedBy = new Map(
        findRealStepsFedByTestData({ nodes, edges, setup: effectiveTestSetup }).map((entry) => [
          entry.nodeId,
          entry.mockedNodeIds,
        ]),
      );
      setRealTestSteps(
        nodes
          .filter((node) => realNodeIds.has(node.id))
          .map((node) => ({
            nodeId: node.id,
            title: stepTitle(node.id),
            fedBy: (fedBy.get(node.id) ?? []).map(stepTitle),
          })),
      );
      return;
    }
    void startTestRun();
  }, [
    edges,
    effectiveTestSetup,
    intl,
    missingTestValues,
    nodes,
    realNodeIds,
    showNode,
    startTestRun,
    stepTitle,
  ]);

  const draftJson = useCallback(
    () =>
      `${JSON.stringify(redactWorkflowSnapshot(definition, collectWorkflowSecrets(definition)), null, 2)}\n`,
    [definition],
  );

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
    if (!onSave) {
      return;
    }
    void onSave(definition, prunedTestSetup);
    setFreshNodeIds(NO_FRESH_STEPS);
  }, [definition, onSave, prunedTestSetup]);

  const handleStatusChange = useCallback(
    async (active: boolean) => {
      if (!onStatusChange || (active && saveDisabled)) {
        return;
      }
      await onStatusChange(active, definition);
    },
    [definition, onStatusChange, saveDisabled],
  );

  return (
    <div
      ref={rootRef}
      className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background"
      data-undo-root="visual-workflow"
    >
      <div role="status" className="sr-only">
        {undoAnnouncement ? <span key={undoAnnouncement.id}>{undoAnnouncement.text}</span> : null}
      </div>
      <VisualWorkflowChrome
        name={name}
        onNameChange={setName}
        undoRedo={
          <VisualWorkflowUndoRedoButtons
            canUndo={history.canUndo}
            canRedo={history.canRedo}
            undoStep={history.undoStep}
            redoStep={history.redoStep}
            onUndo={runUndo}
            onRedo={runRedo}
          />
        }
        copied={copied}
        onExport={onExport}
        onCopy={onCopy}
        onSave={onSave ? handleSave : undefined}
        isSaving={isSaving}
        saveDisabled={false}
        previewMode={previewMode}
        playgroundMode={playgroundMode}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        workflowStatus={workflowStatus}
        onStatusChange={onStatusChange ? handleStatusChange : undefined}
        statusDisabled={statusUpdating || (!isActive && saveDisabled)}
        onDelete={onDelete}
        isDeleting={isDeleting}
      />
      <VisualWorkflowRealTestDialog
        steps={realTestSteps}
        onOpenChange={(open) => {
          if (!open) setRealTestSteps([]);
        }}
        onConfirm={() => {
          setRealTestSteps([]);
          void startTestRun();
        }}
      />
      {activeTab === "executions" && organizationSlug && visualWorkflowId && visualWorkflowsApi ? (
        <VisualWorkflowExecutionsPanel
          organizationSlug={organizationSlug}
          visualWorkflowId={visualWorkflowId}
          visualWorkflowsApi={visualWorkflowsApi}
          selectedRunId={selectedRunId}
          onSelectRun={setSelectedRunId}
          onUseRunAsTestData={(nodeRuns) => {
            const fromRun = testDataFromRun(nodes, nodeRuns);
            setTestSetup((current) => ({ ...current, data: { ...current.data, ...fromRun } }));
            toast.success(
              intl.formatMessage(messages.usedRunAsTestData, {
                count: Object.keys(fromRun).length,
              }),
            );
          }}
        />
      ) : (
        <div className="relative flex min-h-0 min-w-0 flex-1">
          <VisualWorkflowCanvasActionsProvider
            onAddFromNode={openPicker}
            issueNodeIds={issueNodeIds}
            freshNodeIds={freshNodeIds}
            pointedNodeId={pointedNodeId}
            realNodeIds={realNodeIds}
          >
            <VisualWorkflowCanvas
              nodes={nodes}
              edges={edges}
              isRunning={isRunning}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onBeforeDelete={onBeforeDelete}
              onConnect={onConnect}
              onReconnect={onReconnect}
              onSelectionChange={onSelectionChange}
              focusNode={focusNode}
              viewCenterRef={viewCenterRef}
              onAddFirstStep={() => openPicker(null)}
              onLoadSample={() => {
                const draft = sampleDraft ?? visualWorkflowDemoDraft;
                load({ name: draft.name, nodes: draft.nodes, edges: draft.edges });
                setSelectedNodeId(null);
                setPanelMode("picker");
                setAddFrom(null);
                setMobilePanelOpen(false);
              }}
              onTestWorkflow={onTestWorkflowClick}
              testSettings={
                organizationSlug ? (
                  <Popover>
                    <PopoverTrigger
                      render={
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="bg-background shadow-xs"
                          aria-label={intl.formatMessage(messages.testSettings)}
                          title={intl.formatMessage(messages.testSettings)}
                        />
                      }
                    >
                      <SlidersHorizontalIcon />
                    </PopoverTrigger>
                    <PopoverContent align="center" side="top" className="w-80">
                      <PopoverHeader>
                        <PopoverTitle>{intl.formatMessage(messages.testSettings)}</PopoverTitle>
                        <PopoverDescription>
                          {intl.formatMessage(messages.testSettingsHint)}
                        </PopoverDescription>
                      </PopoverHeader>
                      <div className="mt-3 grid gap-2">
                        <p className="text-sm">
                          {intl.formatMessage(messages.testSettingsRealCount, {
                            count: realNodeIds.size,
                          })}
                        </p>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={realNodeIds.size === 0}
                            onClick={() => setEveryStepRunsForReal(false)}
                          >
                            {intl.formatMessage(messages.testSettingsUseTestDataEverywhere)}
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={
                              realNodeIds.size ===
                              nodes.filter((node) => canRunForReal(node.data.catalogType)).length
                            }
                            onClick={() => setEveryStepRunsForReal(true)}
                          >
                            {intl.formatMessage(messages.testSettingsRunEverythingForReal)}
                          </Button>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {intl.formatMessage(messages.testSettingsAllRealNote)}
                        </p>
                      </div>
                    </PopoverContent>
                  </Popover>
                ) : null
              }
            />
            <div data-testid="visual-workflow-graph-edges" hidden>
              {edges.map((edge) => (
                <span
                  key={edge.id}
                  data-testid={`visual-workflow-edge-${edge.source}-${edge.target}-${edge.sourceHandle ?? "out"}`}
                />
              ))}
            </div>
          </VisualWorkflowCanvasActionsProvider>
          <VisualWorkflowEditorPanel
            open={mobilePanelOpen}
            onClose={closeMobilePanel}
            onOpenPicker={() => openPicker(null)}
          >
            {showConfig && selectedNode ? (
              <VisualWorkflowConfigPanel
                node={selectedNode}
                organizationSlug={organizationSlug}
                nodes={nodes}
                edges={edges}
                onChangeContract={(patch) =>
                  setNodes((current) =>
                    current.map((node) =>
                      node.id === selectedNode.id
                        ? { ...node, data: { ...node.data, ...patch } }
                        : node,
                    ),
                  )
                }
                issues={issues}
                onSelectNode={selectNode}
                onShowNode={showNode}
                onBack={() => {
                  setPanelMode("picker");
                  setSelectedNodeId(null);
                  deselectNodes();
                }}
                onChangeConfig={onChangeConfig}
                onChangeNodeType={onChangeNodeType}
                onDeleteNode={onDeleteNode}
                testData={testData[selectedNode.id]}
                allTestData={testData}
                missingTestValues={missingTestValues.filter(
                  (entry) => entry.nodeId === selectedNode.id,
                )}
                onChangeTestData={(value) => setStepTestData(selectedNode.id, value)}
                testRunsForReal={realNodeIds.has(selectedNode.id)}
                onChangeTestRunsForReal={
                  canTestForReal ? (real) => setStepRunsForReal(selectedNode.id, real) : undefined
                }
                testFailure={testFailureOf(selectedNode, effectiveTestSetup)}
                onChangeTestFailure={(failure) => setStepFailure(selectedNode.id, failure)}
                requestedTab={requestedTab}
                onDisconnectInput={onDisconnectInput}
                onPointStep={setPointedNodeId}
              />
            ) : (
              <>
                <VisualWorkflowNodePicker
                  disableTriggers={hasTrigger || addFrom !== null}
                  onPick={addNode}
                />
                <VisualWorkflowIssueList
                  issues={issues}
                  nodes={nodes}
                  onSelectNode={selectNode}
                  onShowNode={showNode}
                />
              </>
            )}
          </VisualWorkflowEditorPanel>
        </div>
      )}
    </div>
  );
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
