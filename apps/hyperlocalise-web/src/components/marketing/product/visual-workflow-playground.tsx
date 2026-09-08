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
import dynamic from "next/dynamic";
import { FormattedMessage } from "react-intl";

import { visualWorkflowCampaignPagesDraft } from "@/lib/visual-workflows/fixtures/campaign-pages-draft";

import { visualWorkflowPlaygroundMessages } from "./visual-workflow-playground.messages";

export function VisualWorkflowPlaygroundLoadingShell() {
  return (
    <div
      aria-hidden
      className="h-[min(36rem,70svh)] min-h-[28rem] overflow-hidden rounded-xl border border-border bg-muted/20"
    />
  );
}

const VisualWorkflowEditor = dynamic(
  () =>
    import("@/app/[lang]/(authenticated)/org/[organizationSlug]/automations/_components/visual-workflow-editor/visual-workflow-editor").then(
      (module) => module.VisualWorkflowEditor,
    ),
  {
    loading: VisualWorkflowPlaygroundLoadingShell,
    ssr: false,
  },
);

export function VisualWorkflowPlayground() {
  return (
    <div className="space-y-10">
      <div className="max-w-xl">
        <p className="mb-2 text-xs font-semibold tracking-[0.18em] text-primary uppercase">
          <FormattedMessage {...visualWorkflowPlaygroundMessages.sectionEyebrow} />
        </p>
        <h3 className="mt-5 font-heading text-3xl font-semibold leading-tight tracking-normal text-balance sm:text-4xl">
          <FormattedMessage {...visualWorkflowPlaygroundMessages.sectionHeadline} />
        </h3>
        <p className="mt-6 text-lg leading-8 text-muted-foreground">
          <FormattedMessage {...visualWorkflowPlaygroundMessages.sectionDescription} />
        </p>
      </div>

      <div className="flex h-[min(36rem,70svh)] min-h-[28rem] flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl shadow-gray-alpha-100">
        <VisualWorkflowEditor
          initialName={visualWorkflowCampaignPagesDraft.name}
          initialNodes={visualWorkflowCampaignPagesDraft.nodes}
          initialEdges={visualWorkflowCampaignPagesDraft.edges}
          sampleDraft={visualWorkflowCampaignPagesDraft}
          previewMode
          playgroundMode
        />
      </div>
    </div>
  );
}
