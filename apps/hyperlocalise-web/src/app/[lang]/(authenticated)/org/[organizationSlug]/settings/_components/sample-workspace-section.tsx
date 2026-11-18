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
import { useState } from "react";
import { CheckCircleIcon, CircleIcon, SpinnerGapIcon } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormattedMessage, useIntl, type MessageDescriptor } from "react-intl";
import { toast } from "sonner";

import { OrgNavLink } from "@/components/app-shell/org-nav-link";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Row } from "@/components/ui/layout/row";
import { Rows } from "@/components/ui/layout/rows";
import { TypographyP } from "@/components/ui/typography";
import { apiClient } from "@/lib/api-client-instance";
import { useGoSvcClient } from "@/lib/go-svc/use-go-svc-client";
import {
  SAMPLE_GUIDELINE_DOCUMENTS,
  SAMPLE_GUIDELINE_FILENAMES,
} from "@/lib/sample-workspace/sample-workspace-content";

import { sampleWorkspaceSectionMessages as messages } from "./sample-workspace-section.messages";

type SampleWorkspaceProject = { id: string; name: string };
type SampleWorkspaceStatus = { loaded: boolean; projects: SampleWorkspaceProject[] };

type StepId = "projects" | "knowledge" | "guidelines";
type StepState = "pending" | "running" | "done" | "skipped";

const STEPS: { id: StepId; label: MessageDescriptor }[] = [
  { id: "projects", label: messages.stepProjects },
  { id: "knowledge", label: messages.stepKnowledge },
  { id: "guidelines", label: messages.stepGuidelines },
];

const IDLE_STEPS: Record<StepId, StepState> = {
  projects: "pending",
  knowledge: "pending",
  guidelines: "pending",
};

function sampleWorkspaceApi() {
  return apiClient.api.orgs[":organizationSlug"]["sample-workspace"];
}

function sampleWorkspaceQueryKey(organizationSlug: string) {
  return ["sample-workspace", organizationSlug] as const;
}

async function readError(response: Response, fallback: string) {
  const body = await response.json().catch(() => null);
  if (body && typeof body === "object" && "message" in body && typeof body.message === "string") {
    return body.message;
  }
  return fallback;
}

function StepIcon({ state }: { state: StepState }) {
  switch (state) {
    case "running":
      return <SpinnerGapIcon className="size-4 animate-spin text-muted-foreground" />;
    case "done":
      return <CheckCircleIcon weight="fill" className="size-4 text-primary" />;
    case "pending":
    case "skipped":
      return <CircleIcon className="size-4 text-subtle-foreground" />;
  }
}

/** Loads or removes the sample workspace in one go, showing each step as it runs. */
export function SampleWorkspaceSection({ organizationSlug }: { organizationSlug: string }) {
  const intl = useIntl();
  const queryClient = useQueryClient();
  const { client } = useGoSvcClient();
  const [steps, setSteps] = useState<Record<StepId, StepState>>(IDLE_STEPS);
  const [isRemoveOpen, setIsRemoveOpen] = useState(false);
  const api = sampleWorkspaceApi();
  const param = { organizationSlug };

  const statusQuery = useQuery({
    queryKey: sampleWorkspaceQueryKey(organizationSlug),
    queryFn: async () => {
      const response = await api.$get({ param });
      if (!response.ok) {
        throw new Error(intl.formatMessage(messages.statusFailed));
      }
      const body = (await response.json()) as { sampleWorkspace: SampleWorkspaceStatus };
      return body.sampleWorkspace;
    },
  });

  const setStep = (id: StepId, state: StepState) =>
    setSteps((current) => ({ ...current, [id]: state }));

  const load = useMutation({
    mutationFn: async () => {
      setSteps({ projects: "running", knowledge: "running", guidelines: "pending" });
      const response = await api.$post({ param });
      if (!response.ok) {
        setSteps(IDLE_STEPS);
        throw new Error(await readError(response, intl.formatMessage(messages.loadFailed)));
      }
      setSteps({ projects: "done", knowledge: "done", guidelines: "running" });

      // go-svc owns guideline ingest, so the documents are uploaded like a person would.
      // A plan without guidelines refuses the upload; the rest of the sample still works.
      try {
        for (const document of SAMPLE_GUIDELINE_DOCUMENTS) {
          const file = new File([document.content], document.filename, { type: "text/markdown" });
          await client.guidelines.uploadDocument(organizationSlug, {
            file,
            filename: document.filename,
            title: document.title,
            isGlobal: true,
          });
        }
        setStep("guidelines", "done");
      } catch {
        setStep("guidelines", "skipped");
      }
    },
    onSuccess: async () => {
      toast.success(intl.formatMessage(messages.loadedToast));
      await queryClient.invalidateQueries({ queryKey: sampleWorkspaceQueryKey(organizationSlug) });
    },
    onError: (error) => toast.error(error.message),
  });

  const remove = useMutation({
    mutationFn: async () => {
      try {
        const documents = await client.guidelines.listDocuments(organizationSlug);
        for (const document of documents) {
          if (SAMPLE_GUIDELINE_FILENAMES.has(document.filename)) {
            await client.guidelines.deleteDocument(organizationSlug, document.id);
          }
        }
      } catch {
        // Guidelines may be off for this plan; the sample projects are still removed.
      }
      const response = await api.$delete({ param });
      if (!response.ok) {
        throw new Error(await readError(response, intl.formatMessage(messages.removeFailed)));
      }
    },
    onSuccess: async () => {
      setIsRemoveOpen(false);
      setSteps(IDLE_STEPS);
      toast.success(intl.formatMessage(messages.removedToast));
      await queryClient.invalidateQueries({ queryKey: sampleWorkspaceQueryKey(organizationSlug) });
    },
    onError: (error) => toast.error(error.message),
  });

  const status = statusQuery.data;
  const isLoaded = status?.loaded ?? false;
  const showSteps = load.isPending || load.isSuccess;

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <FormattedMessage {...messages.title} />
        </CardTitle>
        <CardDescription>
          <FormattedMessage {...(isLoaded ? messages.loadedDescription : messages.description)} />
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Rows spacing="3u">
          {showSteps ? (
            <ul className="flex flex-col gap-2">
              {STEPS.map((step) => (
                <li key={step.id} className="flex items-center gap-2 text-sm">
                  <StepIcon state={steps[step.id]} />
                  <span
                    className={
                      steps[step.id] === "pending" ? "text-subtle-foreground" : "text-foreground"
                    }
                  >
                    <FormattedMessage {...step.label} />
                  </span>
                  {steps[step.id] === "skipped" ? (
                    <Badge variant="outline">
                      <FormattedMessage {...messages.stepSkipped} />
                    </Badge>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}

          {isLoaded && status ? (
            <div className="flex flex-wrap gap-2">
              {status.projects.map((project) => (
                <Button
                  key={project.id}
                  nativeButton={false}
                  render={<OrgNavLink href={`/org/${organizationSlug}/projects/${project.id}`} />}
                  variant="outline"
                  size="sm"
                >
                  <FormattedMessage
                    {...messages.openProject}
                    values={{ projectName: project.name }}
                  />
                </Button>
              ))}
            </div>
          ) : null}

          {statusQuery.isError ? (
            <TypographyP size="small" tone="subtle">
              <FormattedMessage {...messages.statusFailed} />
            </TypographyP>
          ) : null}

          <Row spacing="2u">
            {isLoaded ? (
              <Button
                type="button"
                variant="outline"
                disabled={remove.isPending || load.isPending}
                onClick={() => setIsRemoveOpen(true)}
              >
                <FormattedMessage {...messages.removeButton} />
              </Button>
            ) : (
              <Button
                type="button"
                disabled={statusQuery.isLoading || statusQuery.isError || load.isPending}
                onClick={() => load.mutate()}
              >
                <FormattedMessage
                  {...(load.isPending ? messages.loadingButton : messages.loadButton)}
                />
              </Button>
            )}
          </Row>
        </Rows>
      </CardContent>

      <AlertDialog open={isRemoveOpen} onOpenChange={setIsRemoveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              <FormattedMessage {...messages.removeDialogTitle} />
            </AlertDialogTitle>
            <AlertDialogDescription>
              <FormattedMessage {...messages.removeDialogDescription} />
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={remove.isPending}>
              <FormattedMessage {...messages.removeDialogCancel} />
            </AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={remove.isPending}
              onClick={() => remove.mutate()}
            >
              <FormattedMessage {...messages.removeDialogConfirm} />
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
