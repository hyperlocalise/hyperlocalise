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
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { useMutation } from "@tanstack/react-query";
import { FormattedMessage, useIntl } from "react-intl";
import {
  File01Icon,
  LanguageCircleIcon,
  Link01Icon,
  MoreHorizontalCircle01Icon,
  Tag01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { toast } from "sonner";

import { IssueColumnIcon } from "@/components/issue-column-icon/issue-column-icon";
import { MarkdownEditor } from "@/components/markdown-editor/markdown-editor";
import {
  findIssueSheetTemplate,
  issueSheetTemplateLabel,
  issueSheetTemplateSkeleton,
  issueSheetTemplates,
} from "@/lib/projects/issue-sheet/issue-sheet-templates";
import { issueSheetTemplateMessages } from "@/lib/projects/issue-sheet/issue-sheet-templates.messages";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { apiClient } from "@/lib/api-client-instance";
import { readApiResponseError } from "@/lib/api-error";
import { cn } from "@/lib/primitives/cn";

import { IssueAssigneePicker } from "../../../../_components/issue-detail/issue-assignee-picker";
import {
  issuePriorityValues,
  issueStatusLabel,
  issueStatusValues,
  issueTypeLabel,
  type IssuePriorityValue,
  type IssueStatusValue,
} from "../../../../_components/issue-detail/issue-detail-utils";
import {
  IssueLocalePicker,
  resolveIssueCreateLocaleOptions,
  sanitizeIssueCreateTargetLocale,
  shouldSanitizeIssueCreateTargetLocale,
} from "../../../../_components/issue-detail/issue-locale-picker";
import { IssuePriorityIcon } from "../../../../_components/issue-detail/issue-priority-icon";
import { IssueStatusIcon } from "../../../../_components/issue-detail/issue-status-icon";
import type { IssueSheetColumn } from "../../../../_components/issue-detail/issue-sheet-column-types";
import { isIssueSheetColumnVisible } from "../../../../_components/issue-detail/issue-sheet-column-utils";
import { useAssignableIssueMembersQuery } from "../../../../_components/issue-detail/use-assignable-issue-members";
import { useIssueSheetColumnsQuery } from "../../../../_components/issue-detail/use-issue-sheet-columns-query";
import { useIssueSheetTemplateConfigQuery } from "../../../../_components/issue-detail/use-issue-sheet-template-config-query";
import { useProjectPageQuery } from "../../_components/project-page-shell";
import { issueTypeValues, type IssueTypeValue } from "./issue-sheet-constants";
import { issueSheetCreateIssueDialogMessages as messages } from "./issue-sheet-create-issue-dialog.messages";
import {
  composeIssueDescription,
  resolveDescriptionOnTemplateChange,
  stripEmptySections,
  type IssueSheetTemplateChangeOrigin,
} from "./issue-sheet-template-description";

const CREATE_COMPACT_COLUMN_TYPES = new Set(["select", "user", "text"]);
const CREATE_EXCLUDED_COLUMN_KEYS = new Set(["priority", "owner_note"]);
const NO_TEMPLATE_VALUE = "__no_template__";

const propertyTriggerClassName =
  "h-7 gap-1.5 rounded-md border-0 bg-transparent px-1.5 text-xs font-normal text-muted-foreground shadow-none hover:bg-muted/60 hover:text-foreground";

function isCreateCompactCustomColumn(column: IssueSheetColumn) {
  return (
    !column.hidden &&
    !CREATE_EXCLUDED_COLUMN_KEYS.has(column.key) &&
    CREATE_COMPACT_COLUMN_TYPES.has(column.type)
  );
}

function buildValuesPayload(drafts: Record<string, string>) {
  const values: Record<string, string> = {};
  for (const [key, value] of Object.entries(drafts)) {
    const trimmed = value.trim();
    if (trimmed) {
      values[key] = trimmed;
    }
  }
  return Object.keys(values).length > 0 ? values : undefined;
}

function columnSelectOptions(config: { options?: unknown }) {
  if (!Array.isArray(config.options)) {
    return [];
  }
  return config.options.flatMap((option) => {
    if (
      !option ||
      typeof option !== "object" ||
      !("id" in option) ||
      !("label" in option) ||
      typeof option.id !== "string" ||
      typeof option.label !== "string"
    ) {
      return [];
    }
    return [{ id: option.id, label: option.label }];
  });
}

function stopMenuKeyboardPropagation(event: KeyboardEvent<HTMLDivElement>) {
  event.stopPropagation();
}

function MenuTextField({
  htmlFor,
  label,
  children,
}: {
  htmlFor?: string;
  label: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-1.5 px-1 py-1" onKeyDown={stopMenuKeyboardPropagation}>
      <Label htmlFor={htmlFor} className="text-xs text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  );
}

export type IssueSheetCreateStringLink = {
  translationKeyId?: string;
  segmentId: string;
  sourcePath: string;
  targetLocale: string;
  defaultTitle?: string;
  // CAT segment source text. Quoted as a blockquote below the applied template's description
  // skeleton (or alone, if no template is applied) — not used as the literal description. This
  // is the only place the source survives once a template takes over, for segments without a
  // translationKeyId.
  defaultDescription?: string;
  linkUrl?: string;
  linkLabel?: string;
};

export function IssueSheetCreateIssueDialog({
  open,
  onOpenChange,
  organizationSlug,
  projectId,
  projects,
  stringLink,
  onCreated,
  defaultCreateMore = false,
  initialTemplateKey = null,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationSlug: string;
  projectId?: string;
  projects?: { id: string; name: string; targetLocales?: string[] }[];
  stringLink?: IssueSheetCreateStringLink;
  onCreated: () => Promise<void>;
  defaultCreateMore?: boolean;
  // A fixed starting template that outranks the project's configured default (e.g. CAT always
  // preselects "tpl_context_request"). Still swappable/removable like any other template pick;
  // this only sets what the dialog opens with.
  initialTemplateKey?: string | null;
}) {
  const intl = useIntl();
  const [selectedProjectId, setSelectedProjectId] = useState(projectId ?? "");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<IssueStatusValue>("open");
  const [issueType, setIssueType] = useState<IssueTypeValue>("general_question");
  const [priority, setPriority] = useState<IssuePriorityValue>("P2");
  const [targetLocale, setTargetLocale] = useState("");
  const [sourcePath, setSourcePath] = useState("");
  const [linkLabel, setLinkLabel] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [assigneeUserId, setAssigneeUserId] = useState<string | null>(null);
  const [customValues, setCustomValues] = useState<Record<string, string>>({});
  const [createMore, setCreateMore] = useState(defaultCreateMore);
  const [templateKey, setTemplateKeyRaw] = useState<string | null>(null);
  // Set true only by the MarkdownEditor's onChange (genuine user input); never by our own
  // programmatic setDescription calls below. MarkdownEditor syncs external `value` changes via
  // setContent(..., { emitUpdate: false }), which provably cannot fire onChange, so this flag is
  // exact rather than a fragile description-string comparison (markdown round-trips through
  // TipTap and can normalize whitespace).
  const [descriptionDirty, setDescriptionDirty] = useState(false);
  // True once the user has explicitly picked or cleared a template this session. Blocks the
  // project-default resolution effect below from overriding that choice, including across a
  // project switch in the org-scoped dialog.
  const [templateUserOverridden, setTemplateUserOverridden] = useState(false);
  // True once the user has picked an assignee by hand via the picker below. Ref, not state — read
  // only inside applyBindingIfUnset, never rendered. Blocks every future template-binding
  // auto-apply this session (switching templates, "create more") from overwriting a deliberate
  // pick; reset on dialog close/reopen and on project switch, matching templateUserOverridden's
  // scope, so a fresh project's binding can still apply.
  const assigneeManuallySetRef = useRef(false);

  const {
    segmentId: linkSegmentId = null,
    sourcePath: linkSourcePath = null,
    targetLocale: linkTargetLocale = null,
    defaultTitle: linkDefaultTitle = null,
    defaultDescription: linkDefaultDescription = null,
    linkLabel: linkDefaultLinkLabel = null,
    linkUrl: linkDefaultLinkUrl = null,
  } = stringLink ?? {};
  const onlyProjectId = projects?.length === 1 ? projects[0].id : null;

  // Applies (or clears) a template's type/priority/description skeleton. `origin` controls the
  // clobber rule (see IssueSheetTemplateChangeOrigin): an explicit pick always wins, an explicit
  // clear only drops the skeleton while pristine and never touches type/priority, and an
  // automatic application (project default, or re-resolving after a project switch) is
  // all-or-nothing — it applies nothing at all, including the template tag, while the
  // description is dirty.
  // Returns whether the template (type/priority/tag) actually applied — false only for the
  // "automatic && dirty" no-op. Callers that also want to apply an assignee binding for the
  // template must check this first: the binding is part of the same all-or-nothing guarantee,
  // not something that should slip through when the template itself was skipped.
  function applyTemplateChange(
    nextKey: string | null,
    origin: IssueSheetTemplateChangeOrigin,
  ): boolean {
    const template = findIssueSheetTemplate(nextKey);
    const rawSkeleton = template ? issueSheetTemplateSkeleton(intl, template.key) : null;
    // CAT segment source text has no other home once a template's skeleton takes over the
    // description: for file-backed segments without a translationKeyId, this copy is the only
    // place the source survives.
    const nextSkeleton = linkSegmentId
      ? composeIssueDescription({
          skeleton: rawSkeleton,
          sourceText: linkDefaultDescription,
          sourceLabel: intl.formatMessage(messages.sourceLabel),
        })
      : rawSkeleton;

    const wasDirty = descriptionDirty;
    setDescription((current) =>
      resolveDescriptionOnTemplateChange({
        currentDescription: current,
        isDirty: wasDirty,
        nextSkeleton,
        origin,
      }),
    );
    // Once we've (possibly) overwritten the description, it is pristine relative to what we just
    // wrote — the MarkdownEditor sync effect that applies it back cannot fire onChange, so this
    // is safe even when the write was a no-op.
    if (origin === "explicit_pick" || !wasDirty) {
      setDescriptionDirty(false);
    }

    if (origin === "explicit_clear") {
      setTemplateKeyRaw(null);
      return true;
    }
    if (origin === "automatic" && wasDirty) {
      return false;
    }
    setTemplateKeyRaw(nextKey);
    if (template) {
      setPriority(template.defaultPriority);
      if (template.issueType) {
        setIssueType(template.issueType);
      }
    }
    return true;
  }

  function selectTemplate(nextKey: string) {
    setTemplateUserOverridden(true);
    applyTemplateChange(nextKey, "explicit_pick");
  }

  function clearTemplate() {
    setTemplateUserOverridden(true);
    applyTemplateChange(null, "explicit_clear");
  }

  // Applies (or clears) the given template's assignee binding, unless the user has picked an
  // assignee by hand this session (assigneeManuallySetRef). Unconditional otherwise — not "only if
  // currently unset" — so switching from a template bound to Alice to one bound to Bob actually
  // reassigns to Bob, and switching to a template with no binding clears Alice rather than leaving
  // her stuck from the previous template. Shared by the resolution effect below and
  // resetAfterCreateMore, so "create more" reapplies the same binding a fresh dialog open would.
  function applyTemplateAssigneeBinding(key: string | null) {
    if (!key || assigneeManuallySetRef.current) {
      return;
    }
    const binding = templateConfigQuery.data?.assigneeByTemplate.find(
      (entry) => entry.templateKey === key && entry.assignable,
    );
    setAssigneeUserId(binding?.userId ?? null);
  }

  useEffect(() => {
    if (!open) {
      setSelectedProjectId("");
      setTitle("");
      setDescription("");
      setStatus("open");
      setIssueType("general_question");
      setPriority("P2");
      setTargetLocale("");
      setSourcePath("");
      setLinkLabel("");
      setLinkUrl("");
      setAssigneeUserId(null);
      assigneeManuallySetRef.current = false;
      setCustomValues({});
      setCreateMore(defaultCreateMore);
      setTemplateKeyRaw(null);
      setDescriptionDirty(false);
      setTemplateUserOverridden(false);
      return;
    }
    if (linkSegmentId) {
      setTitle(linkDefaultTitle ?? "");
      setStatus("open");
      setTargetLocale(linkTargetLocale ?? "");
      setSourcePath(linkSourcePath ?? "");
      setLinkLabel(linkDefaultLinkLabel ?? "");
      setLinkUrl(linkDefaultLinkUrl ?? "");
      setCustomValues({});
    }
    // Starting template: initialTemplateKey (e.g. CAT's fixed "tpl_context_request") outranks
    // the project's configured default. The project-default resolution effect below only adopts
    // a default when there is no initialTemplateKey and no in-session override yet, so it will
    // not fight with this. Origin "automatic" is safe here even for an explicit caller default —
    // the description was just reset to empty above, so it is trivially pristine.
    applyTemplateChange(initialTemplateKey, "automatic");
    if (projectId) {
      setSelectedProjectId(projectId);
      return;
    }
    if (onlyProjectId) {
      setSelectedProjectId(onlyProjectId);
    }
    // applyTemplateChange, selectTemplate, and clearTemplate close over component state each
    // render and are intentionally omitted from deps (they are not stable references); the
    // effect keys strictly off open/link/project inputs, matching the reset semantics above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    defaultCreateMore,
    initialTemplateKey,
    linkDefaultDescription,
    linkDefaultLinkLabel,
    linkDefaultLinkUrl,
    linkDefaultTitle,
    linkSegmentId,
    linkSourcePath,
    linkTargetLocale,
    onlyProjectId,
    open,
    projectId,
  ]);

  const resolvedProjectId = projectId ?? selectedProjectId;

  const showProjectPicker = Boolean(projects && projects.length > 0 && !projectId);
  const assignableMembersQuery = useAssignableIssueMembersQuery({
    organizationSlug,
    projectId: resolvedProjectId || undefined,
    enabled: open && Boolean(resolvedProjectId),
  });
  const columnsQuery = useIssueSheetColumnsQuery({
    organizationSlug,
    projectId: resolvedProjectId || "",
    enabled: open && Boolean(resolvedProjectId),
  });
  const templateConfigQuery = useIssueSheetTemplateConfigQuery({
    organizationSlug,
    projectId: resolvedProjectId || undefined,
    enabled: open && Boolean(resolvedProjectId),
  });
  const isOrganizationScoped = !projectId;
  const selectedProject = useMemo(
    () => projects?.find((project) => project.id === resolvedProjectId),
    [projects, resolvedProjectId],
  );
  const projectQuery = useProjectPageQuery(organizationSlug, resolvedProjectId || "", {
    enabled:
      open &&
      Boolean(resolvedProjectId) &&
      (!isOrganizationScoped || !selectedProject?.targetLocales?.length),
  });
  const fetchedProjectLocales =
    projectQuery.data?.id === resolvedProjectId ? projectQuery.data.targetLocales : undefined;
  const localeOptions = useMemo(
    () =>
      resolveIssueCreateLocaleOptions({
        resolvedProjectId: resolvedProjectId || undefined,
        projects,
        projectTargetLocales: fetchedProjectLocales,
        fetchedProjectId: projectQuery.data?.id,
      }),
    [fetchedProjectLocales, projectQuery.data?.id, projects, resolvedProjectId],
  );

  useEffect(() => {
    setAssigneeUserId(null);
    // A project switch lets that project's own template binding apply fresh (see the resolution
    // effect below), same as if the dialog had just opened on it.
    assigneeManuallySetRef.current = false;
    setCustomValues({});
    if (!resolvedProjectId || linkSegmentId) {
      return;
    }
    if (
      !shouldSanitizeIssueCreateTargetLocale({
        resolvedProjectId,
        projects,
        fetchedProjectId: projectQuery.data?.id,
        isProjectLocalesFetching: projectQuery.isFetching,
      })
    ) {
      return;
    }
    setTargetLocale((current) =>
      sanitizeIssueCreateTargetLocale({
        currentLocale: current,
        resolvedProjectId,
        projects,
        projectTargetLocales: fetchedProjectLocales,
        fetchedProjectId: projectQuery.data?.id,
      }),
    );
  }, [
    fetchedProjectLocales,
    linkSegmentId,
    projectQuery.data?.id,
    projectQuery.isFetching,
    projects,
    resolvedProjectId,
  ]);

  // Resolves the project's default template (and its assignee binding) once the config loads or
  // the selected project changes — precedence: in-session pick > initialTemplateKey > project
  // default > none. Runs after the effect above, which already reset assigneeUserId to null on
  // this same project change, so "assignee still unset" naturally holds when a binding should
  // apply. A loading or errored config means no template applies (correct failure direction: an
  // admin's misconfiguration should never block issue creation).
  useEffect(() => {
    if (!open || !resolvedProjectId) {
      return;
    }

    // An in-session pick or initialTemplateKey outranks the project default: nothing to resolve
    // for the template itself, but a newly selected project's binding for that template can
    // still apply.
    if (templateUserOverridden) {
      applyTemplateAssigneeBinding(templateKey);
      return;
    }
    if (initialTemplateKey) {
      applyTemplateAssigneeBinding(initialTemplateKey);
      return;
    }
    if (templateConfigQuery.isLoading || templateConfigQuery.isError) {
      return;
    }

    const defaultKey = templateConfigQuery.data?.defaultTemplateKey ?? null;
    // Same all-or-nothing guarantee applies to the binding: if the template itself didn't apply
    // (dirty description), the binding must not apply either, or the issue ends up silently
    // assigned via a template that was never actually applied.
    const applied = defaultKey === templateKey || applyTemplateChange(defaultKey, "automatic");
    if (applied) {
      applyTemplateAssigneeBinding(defaultKey);
    }
    // applyTemplateChange and applyTemplateAssigneeBinding close over component state each render
    // and are not stable references; the effect keys off the resolved template config and project
    // instead.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    open,
    resolvedProjectId,
    templateConfigQuery.data,
    templateConfigQuery.isLoading,
    templateConfigQuery.isError,
    templateUserOverridden,
    initialTemplateKey,
    templateKey,
  ]);

  const compactCustomColumns = useMemo(
    () => (columnsQuery.data ?? []).filter(isCreateCompactCustomColumn),
    [columnsQuery.data],
  );
  const showPriorityField = isIssueSheetColumnVisible(columnsQuery.data ?? [], "priority");

  const statusItems = useMemo(
    () =>
      issueStatusValues.map((value) => ({
        value,
        label: issueStatusLabel(intl, value),
      })),
    [intl],
  );
  const priorityItems = useMemo(
    () => issuePriorityValues.map((value) => ({ value, label: value })),
    [],
  );
  const templateItems = useMemo(
    () => [
      {
        value: NO_TEMPLATE_VALUE,
        label: intl.formatMessage(issueSheetTemplateMessages.noTemplateLabel),
      },
      ...issueSheetTemplates.map((template) => ({
        value: template.key,
        label: issueSheetTemplateLabel(intl, template.key),
      })),
    ],
    [intl],
  );
  const projectItems =
    projects?.map((project) => ({ value: project.id, label: project.name })) ?? [];
  const selectedProjectName =
    projects?.find((project) => project.id === selectedProjectId)?.name ??
    intl.formatMessage(messages.projectPlaceholder);

  function resetAfterCreateMore() {
    setTitle("");
    setCustomValues({});
    // Clear first, then let applyTemplateAssigneeBinding reapply the still-selected template's
    // configured assignee for issue #2 — matches the skeleton reapplication below (issueType and
    // priority also persist across "create more"). Order matters: applyTemplateAssigneeBinding is
    // a no-op when the user picked an assignee by hand on issue #1 (assigneeManuallySetRef is
    // deliberately left set, not reset here — a manual pick on issue #1 should not silently
    // persist onto issue #2 either), so the null set immediately before it is what actually clears
    // that case.
    setAssigneeUserId(null);
    applyTemplateAssigneeBinding(templateKey);
    // Re-derive the skeleton for the still-selected template (issueType/priority chips
    // deliberately persist across "create more", matching prior behavior; only the skeleton is
    // reapplied here so issue #2 isn't tagged with a template but no prompts).
    const template = findIssueSheetTemplate(templateKey);
    const rawSkeleton = template ? issueSheetTemplateSkeleton(intl, template.key) : null;
    setDescription(
      linkSegmentId
        ? composeIssueDescription({
            skeleton: rawSkeleton,
            sourceText: linkDefaultDescription,
            sourceLabel: intl.formatMessage(messages.sourceLabel),
          })
        : (rawSkeleton ?? ""),
    );
    setDescriptionDirty(false);
    if (linkSegmentId) {
      setTargetLocale(linkTargetLocale ?? "");
      setSourcePath(linkSourcePath ?? "");
      setLinkLabel(linkDefaultLinkLabel ?? "");
      setLinkUrl(linkDefaultLinkUrl ?? "");
    } else {
      setTargetLocale("");
      setSourcePath("");
      setLinkLabel("");
      setLinkUrl("");
    }
  }

  const createIssue = useMutation({
    mutationFn: async () => {
      if (!resolvedProjectId) {
        throw new Error(intl.formatMessage(messages.selectProject));
      }
      const trimmedTitle = title.trim();
      if (!trimmedTitle) {
        throw new Error(intl.formatMessage(messages.titleRequired));
      }
      const values = buildValuesPayload(customValues);
      // Structural, not a diff against the original skeleton (markdown normalizes through
      // TipTap): drops any heading with nothing under it. A template's own headings are never
      // parsed back out of the body afterward — templateKey is the only machine-readable
      // provenance. Only runs when a template is attached: this exists to drop unfilled template
      // prompts, not to "clean up" a manually-typed description — a user who writes their own
      // `## Follow-up` heading with nothing under it yet is not asking for it to be deleted.
      const submittedDescription = templateKey ? stripEmptySections(description) : description;
      const json = stringLink
        ? {
            title: trimmedTitle,
            description: submittedDescription,
            issueType,
            status,
            targetLocale: stringLink.targetLocale,
            sourcePath: stringLink.sourcePath,
            segmentId: stringLink.segmentId,
            translationKeyId: stringLink.translationKeyId,
            linkKind: "content_editor_segment" as const,
            linkLabel: linkLabel.trim() || stringLink.linkLabel || undefined,
            linkUrl: linkUrl.trim() || stringLink.linkUrl || undefined,
            priority,
            ...(assigneeUserId ? { assigneeUserId } : {}),
            ...(values ? { values } : {}),
            ...(templateKey ? { templateKey } : {}),
          }
        : {
            title: trimmedTitle,
            description: submittedDescription,
            issueType,
            status,
            targetLocale: targetLocale.trim() || undefined,
            sourcePath: sourcePath.trim() || undefined,
            linkKind: linkUrl.trim() ? ("url" as const) : ("manual" as const),
            linkLabel: linkLabel.trim() || undefined,
            linkUrl: linkUrl.trim() || undefined,
            priority,
            ...(assigneeUserId ? { assigneeUserId } : {}),
            ...(values ? { values } : {}),
            ...(templateKey ? { templateKey } : {}),
          };
      const response = await apiClient.api.orgs[":organizationSlug"].projects[":projectId"][
        "issue-sheet"
      ].$post({
        param: { organizationSlug, projectId: resolvedProjectId },
        json,
      } as never);
      if (response.status !== 201) {
        throw new Error(
          (await readApiResponseError(response, intl.formatMessage(messages.requestFailed)))
            .message || intl.formatMessage(messages.requestFailed),
        );
      }
      return response.json();
    },
    onSuccess: async () => {
      toast.success(intl.formatMessage(messages.issueAdded));
      await onCreated();
      if (createMore) {
        resetAfterCreateMore();
        return;
      }
      onOpenChange(false);
    },
    onError: (error) =>
      toast.error(
        error instanceof Error ? error.message : intl.formatMessage(messages.createFailed),
      ),
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) {
      return;
    }
    createIssue.mutate();
  }

  function handleFormKeyDown(event: KeyboardEvent<HTMLFormElement>) {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      if (canSubmit) {
        createIssue.mutate();
      }
    }
  }

  const canSubmit = !createIssue.isPending && Boolean(resolvedProjectId) && title.trim().length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-xl">
        <form
          onSubmit={submit}
          onKeyDown={handleFormKeyDown}
          className="flex min-h-0 flex-1 flex-col"
        >
          <DialogHeader className="px-5 pt-4 pb-2">
            <DialogTitle className="text-sm font-medium text-muted-foreground">
              <FormattedMessage {...messages.title} />
            </DialogTitle>
            <DialogDescription className="sr-only">
              <FormattedMessage {...messages.description} />
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 pb-3">
            <Input
              id="create-issue-title"
              name="title"
              value={title}
              onChange={(event) => setTitle(event.currentTarget.value)}
              placeholder={intl.formatMessage(messages.titlePlaceholder)}
              aria-label={intl.formatMessage(messages.titleLabel)}
              required
              autoFocus
              maxLength={256}
              className="h-auto rounded-none border-0 bg-transparent px-0 py-1 text-base font-medium shadow-none focus-visible:ring-0 md:text-lg"
            />

            <MarkdownEditor
              value={description}
              onChange={(value) => {
                setDescription(value);
                setDescriptionDirty(true);
              }}
              disabled={createIssue.isPending}
              placeholder={intl.formatMessage(messages.descriptionPlaceholder)}
              ariaLabel={intl.formatMessage(messages.descriptionLabel)}
              chrome="minimal"
              imageUpload={{
                organizationSlug,
                projectId: resolvedProjectId || null,
              }}
              className="min-h-28 bg-transparent px-0"
            />

            <div className="flex flex-wrap items-center gap-0.5 pt-1">
              <Select
                value={status}
                items={statusItems}
                onValueChange={(value) => {
                  if (value && issueStatusValues.includes(value as IssueStatusValue)) {
                    setStatus(value as IssueStatusValue);
                  }
                }}
                disabled={createIssue.isPending}
              >
                <SelectTrigger
                  aria-label={intl.formatMessage(messages.statusLabel)}
                  showIcon={false}
                  className={propertyTriggerClassName}
                >
                  <span className="flex items-center gap-1.5">
                    <IssueStatusIcon status={status} />
                    {issueStatusLabel(intl, status)}
                  </span>
                </SelectTrigger>
                <SelectContent>
                  {statusItems.map((item) => (
                    <SelectItem key={item.value} value={item.value} label={item.label}>
                      <span className="flex items-center gap-2">
                        <IssueStatusIcon status={item.value} />
                        {item.label}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {showPriorityField ? (
                <Select
                  value={priority}
                  items={priorityItems}
                  onValueChange={(value) => {
                    if (value && issuePriorityValues.includes(value as IssuePriorityValue)) {
                      setPriority(value as IssuePriorityValue);
                    }
                  }}
                  disabled={createIssue.isPending}
                >
                  <SelectTrigger
                    aria-label={intl.formatMessage(messages.priorityLabel)}
                    showIcon={false}
                    className={propertyTriggerClassName}
                  >
                    <span className="flex items-center gap-1.5">
                      <IssuePriorityIcon priority={priority} size="sm" />
                      {priority}
                    </span>
                  </SelectTrigger>
                  <SelectContent>
                    {priorityItems.map((item) => (
                      <SelectItem key={item.value} value={item.value} label={item.label}>
                        <span className="flex items-center gap-2">
                          <IssuePriorityIcon priority={item.value} size="sm" />
                          {item.label}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : null}

              <Select
                value={templateKey ?? NO_TEMPLATE_VALUE}
                items={templateItems}
                onValueChange={(value) => {
                  if (!value || value === NO_TEMPLATE_VALUE) {
                    clearTemplate();
                    return;
                  }
                  selectTemplate(value);
                }}
                disabled={createIssue.isPending}
              >
                <SelectTrigger
                  aria-label={intl.formatMessage(messages.setTemplate)}
                  showIcon={false}
                  className={propertyTriggerClassName}
                >
                  <span className="flex items-center gap-1.5">
                    <HugeiconsIcon icon={Tag01Icon} strokeWidth={1.8} className="size-3.5" />
                    {templateKey
                      ? issueSheetTemplateLabel(intl, templateKey)
                      : intl.formatMessage(issueSheetTemplateMessages.noTemplateLabel)}
                  </span>
                </SelectTrigger>
                <SelectContent>
                  {templateItems.map((item) => (
                    <SelectItem key={item.value} value={item.value} label={item.label}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {resolvedProjectId ? (
                <IssueAssigneePicker
                  value={assigneeUserId}
                  members={assignableMembersQuery.data?.members ?? []}
                  isLoading={assignableMembersQuery.isLoading}
                  disabled={createIssue.isPending}
                  onChange={(userId) => {
                    assigneeManuallySetRef.current = true;
                    setAssigneeUserId(userId);
                  }}
                  size="ghost"
                  triggerClassName={propertyTriggerClassName}
                />
              ) : null}

              {showProjectPicker ? (
                <Select
                  value={selectedProjectId || null}
                  items={projectItems}
                  onValueChange={(value) => {
                    setSelectedProjectId(value ?? "");
                    setAssigneeUserId(null);
                    setCustomValues({});
                  }}
                  disabled={createIssue.isPending}
                >
                  <SelectTrigger
                    aria-label={intl.formatMessage(messages.projectLabel)}
                    showIcon={false}
                    className={cn(propertyTriggerClassName, "max-w-40")}
                  >
                    <span className="truncate">{selectedProjectName}</span>
                  </SelectTrigger>
                  <SelectContent>
                    {projects?.map((project) => (
                      <SelectItem key={project.id} value={project.id} label={project.name}>
                        {project.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : null}

              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={intl.formatMessage(messages.moreProperties)}
                      disabled={createIssue.isPending}
                      className={propertyTriggerClassName}
                    />
                  }
                >
                  <HugeiconsIcon icon={MoreHorizontalCircle01Icon} className="size-4" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="min-w-56" sideOffset={6}>
                  <DropdownMenuGroup>
                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger>
                        <HugeiconsIcon icon={Tag01Icon} strokeWidth={1.8} className="size-4" />
                        <FormattedMessage {...messages.setType} />
                      </DropdownMenuSubTrigger>
                      <DropdownMenuSubContent className="min-w-52">
                        <DropdownMenuRadioGroup
                          value={issueType}
                          onValueChange={(value) => {
                            if (issueTypeValues.includes(value as IssueTypeValue)) {
                              setIssueType(value as IssueTypeValue);
                            }
                          }}
                        >
                          {issueTypeValues.map((value) => (
                            <DropdownMenuRadioItem key={value} value={value}>
                              {issueTypeLabel(intl, value)}
                            </DropdownMenuRadioItem>
                          ))}
                        </DropdownMenuRadioGroup>
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>

                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger>
                        <HugeiconsIcon
                          icon={LanguageCircleIcon}
                          strokeWidth={1.8}
                          className="size-4"
                        />
                        <FormattedMessage {...messages.setLocale} />
                      </DropdownMenuSubTrigger>
                      <DropdownMenuSubContent className="w-72 p-2">
                        <MenuTextField
                          htmlFor="create-issue-locale"
                          label={<FormattedMessage {...messages.localeLabel} />}
                        >
                          <IssueLocalePicker
                            id="create-issue-locale"
                            value={targetLocale || null}
                            locales={localeOptions}
                            allowClear
                            disabled={
                              createIssue.isPending || (!isOrganizationScoped && !resolvedProjectId)
                            }
                            size="sm"
                            onValueChange={(locale) => setTargetLocale(locale ?? "")}
                          />
                        </MenuTextField>
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>

                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger>
                        <HugeiconsIcon icon={File01Icon} strokeWidth={1.8} className="size-4" />
                        <FormattedMessage {...messages.setSourcePath} />
                      </DropdownMenuSubTrigger>
                      <DropdownMenuSubContent className="w-72 p-2">
                        <MenuTextField
                          htmlFor="create-issue-source-path"
                          label={<FormattedMessage {...messages.sourcePathLabel} />}
                        >
                          <Input
                            id="create-issue-source-path"
                            name="sourcePath"
                            value={sourcePath}
                            onChange={(event) => setSourcePath(event.currentTarget.value)}
                            placeholder={intl.formatMessage(messages.sourcePathPlaceholder)}
                            disabled={createIssue.isPending}
                            autoFocus
                          />
                        </MenuTextField>
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>

                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger>
                        <HugeiconsIcon icon={Link01Icon} strokeWidth={1.8} className="size-4" />
                        <FormattedMessage {...messages.addLink} />
                      </DropdownMenuSubTrigger>
                      <DropdownMenuSubContent className="w-72 space-y-2 p-2">
                        <MenuTextField
                          htmlFor="create-issue-link-label"
                          label={<FormattedMessage {...messages.linkLabelLabel} />}
                        >
                          <Input
                            id="create-issue-link-label"
                            name="linkLabel"
                            value={linkLabel}
                            onChange={(event) => setLinkLabel(event.currentTarget.value)}
                            placeholder={intl.formatMessage(messages.linkLabelPlaceholder)}
                            disabled={createIssue.isPending}
                            autoFocus
                          />
                        </MenuTextField>
                        <MenuTextField
                          htmlFor="create-issue-link-url"
                          label={<FormattedMessage {...messages.linkUrlLabel} />}
                        >
                          <Input
                            id="create-issue-link-url"
                            name="linkUrl"
                            type="url"
                            value={linkUrl}
                            onChange={(event) => setLinkUrl(event.currentTarget.value)}
                            placeholder={intl.formatMessage(messages.linkUrlPlaceholder)}
                            disabled={createIssue.isPending}
                          />
                        </MenuTextField>
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>
                  </DropdownMenuGroup>

                  {compactCustomColumns.length > 0 ? (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuGroup>
                        {compactCustomColumns.map((column) => {
                          const setLabel = intl.formatMessage(messages.setColumn, {
                            label: column.label,
                          });

                          if (column.type === "select") {
                            const options = columnSelectOptions(column.config);
                            return (
                              <DropdownMenuSub key={column.id}>
                                <DropdownMenuSubTrigger>
                                  <IssueColumnIcon iconId={column.icon} className="size-4" />
                                  {setLabel}
                                </DropdownMenuSubTrigger>
                                <DropdownMenuSubContent className="min-w-44">
                                  <DropdownMenuRadioGroup
                                    value={customValues[column.key] || ""}
                                    onValueChange={(next) => {
                                      setCustomValues((current) => ({
                                        ...current,
                                        [column.key]: next,
                                      }));
                                    }}
                                  >
                                    {options.map((option) => (
                                      <DropdownMenuRadioItem key={option.id} value={option.id}>
                                        {option.label}
                                      </DropdownMenuRadioItem>
                                    ))}
                                  </DropdownMenuRadioGroup>
                                  {customValues[column.key] ? (
                                    <>
                                      <DropdownMenuSeparator />
                                      <DropdownMenuItem
                                        onClick={() => {
                                          setCustomValues((current) => {
                                            const next = { ...current };
                                            delete next[column.key];
                                            return next;
                                          });
                                        }}
                                      >
                                        <FormattedMessage {...messages.clearValue} />
                                      </DropdownMenuItem>
                                    </>
                                  ) : null}
                                </DropdownMenuSubContent>
                              </DropdownMenuSub>
                            );
                          }

                          if (column.type === "user") {
                            const members = assignableMembersQuery.data?.members ?? [];
                            const selectedUserId = customValues[column.key] || null;
                            return (
                              <DropdownMenuSub key={column.id}>
                                <DropdownMenuSubTrigger>
                                  <IssueColumnIcon iconId={column.icon} className="size-4" />
                                  {setLabel}
                                </DropdownMenuSubTrigger>
                                <DropdownMenuSubContent className="min-w-52">
                                  <DropdownMenuItem
                                    onClick={() => {
                                      setCustomValues((current) => {
                                        const next = { ...current };
                                        delete next[column.key];
                                        return next;
                                      });
                                    }}
                                  >
                                    <FormattedMessage {...messages.unassigned} />
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  {members.map((member) => (
                                    <DropdownMenuItem
                                      key={member.userId}
                                      onClick={() => {
                                        setCustomValues((current) => ({
                                          ...current,
                                          [column.key]: member.userId,
                                        }));
                                      }}
                                    >
                                      <span className="truncate">
                                        {member.displayName.trim() || member.email}
                                      </span>
                                      {selectedUserId === member.userId ? (
                                        <span className="ms-auto text-xs text-muted-foreground">
                                          ✓
                                        </span>
                                      ) : null}
                                    </DropdownMenuItem>
                                  ))}
                                </DropdownMenuSubContent>
                              </DropdownMenuSub>
                            );
                          }

                          return (
                            <DropdownMenuSub key={column.id}>
                              <DropdownMenuSubTrigger>
                                <IssueColumnIcon iconId={column.icon} className="size-4" />
                                {setLabel}
                              </DropdownMenuSubTrigger>
                              <DropdownMenuSubContent className="w-64 p-2">
                                <MenuTextField
                                  htmlFor={`create-issue-custom-${column.key}`}
                                  label={column.label}
                                >
                                  <Input
                                    id={`create-issue-custom-${column.key}`}
                                    value={customValues[column.key] ?? ""}
                                    onChange={(event) => {
                                      const nextValue = event.currentTarget.value;
                                      setCustomValues((current) => ({
                                        ...current,
                                        [column.key]: nextValue,
                                      }));
                                    }}
                                    disabled={createIssue.isPending}
                                    autoFocus
                                  />
                                </MenuTextField>
                              </DropdownMenuSubContent>
                            </DropdownMenuSub>
                          );
                        })}
                      </DropdownMenuGroup>
                    </>
                  ) : null}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          <DialogFooter className="flex-row items-center justify-between gap-3 border-t border-border px-5 py-3 sm:justify-between">
            <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
              <input
                type="checkbox"
                className="size-4 rounded border border-input accent-primary"
                checked={createMore}
                disabled={createIssue.isPending}
                onChange={(event) => setCreateMore(event.currentTarget.checked)}
              />
              <FormattedMessage {...messages.createMore} />
            </label>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={createIssue.isPending}
                onClick={() => onOpenChange(false)}
              >
                <FormattedMessage {...messages.cancel} />
              </Button>
              <Button type="submit" disabled={!canSubmit}>
                {createIssue.isPending ? <Spinner className="size-4" /> : null}
                <FormattedMessage {...messages.submit} />
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
