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
import { useRouter } from "next/navigation";
import { useState, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import { FormattedMessage } from "react-intl";
import { toast } from "sonner";

import { useAppShellBreadcrumbAppend } from "@/components/app-shell/store/use-app-shell-breadcrumb";
import { useAppShellSidebar } from "@/components/app-shell/store/use-app-shell-sidebar";
import {
  fromVisualWorkflowV3Definition,
  toVisualWorkflowV3Definition,
} from "@/lib/visual-workflows/schema/serializers";
import {
  EMPTY_VISUAL_WORKFLOW_TEST_SETUP,
  type VisualWorkflowTestSetup,
} from "@/lib/visual-workflows/editor/visual-workflow-test-data";
import type { VisualWorkflowV3Definition } from "@/lib/visual-workflows/schema/types";
import type { VisualWorkflowRecord } from "@/lib/visual-workflows/visual-workflow-types";

import { useUnsavedChangesLeaveGuard } from "../../_components/unsaved-changes-leave-guard";
import { VisualWorkflowDeleteDialog } from "./visual-workflow-delete-dialog";
import {
  publishWorkflowVersion,
  createVisualWorkflowsApi,
  type VisualWorkflowsApi,
} from "./visual-workflows-api";
import { VisualWorkflowEditor } from "./visual-workflow-editor/visual-workflow-editor";
import { visualWorkflowEditorMessages } from "./visual-workflow-editor/visual-workflow-editor.messages";
import { visualWorkflowsPageMessages } from "./visual-workflows-page.messages";

const visualWorkflowsApi = createVisualWorkflowsApi();

export function VisualWorkflowEditorPageContent({
  organizationSlug,
  workflow,
  testSetup = EMPTY_VISUAL_WORKFLOW_TEST_SETUP,
  visualWorkflowsApi: injectedApi = visualWorkflowsApi,
}: {
  organizationSlug: string;
  workflow: VisualWorkflowRecord;
  /** The test data and test run choices saved with the draft. */
  testSetup?: VisualWorkflowTestSetup;
  visualWorkflowsApi?: VisualWorkflowsApi;
}) {
  const router = useRouter();
  const revision = useRef(workflow.revision);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  // The breadcrumb shows the name as last saved, so a rename appears there once it is saved.
  const [savedName, setSavedName] = useState(workflow.name);
  const workflowTitle = savedName.trim();
  useAppShellBreadcrumbAppend({
    id: "visual-workflow-detail",
    label: workflowTitle || undefined,
    title: workflowTitle || undefined,
  });
  useAppShellSidebar({ forceCollapsed: true });
  const editorState = fromVisualWorkflowV3Definition({
    ...workflow.definition,
    name: workflow.name,
  });
  // The workflow as the editor writes it, so that an untouched graph compares as saved.
  const [savedDefinition, setSavedDefinition] = useState(() =>
    toVisualWorkflowV3Definition(editorState),
  );
  const [savedTestSetup, setSavedTestSetup] = useState(testSetup);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const { leaveGuardDialog, leaveTo } = useUnsavedChangesLeaveGuard(hasUnsavedChanges);

  const persistMutation = useMutation({
    mutationFn: (input: {
      definition: VisualWorkflowV3Definition;
      testSetup?: VisualWorkflowTestSetup;
      status?: VisualWorkflowRecord["status"];
    }) =>
      injectedApi
        .updateVisualWorkflow(organizationSlug, workflow.id, {
          expectedRevision: revision.current,
          name: input.definition.name,
          definition: input.definition,
          ...(input.testSetup ? { testSetup: input.testSetup } : {}),
          ...(input.status ? { status: input.status } : {}),
        })
        .then((record) => {
          revision.current = record.revision;
          setSavedName(record.name);
          setSavedDefinition(input.definition);
          if (input.testSetup) setSavedTestSetup(input.testSetup);
          return record;
        }),
  });

  const saveMutation = {
    ...persistMutation,
    mutate: (definition: VisualWorkflowV3Definition, testSetup: VisualWorkflowTestSetup) => {
      persistMutation.mutate(
        { definition, testSetup },
        {
          onSuccess: () => {
            toast.success(<FormattedMessage {...visualWorkflowEditorMessages.saved} />);
          },
          onError: () => {
            toast.error(<FormattedMessage {...visualWorkflowEditorMessages.saveFailed} />);
          },
        },
      );
    },
    mutateAsync: persistMutation.mutateAsync,
    isPending: persistMutation.isPending,
  };

  const deleteMutation = useMutation({
    mutationFn: () => injectedApi.deleteVisualWorkflow(organizationSlug, workflow.id),
    onSuccess: () => {
      toast.success(<FormattedMessage {...visualWorkflowsPageMessages.deleteSuccess} />);
      // The workflow is gone, so its unsaved changes are not asked about.
      leaveTo(`/org/${organizationSlug}/automations/visual-workflows`);
    },
    onError: () => {
      toast.error(<FormattedMessage {...visualWorkflowsPageMessages.deleteFailed} />);
    },
  });

  const handleStatusChange = async (active: boolean, definition: VisualWorkflowV3Definition) => {
    try {
      await persistMutation.mutateAsync({
        definition,
        ...(active ? {} : { status: "paused" as const }),
      });
      if (active) {
        const published = await publishWorkflowVersion(
          organizationSlug,
          workflow.id,
          revision.current,
        );
        revision.current = published.revision;
      }
      router.refresh();
      toast.success(
        active ? (
          <FormattedMessage {...visualWorkflowEditorMessages.activated} />
        ) : (
          <FormattedMessage {...visualWorkflowEditorMessages.paused} />
        ),
      );
    } catch {
      toast.error(<FormattedMessage {...visualWorkflowEditorMessages.activateFailed} />);
    }
  };

  return (
    <div className="-mx-4 -my-4 flex h-[var(--app-shell-content-height)] min-h-0 flex-col overflow-hidden bg-background sm:-mx-6 lg:-mx-8">
      <VisualWorkflowEditor
        initialName={editorState.name}
        initialNodes={editorState.nodes}
        initialEdges={editorState.edges}
        initialTestSetup={testSetup}
        onSave={(definition, nextTestSetup) => saveMutation.mutate(definition, nextTestSetup)}
        isSaving={saveMutation.isPending}
        savedDefinition={savedDefinition}
        savedTestSetup={savedTestSetup}
        onUnsavedChangesChange={setHasUnsavedChanges}
        organizationSlug={organizationSlug}
        visualWorkflowId={workflow.id}
        visualWorkflowsApi={injectedApi}
        workflowStatus={workflow.status}
        onStatusChange={handleStatusChange}
        statusUpdating={saveMutation.isPending}
        onDelete={() => {
          if (saveMutation.isPending || deleteMutation.isPending) {
            return;
          }
          setDeleteDialogOpen(true);
        }}
        isDeleting={deleteMutation.isPending}
      />
      <VisualWorkflowDeleteDialog
        open={deleteDialogOpen}
        workflowName={workflow.name}
        isDeleting={deleteMutation.isPending}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={() => {
          if (saveMutation.isPending) {
            return;
          }
          deleteMutation.mutate();
        }}
      />
      {leaveGuardDialog}
    </div>
  );
}
