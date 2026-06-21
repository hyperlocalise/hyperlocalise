"use client";

import { useState } from "react";
import { CopyIcon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { TypographyP } from "@/components/ui/typography";

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
    <section className="grid gap-4 rounded-lg border border-foreground/8 bg-foreground/2.5 p-4">
      <div>
        <TypographyP className="text-sm font-medium text-foreground">Connect CLI & CI</TypographyP>
        <TypographyP className="mt-1 text-sm text-foreground/52">
          Use native sync to push source files and pull translations without creating jobs from the
          CLI.
        </TypographyP>
      </div>

      <div className="space-y-2">
        <TypographyP className="text-xs font-medium tracking-[0.08em] text-foreground/34 uppercase">
          Project ID
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
            {copiedField === "projectId" ? "Copied" : "Copy"}
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <TypographyP className="text-xs font-medium tracking-[0.08em] text-foreground/34 uppercase">
            Sample i18n.yml
          </TypographyP>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => copyValue(sampleConfig, "config")}
          >
            <CopyIcon className="size-3.5" />
            {copiedField === "config" ? "Copied" : "Copy config"}
          </Button>
        </div>
        <pre className="overflow-x-auto rounded-md border border-border bg-background p-3 text-xs leading-6 text-foreground/72">
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
          sync push docs
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
          sync pull docs
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          nativeButton={false}
          render={<a href={`/org/${organizationSlug}/settings/api-keys`} />}
        >
          API keys
        </Button>
      </div>
    </section>
  );
}
