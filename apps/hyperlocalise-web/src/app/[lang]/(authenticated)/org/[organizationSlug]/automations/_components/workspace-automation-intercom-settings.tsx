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
import { useQuery } from "@tanstack/react-query";

import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { apiClient } from "@/lib/api-client-instance";
import type { WorkspaceAutomationFieldErrors } from "@/lib/agents/workspace-automation-view-model";
import type { WorkspaceAutomationFormState } from "@/lib/agents/workspace-automation-view-model";

type HelpCenterOption = {
  id: string;
  displayName: string;
  defaultLocale: string | null;
  locales: string[];
};

export function WorkspaceAutomationIntercomSettings({
  organizationSlug,
  form,
  errors,
  intercomConnected,
  onChange,
}: {
  organizationSlug: string;
  form: WorkspaceAutomationFormState;
  errors: WorkspaceAutomationFieldErrors;
  intercomConnected: boolean;
  onChange: (next: WorkspaceAutomationFormState) => void;
}) {
  const helpCentersQuery = useQuery({
    queryKey: ["intercom-help-centers", organizationSlug, form.intercomRestEndpoint],
    enabled: form.intercomEnabled && intercomConnected,
    queryFn: async () => {
      const response = await apiClient.api.orgs[":organizationSlug"].intercom["help-centers"].$get({
        param: { organizationSlug },
        query: { restEndpoint: form.intercomRestEndpoint },
      });
      if (!response.ok) {
        throw new Error("Failed to load Intercom help centers");
      }
      const body = await response.json();
      return body.helpCenters as HelpCenterOption[];
    },
  });

  const helpCenters = helpCentersQuery.data ?? [];
  const selectedHelpCenter = helpCenters.find((center) => center.id === form.intercomHelpCenterId);

  return (
    <div className="space-y-4 rounded-lg border border-border p-4">
      <div className="space-y-2">
        <Label htmlFor="intercom-rest-endpoint">Intercom region</Label>
        <Select
          value={form.intercomRestEndpoint}
          onValueChange={(value) => {
            if (value !== "us" && value !== "eu" && value !== "au") {
              return;
            }
            onChange({
              ...form,
              intercomRestEndpoint: value,
              intercomHelpCenterId: "",
              intercomHelpCenterLocales: [],
            });
          }}
        >
          <SelectTrigger id="intercom-rest-endpoint">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="us">United States</SelectItem>
            <SelectItem value="eu">European Union</SelectItem>
            <SelectItem value="au">Australia</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="intercom-help-center">Help Center</Label>
        {helpCentersQuery.isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Spinner />
            Loading help centers…
          </div>
        ) : (
          <Select
            value={form.intercomHelpCenterId || undefined}
            onValueChange={(helpCenterId) => {
              if (!helpCenterId) {
                return;
              }
              const center = helpCenters.find((item) => item.id === helpCenterId);
              onChange({
                ...form,
                intercomHelpCenterId: helpCenterId,
                intercomHelpCenterLocales: center?.locales ? [...center.locales] : [],
                intercomSourceLocale: center?.defaultLocale?.trim() || form.intercomSourceLocale,
              });
            }}
            disabled={!intercomConnected || helpCenters.length === 0}
          >
            <SelectTrigger
              id="intercom-help-center"
              aria-invalid={Boolean(errors.intercomHelpCenterId)}
            >
              <SelectValue placeholder="Select a help center" />
            </SelectTrigger>
            <SelectContent>
              {helpCenters.map((center) => (
                <SelectItem key={center.id} value={center.id}>
                  {center.displayName || center.id}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {errors.intercomHelpCenterId ? (
          <p data-slot="field-error" className="text-sm text-destructive">
            {errors.intercomHelpCenterId}
          </p>
        ) : null}
        {selectedHelpCenter?.locales.length ? (
          <p className="text-xs text-muted-foreground">
            Locales: {selectedHelpCenter.locales.join(", ")}
          </p>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="intercom-source-locale">Intercom source locale</Label>
        <Input
          id="intercom-source-locale"
          value={form.intercomSourceLocale}
          onChange={(event) => onChange({ ...form, intercomSourceLocale: event.target.value })}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="intercom-collection-ids">Collection IDs (optional)</Label>
        <Input
          id="intercom-collection-ids"
          placeholder="Comma-separated collection IDs"
          value={form.intercomCollectionIds.join(", ")}
          onChange={(event) =>
            onChange({
              ...form,
              intercomCollectionIds: event.target.value
                .split(",")
                .map((value) => value.trim())
                .filter(Boolean),
            })
          }
        />
      </div>

      <label className="flex items-center gap-2 text-sm">
        <Checkbox
          checked={form.intercomIncludeDrafts}
          onCheckedChange={(checked) =>
            onChange({ ...form, intercomIncludeDrafts: checked === true })
          }
        />
        Include draft articles on import
      </label>

      <label className="flex items-center gap-2 text-sm">
        <Checkbox
          checked={form.intercomOverwriteIntercomDrafts}
          onCheckedChange={(checked) =>
            onChange({ ...form, intercomOverwriteIntercomDrafts: checked === true })
          }
        />
        Overwrite Intercom drafts when remote target is newer (when enabled)
      </label>
    </div>
  );
}
