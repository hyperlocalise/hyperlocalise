"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { createApiClient } from "@/lib/api-client";
import { cn } from "@/lib/utils";

const api = createApiClient();

type I18nSetupRun = {
  id: string;
  githubRepositoryId: string;
  repositoryFullName: string;
  status: "queued" | "running" | "succeeded" | "failed";
  errorCode: string | null;
  errorMessage: string | null;
  pullRequestUrl: string | null;
  pullRequestNumber: number | null;
  detectedLocaleCount: number | null;
};

const I18N_SETUP_ERROR_MESSAGES: Record<string, string> = {
  locale_files_not_found:
    "Could not find locale translation files. Look for paths like locales/en-US.json, locales/fr.po, or messages/de.yaml.",
  i18n_jsonc_parse_failed: "Could not parse i18n.jsonc. Fix the config syntax and try again.",
  i18n_config_not_written: "The setup agent did not write i18n.yml.",
  i18n_setup_failed: "The i18n setup wizard failed.",
  i18n_setup_enqueue_failed: "Could not start the i18n setup wizard.",
};

function getI18nSetupErrorMessage(run: I18nSetupRun): string {
  if (run.errorMessage) {
    return run.errorMessage;
  }

  if (run.errorCode && I18N_SETUP_ERROR_MESSAGES[run.errorCode]) {
    return I18N_SETUP_ERROR_MESSAGES[run.errorCode];
  }

  return "The i18n setup wizard failed.";
}

type RepositoryI18nSetupActionProps = {
  organizationSlug: string;
  githubRepositoryId: string;
  enabled: boolean;
  userCanManage: boolean;
};

export function RepositoryI18nSetupAction({
  organizationSlug,
  githubRepositoryId,
  enabled,
  userCanManage,
}: RepositoryI18nSetupActionProps) {
  const queryClient = useQueryClient();
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const watchedRunIdRef = useRef<string | null>(null);

  const latestRunQuery = useQuery({
    queryKey: ["github-i18n-setup-latest", organizationSlug, githubRepositoryId],
    queryFn: async () => {
      const res = await api.api.orgs[":organizationSlug"]["github-installation"].repositories[
        ":githubRepositoryId"
      ]["i18n-setup-runs"].latest.$get({
        param: { organizationSlug, githubRepositoryId },
      });
      if (!res.ok) {
        throw new Error("Failed to fetch i18n setup status");
      }
      const data = await res.json();
      return data.i18nSetupRun as I18nSetupRun | null;
    },
    enabled: enabled && userCanManage,
    refetchInterval: (query) => {
      const run = query.state.data;
      if (!run) {
        return false;
      }
      return run.status === "queued" || run.status === "running" ? 3000 : false;
    },
  });

  const activeRunQuery = useQuery({
    queryKey: ["github-i18n-setup-run", organizationSlug, activeRunId],
    queryFn: async () => {
      if (!activeRunId) {
        return null;
      }

      const res = await api.api.orgs[":organizationSlug"]["github-installation"]["i18n-setup-runs"][
        ":runId"
      ].$get({
        param: { organizationSlug, runId: activeRunId },
      });
      if (!res.ok) {
        throw new Error("Failed to fetch i18n setup run");
      }
      const data = await res.json();
      return data.i18nSetupRun as I18nSetupRun;
    },
    enabled: Boolean(activeRunId),
    refetchInterval: (query) => {
      const run = query.state.data;
      if (!run) {
        return 3000;
      }
      return run.status === "queued" || run.status === "running" ? 3000 : false;
    },
  });

  const startSetup = useMutation({
    mutationFn: async () => {
      const res = await api.api.orgs[":organizationSlug"]["github-installation"].repositories[
        ":githubRepositoryId"
      ]["i18n-setup"].$post({
        param: { organizationSlug, githubRepositoryId },
      });

      if (!res.ok) {
        const error = await res.json().catch(() => ({ error: "i18n_setup_failed" }));
        const message =
          "message" in error && typeof error.message === "string"
            ? error.message
            : "error" in error
              ? String(error.error)
              : "Failed to start i18n setup";
        throw new Error(message);
      }

      const data = await res.json();
      return data.i18nSetupRun as I18nSetupRun;
    },
    onSuccess: async (run) => {
      watchedRunIdRef.current = run.id;
      setActiveRunId(run.id);
      await queryClient.invalidateQueries({
        queryKey: ["github-i18n-setup-latest", organizationSlug, githubRepositoryId],
      });
      toast.success("i18n setup wizard started");
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const run = activeRunQuery.data ?? latestRunQuery.data;
  const isActive = run?.status === "queued" || run?.status === "running";
  const canStart = enabled && userCanManage && !isActive && !startSetup.isPending;

  useEffect(() => {
    if (!run || run.id !== watchedRunIdRef.current) {
      return;
    }

    if (run.status === "succeeded") {
      if (run.pullRequestUrl) {
        toast.success("i18n.yml pull request created");
      } else if (run.errorMessage) {
        toast.success(run.errorMessage);
      } else {
        toast.success("i18n.yml setup completed");
      }
      watchedRunIdRef.current = null;
      return;
    }

    if (run.status === "failed") {
      toast.error(getI18nSetupErrorMessage(run));
      watchedRunIdRef.current = null;
    }
  }, [run]);

  if (!enabled || !userCanManage) {
    return null;
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={!canStart}
        onClick={() => startSetup.mutate()}
        className="whitespace-nowrap"
      >
        {startSetup.isPending || isActive ? "Setting up..." : "Setup i18n.yml"}
      </Button>
      {run ? (
        <div className="max-w-[220px] text-right text-xs text-muted-foreground">
          {run.status === "queued" || run.status === "running" ? (
            <span>Analyzing locale files…</span>
          ) : null}
          {run.status === "succeeded" && run.pullRequestUrl ? (
            <a
              href={run.pullRequestUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={cn("text-primary underline-offset-4 hover:underline")}
            >
              View pull request
            </a>
          ) : null}
          {run.status === "succeeded" && !run.pullRequestUrl && run.errorMessage ? (
            <span>{run.errorMessage}</span>
          ) : null}
          {run.status === "failed" ? (
            <span className="text-destructive">{getI18nSetupErrorMessage(run)}</span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
