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
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { FormattedMessage, useIntl } from "react-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { readApiError } from "@/lib/api-error";
import { apiClient } from "@/lib/api-client-instance";
import { useGoSvcClient } from "@/lib/go-svc/use-go-svc-client";

import { contentEditorKeyTaskDialogMessages as messages } from "./content-editor-key-task-dialog.messages";
import { invalidateProjectContentEditorData } from "./use-key-translation-job-refresh";

type OpenKeyJob = { id: string; inputPayload: unknown };

function keyJobTitle(job: OpenKeyJob) {
  const payload = job.inputPayload as { metadata?: { title?: unknown } } | null;
  const title = payload?.metadata?.title;
  return typeof title === "string" && title.trim() ? title : job.id;
}

/** The end of the chosen day in the viewer's time zone. */
function dueAtFromDate(value: string) {
  return value ? new Date(`${value}T23:59:59`).toISOString() : undefined;
}

type TaskKind = "proofread" | "ai";

/**
 * Puts the ticked strings into a task: a new key job, or an open one of the project. A new task is
 * either for people (proofread) or AI translation, which fills missing translations (or, if asked,
 * unapproved ones) for review, as the file job dialog's task type does. Hidden strings are left out
 * by the server.
 */
export function ContentEditorKeyTaskDialog({
  open,
  onOpenChange,
  organizationSlug,
  projectId,
  sourceLocale,
  targetLocales,
  defaultLocale,
  stringIds,
  onSaved,
  onAiTranslationStarted,
  onOpenTask,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationSlug: string;
  projectId: string;
  sourceLocale: string;
  targetLocales: string[];
  /** The editor's language, the one ticked first for AI translation. */
  defaultLocale: string;
  stringIds: string[];
  /** Called after the strings are saved into a task, for example to clear the selection. */
  onSaved?: () => void;
  /** Called with the job of a started AI translation, so the editor can follow it. */
  onAiTranslationStarted?: (jobId: string) => void;
  /** Opens a task's page, through the editor's leave guard. */
  onOpenTask: (href: string) => void;
}) {
  const intl = useIntl();
  const queryClient = useQueryClient();
  const { client: goSvcClient } = useGoSvcClient();
  const [mode, setMode] = useState<"new" | "existing">("new");
  const [kind, setKind] = useState<TaskKind>("proofread");
  const [overwriteUnapproved, setOverwriteUnapproved] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [locales, setLocales] = useState<string[]>(targetLocales);
  const [jobId, setJobId] = useState("");
  const [pending, setPending] = useState(false);

  // Reset when the dialog opens, not on every render that passes a new locales array.
  const defaultsRef = useRef({ targetLocales, defaultLocale });
  defaultsRef.current = { targetLocales, defaultLocale };
  // People get every language; AI starts with the editor's, as each language costs a model call.
  const defaultLocales = (taskKind: TaskKind) => {
    const { targetLocales: all, defaultLocale: current } = defaultsRef.current;
    return taskKind === "ai" && all.includes(current) ? [current] : all;
  };
  useEffect(() => {
    if (open) {
      setMode("new");
      setKind("proofread");
      setOverwriteUnapproved(false);
      setTitle("");
      setDescription("");
      setDueDate("");
      setLocales(defaultLocales("proofread"));
      setJobId("");
    }
  }, [open]);

  function changeKind(next: TaskKind) {
    setKind(next);
    setLocales(defaultLocales(next));
  }

  const isAi = mode === "new" && kind === "ai";

  const openJobsQuery = useQuery({
    queryKey: ["content-editor-open-key-jobs", organizationSlug, projectId],
    queryFn: async () => {
      const result = await goSvcClient!.job.listProject<OpenKeyJob>(organizationSlug, projectId, {
        type: "keys",
        status: "waiting_for_review",
        limit: 50,
      });
      return result.jobs;
    },
    enabled: open && mode === "existing" && Boolean(goSvcClient),
  });
  const openJobs = openJobsQuery.data ?? [];

  const canSubmit =
    !pending &&
    stringIds.length > 0 &&
    (mode === "new" ? (isAi || title.trim().length > 0) && locales.length > 0 : jobId.length > 0);

  async function submit() {
    setPending(true);
    try {
      const job = isAi
        ? await startAiTranslation()
        : mode === "new"
          ? await createTask()
          : await addToTask();
      toast.success(
        intl.formatMessage(
          isAi ? messages.aiStarted : mode === "new" ? messages.created : messages.added,
          {
            count: job.count,
          },
        ),
        {
          action: {
            label: intl.formatMessage(isAi ? messages.openJob : messages.openTask),
            onClick: () =>
              onOpenTask(
                `/org/${organizationSlug}/projects/${encodeURIComponent(projectId)}/jobs/${encodeURIComponent(job.id)}`,
              ),
          },
        },
      );
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["content-editor-open-key-jobs", organizationSlug, projectId],
        }),
        queryClient.invalidateQueries({ queryKey: ["jobs", organizationSlug] }),
        // A task view loaded before must show the strings just added to its task.
        ...(mode === "existing"
          ? [invalidateProjectContentEditorData(queryClient, organizationSlug, projectId)]
          : []),
      ]);
      if (isAi) {
        onAiTranslationStarted?.(job.id);
      }
      onOpenChange(false);
      onSaved?.();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : intl.formatMessage(isAi ? messages.aiFailed : messages.failed),
      );
    } finally {
      setPending(false);
    }
  }

  async function createTask() {
    const response = await apiClient.api.orgs[":organizationSlug"].projects[
      ":projectId"
    ].jobs.$post({
      param: { organizationSlug, projectId },
      json: {
        type: "keys",
        title: title.trim(),
        ...(description.trim() ? { description: description.trim() } : {}),
        ...(dueDate ? { dueAt: dueAtFromDate(dueDate) } : {}),
        keysInput: { sourceLocale, targetLocales: locales, stringIds: stringIds },
      },
    });
    if (response.status !== 201) {
      throw new Error(await readApiError(response, intl.formatMessage(messages.failed)));
    }
    const body = (await response.json()) as { job: { id: string; keyCount?: number | null } };
    // Hidden strings are left out, so the server's count can be lower than the ticked rows.
    return { id: body.job.id, count: body.job.keyCount ?? stringIds.length };
  }

  async function startAiTranslation() {
    const response = await apiClient.api.orgs[":organizationSlug"].projects[
      ":projectId"
    ].jobs.$post({
      param: { organizationSlug, projectId },
      json: {
        type: "keys",
        kind: "translation",
        title: intl.formatMessage(messages.aiTaskTitle, { count: stringIds.length }),
        keysInput: {
          sourceLocale,
          targetLocales: locales,
          stringIds,
          ...(overwriteUnapproved ? { overwriteUnapproved: true } : {}),
        },
      },
    });
    if (response.status !== 201) {
      throw new Error(await readApiError(response, intl.formatMessage(messages.aiFailed)));
    }
    const body = (await response.json()) as { job: { id: string; keyCount?: number | null } };
    return { id: body.job.id, count: body.job.keyCount ?? stringIds.length };
  }

  async function addToTask() {
    const response = await apiClient.api.orgs[":organizationSlug"].projects[":projectId"].jobs[
      ":jobId"
    ].keys.$post({
      param: { organizationSlug, projectId, jobId },
      json: { stringIds: stringIds },
    });
    if (response.status !== 200) {
      throw new Error(await readApiError(response, intl.formatMessage(messages.failed)));
    }
    const body = (await response.json()) as { added: number };
    return { id: jobId, count: body.added };
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            <FormattedMessage {...messages.title} />
          </DialogTitle>
          <DialogDescription>
            <FormattedMessage
              {...(isAi ? messages.aiDescription : messages.description)}
              values={{ count: stringIds.length }}
            />
          </DialogDescription>
        </DialogHeader>
        <Tabs value={mode} onValueChange={(value) => setMode(value as "new" | "existing")}>
          <TabsList>
            <TabsTrigger value="new">
              <FormattedMessage {...messages.newTask} />
            </TabsTrigger>
            <TabsTrigger value="existing">
              <FormattedMessage {...messages.existingTask} />
            </TabsTrigger>
          </TabsList>
        </Tabs>
        {mode === "new" ? (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="key-task-type">
                <FormattedMessage {...messages.taskType} />
              </Label>
              <Select
                value={kind}
                onValueChange={(value) => {
                  if (value === "proofread" || value === "ai") {
                    changeKind(value);
                  }
                }}
              >
                <SelectTrigger id="key-task-type" className="w-full min-w-0">
                  <SelectValue>
                    {intl.formatMessage(isAi ? messages.taskTypeAi : messages.taskTypeProofread)}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="proofread">
                    <FormattedMessage {...messages.taskTypeProofread} />
                  </SelectItem>
                  <SelectItem value="ai">
                    <FormattedMessage {...messages.taskTypeAi} />
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            {isAi ? null : (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="key-task-title">
                  <FormattedMessage {...messages.taskTitle} />
                </Label>
                <Input
                  id="key-task-title"
                  value={title}
                  maxLength={256}
                  onChange={(event) => setTitle(event.target.value)}
                />
              </div>
            )}
            <fieldset className="flex flex-col gap-1.5">
              <legend className="mb-1.5 text-sm font-medium">
                <FormattedMessage {...messages.languages} />
              </legend>
              <div className="flex flex-wrap gap-x-4 gap-y-2">
                {targetLocales.map((locale) => (
                  <Label key={locale} className="flex items-center gap-2 font-normal">
                    <Checkbox
                      checked={locales.includes(locale)}
                      onCheckedChange={(checked) =>
                        setLocales((current) =>
                          checked
                            ? targetLocales.filter(
                                (item) => item === locale || current.includes(item),
                              )
                            : current.filter((item) => item !== locale),
                        )
                      }
                    />
                    {locale}
                  </Label>
                ))}
              </div>
            </fieldset>
            {isAi ? (
              <Label className="flex items-center gap-2 font-normal">
                <Checkbox
                  checked={overwriteUnapproved}
                  onCheckedChange={(checked) => setOverwriteUnapproved(checked === true)}
                />
                <FormattedMessage {...messages.overwriteUnapproved} />
              </Label>
            ) : (
              <>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="key-task-due">
                    <FormattedMessage {...messages.dueDate} />
                  </Label>
                  <Input
                    id="key-task-due"
                    type="date"
                    value={dueDate}
                    onChange={(event) => setDueDate(event.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="key-task-description">
                    <FormattedMessage {...messages.taskDescription} />
                  </Label>
                  <Textarea
                    id="key-task-description"
                    value={description}
                    maxLength={2048}
                    onChange={(event) => setDescription(event.target.value)}
                  />
                </div>
              </>
            )}
          </div>
        ) : openJobsQuery.isError ? (
          <p className="p-6 text-center text-sm text-destructive">
            <FormattedMessage {...messages.loadTasksFailed} />
          </p>
        ) : openJobsQuery.isLoading ? (
          <div className="flex items-center justify-center gap-2 p-6 text-muted-foreground">
            <Spinner />
            <FormattedMessage {...messages.loadingTasks} />
          </div>
        ) : openJobs.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">
            <FormattedMessage {...messages.noOpenTasks} />
          </p>
        ) : (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="key-task-existing">
              <FormattedMessage {...messages.existingTask} />
            </Label>
            <Select
              value={jobId}
              onValueChange={(value) => {
                if (typeof value === "string") {
                  setJobId(value);
                }
              }}
            >
              <SelectTrigger id="key-task-existing" className="w-full min-w-0">
                <SelectValue placeholder={intl.formatMessage(messages.chooseTask)} />
              </SelectTrigger>
              <SelectContent>
                {openJobs.map((job) => (
                  <SelectItem key={job.id} value={job.id}>
                    {keyJobTitle(job)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            <FormattedMessage {...messages.cancel} />
          </Button>
          <Button type="button" disabled={!canSubmit} onClick={() => void submit()}>
            {pending ? <Spinner /> : null}
            <FormattedMessage
              {...(isAi ? messages.translate : mode === "new" ? messages.create : messages.add)}
            />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
