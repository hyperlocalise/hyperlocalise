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
import Link from "next/link";
import { useMutation } from "@tanstack/react-query";
import { FormattedMessage } from "react-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { fromVisualWorkflowDefinition } from "@/lib/visual-workflows/schema/serializers";
import type { VisualWorkflowDefinition } from "@/lib/visual-workflows/schema/types";
import type { VisualWorkflowRecord } from "@/lib/visual-workflows/visual-workflow-types";

import { createVisualWorkflowsApi } from "./visual-workflows-api";
import { VisualWorkflowEditor } from "./visual-workflow-editor/visual-workflow-editor";
import { visualWorkflowEditorMessages } from "./visual-workflow-editor/visual-workflow-editor.messages";

const visualWorkflowsApi = createVisualWorkflowsApi();

export function VisualWorkflowEditorPageContent({
  organizationSlug,
  workflow,
  visualWorkflowsApi: injectedApi = visualWorkflowsApi,
}: {
  organizationSlug: string;
  workflow: VisualWorkflowRecord;
  visualWorkflowsApi?: typeof visualWorkflowsApi;
}) {
  const editorState = fromVisualWorkflowDefinition({
    ...workflow.definition,
    name: workflow.name,
  });

  const saveMutation = useMutation({
    mutationFn: (definition: VisualWorkflowDefinition) =>
      injectedApi.updateVisualWorkflow(organizationSlug, workflow.id, {
        name: definition.name,
        definition,
      }),
    onSuccess: () => {
      toast.success(<FormattedMessage {...visualWorkflowEditorMessages.saved} />);
    },
    onError: () => {
      toast.error(<FormattedMessage {...visualWorkflowEditorMessages.saveFailed} />);
    },
  });

  return (
    <div className="flex h-[calc(100dvh-3.5rem)] min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b border-border px-4 py-2">
        <Button
          nativeButton={false}
          render={<Link href={`/org/${organizationSlug}/automations/visual-workflows`} />}
          variant="ghost"
          size="sm"
        >
          <FormattedMessage
            defaultMessage="Back to workflows"
            id="kv8FmMqNvG"
            description="Link from the visual workflow editor back to the list page"
          />
        </Button>
      </div>
      <VisualWorkflowEditor
        initialName={editorState.name}
        initialNodes={editorState.nodes}
        initialEdges={editorState.edges}
        onSave={(definition) => saveMutation.mutate(definition)}
        isSaving={saveMutation.isPending}
      />
    </div>
  );
}
