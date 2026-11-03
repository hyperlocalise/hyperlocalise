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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { WorkspaceAutomationFormState } from "@/lib/agents/workspace-automation-view-model";

import { MailchimpResourceTree, toggleMailchimpTreeSelection } from "./mailchimp-resource-tree";

type MailchimpExistingTranslationPolicy = "seed_empty" | "refresh_imported" | "overwrite_all";

const MAILCHIMP_EXISTING_TRANSLATION_POLICY_LABELS: Record<
  MailchimpExistingTranslationPolicy,
  string
> = {
  seed_empty: "Only empty locales",
  refresh_imported: "Refresh imported locales",
  overwrite_all: "Overwrite all locales",
};

export function WorkspaceAutomationMailchimpSettings({
  organizationSlug,
  form,
  mailchimpConnected,
  disabled,
  onChange,
}: {
  organizationSlug: string;
  form: WorkspaceAutomationFormState;
  mailchimpConnected: boolean;
  disabled?: boolean;
  onChange: (next: WorkspaceAutomationFormState) => void;
}) {
  return (
    <div className="space-y-2">
      <span className="text-sm font-medium">Content to translate (optional)</span>
      <MailchimpResourceTree
        organizationSlug={organizationSlug}
        enabled={form.mailchimpEnabled && mailchimpConnected}
        connected={mailchimpConnected}
        disabled={disabled}
        selection={{
          campaign: form.mailchimpCampaignIds,
          template: form.mailchimpTemplateIds,
        }}
        onToggle={(kind, id) => onChange(toggleMailchimpTreeSelection(form, kind, id))}
      />
      <p className="text-xs text-muted-foreground">
        Tick campaigns or templates to import. Leave all unchecked to import everything visible.
        Push writes draft copies only — it never sends or schedules.
      </p>

      <div className="space-y-2">
        <Label htmlFor="mailchimp-existing-translation-policy">
          Existing Mailchimp translations
        </Label>
        <Select
          value={form.mailchimpExistingTranslationPolicy}
          onValueChange={(policy) => {
            if (
              policy !== "seed_empty" &&
              policy !== "refresh_imported" &&
              policy !== "overwrite_all"
            ) {
              return;
            }
            onChange({ ...form, mailchimpExistingTranslationPolicy: policy });
          }}
        >
          <SelectTrigger id="mailchimp-existing-translation-policy" className="w-full">
            <SelectValue>
              {
                MAILCHIMP_EXISTING_TRANSLATION_POLICY_LABELS[
                  form.mailchimpExistingTranslationPolicy
                ]
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {(
              Object.entries(MAILCHIMP_EXISTING_TRANSLATION_POLICY_LABELS) as Array<
                [MailchimpExistingTranslationPolicy, string]
              >
            ).map(([policy, label]) => (
              <SelectItem key={policy} value={policy} label={label}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          On import, prefill target locales from Mailchimp draft copies named{" "}
          <code className="text-xs">{`{source} [locale]`}</code> when they exist.
        </p>
      </div>
    </div>
  );
}
