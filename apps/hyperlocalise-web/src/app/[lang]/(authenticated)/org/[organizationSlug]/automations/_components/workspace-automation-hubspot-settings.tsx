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
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { WorkspaceAutomationFormState } from "@/lib/agents/workspace-automation-view-model";
import type { HubspotExistingTranslationPolicy } from "@/lib/hubspot/existing-translation-policy";

import { HubspotResourceTree, toggleHubspotTreeSelection } from "./hubspot-resource-tree";

const HUBSPOT_EXISTING_TRANSLATION_POLICY_LABELS: Record<HubspotExistingTranslationPolicy, string> =
  {
    seed_empty: "Only empty locales",
    refresh_imported: "Refresh imported locales",
    overwrite_all: "Overwrite all locales",
  };

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
        Leave everything unchecked to import every email that is not already a locale copy. Tick
        items to translate only those. Push only updates drafts — it never publishes or sends.
      </p>

      <div className="space-y-2">
        <Label htmlFor="hubspot-existing-translation-policy">Existing HubSpot translations</Label>
        <Select
          value={form.hubspotExistingTranslationPolicy}
          onValueChange={(policy) => {
            if (
              policy !== "seed_empty" &&
              policy !== "refresh_imported" &&
              policy !== "overwrite_all"
            ) {
              return;
            }
            onChange({ ...form, hubspotExistingTranslationPolicy: policy });
          }}
        >
          <SelectTrigger id="hubspot-existing-translation-policy" className="w-full">
            <SelectValue>
              {HUBSPOT_EXISTING_TRANSLATION_POLICY_LABELS[form.hubspotExistingTranslationPolicy]}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {(
              Object.entries(HUBSPOT_EXISTING_TRANSLATION_POLICY_LABELS) as Array<
                [HubspotExistingTranslationPolicy, string]
              >
            ).map(([policy, label]) => (
              <SelectItem key={policy} value={policy} label={label}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          When a HubSpot locale copy already exists, import it into the project. The default never
          overwrites work already in Hyperlocalise.
        </p>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <Checkbox
          checked={form.hubspotOverwriteWhenRemoteNewer}
          onCheckedChange={(checked) =>
            onChange({ ...form, hubspotOverwriteWhenRemoteNewer: checked === true })
          }
        />
        Overwrite HubSpot copies when the remote copy is newer
      </label>
    </div>
  );
}
