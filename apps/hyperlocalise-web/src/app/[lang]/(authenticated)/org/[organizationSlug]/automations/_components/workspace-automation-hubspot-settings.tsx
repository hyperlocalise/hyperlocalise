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
import type { WorkspaceAutomationFormState } from "@/lib/agents/workspace-automation-view-model";

import { HubspotResourceTree, toggleHubspotTreeSelection } from "./hubspot-resource-tree";

export function WorkspaceAutomationHubspotSettings({
  organizationSlug,
  form,
  hubspotConnected,
  disabled,
  onChange,
}: {
  organizationSlug: string;
  form: WorkspaceAutomationFormState;
  hubspotConnected: boolean;
  disabled?: boolean;
  onChange: (next: WorkspaceAutomationFormState) => void;
}) {
  return (
    <div className="space-y-2">
      <span className="text-sm font-medium">Content to translate (optional)</span>
      <HubspotResourceTree
        organizationSlug={organizationSlug}
        enabled={form.hubspotEnabled && hubspotConnected}
        connected={hubspotConnected}
        disabled={disabled}
        selection={{
          email: form.hubspotEmailIds,
          form: form.hubspotFormIds,
          blog: form.hubspotBlogPostIds,
          "landing-page": form.hubspotLandingPageIds,
          "website-page": form.hubspotWebsitePageIds,
          "message-template": form.hubspotMessageTemplateIds,
        }}
        onToggle={(kind, id) => onChange(toggleHubspotTreeSelection(form, kind, id))}
      />
      <p className="text-xs text-muted-foreground">
        Leave everything unchecked to import every email, form, blog post, landing page, website
        page, and message template that is not already a locale copy. Tick items to translate only
        those. Push only updates drafts — it never publishes or sends.
      </p>
    </div>
  );
}
