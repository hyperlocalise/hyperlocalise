"use client";

/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file and at https://mariadb.com/bsl11/.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { useState } from "react";
import { CopyIcon } from "lucide-react";
import { FormattedMessage } from "react-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { TypographyP } from "@/components/ui/typography";

import { projectNativeConnectCliPanelMessages } from "./project-native-connect-cli-panel.messages";

function buildSampleI18nYaml(projectId: string) {
  return `hyperlocalise:
  project_id: ${projectId}
  api_base_url: https://hyperlocalise.com/api
  api_key_env: HYPERLOCALISE_API_KEY
  timeout_seconds: 1200
`;
}

export function ProjectNativeConnectCliPanel({
  organizationSlug,
  projectId,
}: {
  organizationSlug: string;
  projectId: string;
}) {
  const [copiedField, setCopiedField] = useState<"projectId" | "config" | null>(null);
  const sampleConfig = buildSampleI18nYaml(projectId);

  async function copyValue(value: string, field: "projectId" | "config") {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(field);
      toast.success("Copied to clipboard");
      window.setTimeout(() => setCopiedField(null), 1500);
    } catch {
      toast.error("Unable to copy to clipboard");
    }
  }

  return (
    <section className="grid gap-4 rounded-lg border border-border bg-muted p-4">
      <div>
        <TypographyP className="text-sm font-medium text-foreground">
          <FormattedMessage {...projectNativeConnectCliPanelMessages.title} />
        </TypographyP>
        <TypographyP className="mt-1 text-sm text-muted-foreground">
          <FormattedMessage {...projectNativeConnectCliPanelMessages.description} />
        </TypographyP>
      </div>

      <div className="space-y-2">
        <TypographyP className="text-xs font-medium tracking-[0.08em] text-muted-foreground uppercase">
          <FormattedMessage {...projectNativeConnectCliPanelMessages.projectIdLabel} />
        </TypographyP>
        <div className="flex flex-wrap items-center gap-2">
          <code className="rounded-md border border-border bg-background px-2 py-1 font-mono text-xs">
            {projectId}
          </code>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => copyValue(projectId, "projectId")}
          >
            <CopyIcon className="size-3.5" />
            {copiedField === "projectId" ? (
              <FormattedMessage {...projectNativeConnectCliPanelMessages.copied} />
            ) : (
              <FormattedMessage {...projectNativeConnectCliPanelMessages.copy} />
            )}
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <TypographyP className="text-xs font-medium tracking-[0.08em] text-muted-foreground uppercase">
            <FormattedMessage {...projectNativeConnectCliPanelMessages.sampleConfigLabel} />
          </TypographyP>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => copyValue(sampleConfig, "config")}
          >
            <CopyIcon className="size-3.5" />
            {copiedField === "config" ? (
              <FormattedMessage {...projectNativeConnectCliPanelMessages.copied} />
            ) : (
              <FormattedMessage {...projectNativeConnectCliPanelMessages.copyConfig} />
            )}
          </Button>
        </div>
        <pre className="overflow-x-auto rounded-md border border-border bg-background p-3 text-xs leading-6 text-subtle-foreground">
          {sampleConfig}
        </pre>
      </div>

      <div className="flex flex-wrap gap-2 text-sm">
        <Button
          type="button"
          variant="outline"
          size="sm"
          nativeButton={false}
          render={
            <a
              href="https://hyperlocalise.com/docs/commands/sync-push"
              target="_blank"
              rel="noopener noreferrer"
            />
          }
        >
          <FormattedMessage {...projectNativeConnectCliPanelMessages.syncPushDocs} />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          nativeButton={false}
          render={
            <a
              href="https://hyperlocalise.com/docs/commands/sync-pull"
              target="_blank"
              rel="noopener noreferrer"
            />
          }
        >
          <FormattedMessage {...projectNativeConnectCliPanelMessages.syncPullDocs} />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          nativeButton={false}
          render={<a href={`/org/${organizationSlug}/settings/api-keys`} />}
        >
          <FormattedMessage {...projectNativeConnectCliPanelMessages.apiKeys} />
        </Button>
      </div>
    </section>
  );
}
