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
import { useIntl } from "react-intl";

import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
  WorkspaceAutomationFieldErrors,
  WorkspaceAutomationFormState,
} from "@/lib/agents/workspace-automation-view-model";
import { formatLocaleOptionLabel } from "@/lib/i18n/locale-display-names.messages";

import { CustomerIoResourceTree, toggleCustomerIoTreeSelection } from "./customer-io-resource-tree";

type ExistingTranslationPolicy = "seed_empty" | "refresh_imported" | "overwrite_all";

const POLICY_LABELS: Record<ExistingTranslationPolicy, string> = {
  seed_empty: "Only empty locales",
  refresh_imported: "Refresh imported locales",
  overwrite_all: "Overwrite all locales",
};

function uniqueLocales(values: Array<string | null | undefined>): string[] {
  const locales: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const locale = value?.trim();
    if (!locale || seen.has(locale)) {
      continue;
    }
    seen.add(locale);
    locales.push(locale);
  }
  return locales;
}

export function WorkspaceAutomationCustomerIoSettings({
  organizationSlug,
  form,
  errors,
  customerIoConnected,
  projectSourceLocale,
  projectTargetLocales,
  onChange,
}: {
  organizationSlug: string;
  form: WorkspaceAutomationFormState;
  errors: WorkspaceAutomationFieldErrors;
  customerIoConnected: boolean;
  projectSourceLocale?: string | null;
  projectTargetLocales?: string[];
  onChange: (next: WorkspaceAutomationFormState) => void;
}) {
  const intl = useIntl();
  const pickersEnabled = form.customerIoEnabled && customerIoConnected;
  const sourceLocaleOptions = uniqueLocales([
    projectSourceLocale,
    form.customerIoSourceLocale,
    ...(projectTargetLocales ?? []),
  ]);

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Only email (rich-text/code editor), push, Twilio SMS, and Slack actions are eligible.
        Drag-and-drop emails, transactional SMS, in-app messages, and multilingual A/B variants are
        skipped. Locales must already exist on the Customer.io action.
      </p>
      <div className="space-y-2">
        <Label htmlFor="customer-io-source-locale">Source locale</Label>
        <Select
          value={form.customerIoSourceLocale}
          onValueChange={(locale) => {
            if (typeof locale === "string") {
              onChange({ ...form, customerIoSourceLocale: locale });
            }
          }}
        >
          <SelectTrigger id="customer-io-source-locale" className="w-full">
            <SelectValue>
              {form.customerIoSourceLocale
                ? formatLocaleOptionLabel(intl, form.customerIoSourceLocale)
                : "Choose a source locale"}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {sourceLocaleOptions.map((locale) => (
              <SelectItem key={locale} value={locale} label={formatLocaleOptionLabel(intl, locale)}>
                {formatLocaleOptionLabel(intl, locale)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <span className="text-sm font-medium">Content to translate (optional)</span>
        <CustomerIoResourceTree
          organizationSlug={organizationSlug}
          enabled={pickersEnabled}
          connected={customerIoConnected}
          selection={{
            broadcast: form.customerIoBroadcastIds,
            campaign: form.customerIoCampaignIds,
            newsletter: form.customerIoNewsletterIds,
            transactional: form.customerIoTransactionalMessageIds,
          }}
          onToggle={(kind, id) => {
            onChange(toggleCustomerIoTreeSelection(form, kind, id));
          }}
        />
        <p className="text-xs text-muted-foreground">
          Leave everything unchecked to discover all broadcasts, campaigns, newsletters, and
          transactional messages. Expand a resource to preview its message actions. Push only
          updates content — it never sends.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="customer-io-existing-translation-policy">Existing translations</Label>
        <Select
          value={form.customerIoExistingTranslationPolicy}
          onValueChange={(policy) => {
            if (
              policy !== "seed_empty" &&
              policy !== "refresh_imported" &&
              policy !== "overwrite_all"
            ) {
              return;
            }
            onChange({ ...form, customerIoExistingTranslationPolicy: policy });
          }}
        >
          <SelectTrigger id="customer-io-existing-translation-policy" className="w-full">
            <SelectValue>{POLICY_LABELS[form.customerIoExistingTranslationPolicy]}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {(Object.entries(POLICY_LABELS) as Array<[ExistingTranslationPolicy, string]>).map(
              ([policy, label]) => (
                <SelectItem key={policy} value={policy} label={label}>
                  {label}
                </SelectItem>
              ),
            )}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          When Customer.io already has a locale, import it into the project. The default never
          overwrites work already in Hyperlocalise.
        </p>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <Checkbox
          checked={form.customerIoOverwriteWhenRemoteNewer}
          onCheckedChange={(checked) =>
            onChange({ ...form, customerIoOverwriteWhenRemoteNewer: checked === true })
          }
        />
        Overwrite translations when the remote locale is newer
      </label>
      {errors.customerIoSourceLocale ? (
        <p className="text-sm text-destructive">{errors.customerIoSourceLocale}</p>
      ) : null}
    </div>
  );
}
