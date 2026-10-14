import {
  Banner,
  Bold,
  Button,
  Columns,
  Container,
  Divider,
  Dropdown,
  IconButton,
  IconRefresh16,
  IconWand16,
  Link,
  Muted,
  Text,
  Textbox,
  VerticalSpace,
} from "@create-figma-plugin/ui";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";

import {
  bindFigmaProject,
  createFigmaJob,
  fetchCurrentFigmaJob,
  fetchFigmaSession,
  FIGMA_JOB_POLL_INTERVAL_MS,
  getFigmaJob,
  HyperlocaliseClientError,
  isFigmaPageJobPayload,
  pullFigmaSourcePage,
  pullFigmaTranslations,
  resourceAuthFromSettings,
  type FigmaSessionProject,
} from "./hyperlocalise-client";
import type { FigmaPageJobBinding } from "./page-binding";
import type {
  FigmaFileInfo,
  FigmaPageJob,
  FigmaPageOption,
  PluginSettings,
  SandboxToUiMessage,
  UiToSandboxMessage,
} from "./plugin-messages";
import { remapExtractedSegmentsToSource } from "./extract-source";
import { FormField } from "./form-field";
import { TooltipButton, TooltipWrap } from "./tooltip-wrap";
import { PageMultiSelect } from "./page-multi-select";
import { defaultSelectedLocale, localeLabel, translateToOptionsForProject } from "./locale-label";
import { isInFlightJobStatus, jobPollingStepProgress, pageJobFromCreate } from "./page-job-ui";
import {
  canApplySelectedPages,
  fetchFigmaLocaleStatuses,
  selectedPagesCollected,
  type FigmaLocaleStatus,
} from "./figma-locale-status";
import { localesMatchForPick, pickTranslationsForLocale } from "./locale-map";
import {
  DEFAULT_APP_URL,
  DEFAULT_SETTINGS,
  hadLegacyFigmaSession,
  mergeSettings,
  recordAppliedLocales,
  resolvePersistedProjectId,
  selectedPagesShowSourceLocale,
} from "./settings";
import {
  applyOutcomeMessage,
  formatActionError,
  toastBannerVariant,
  uploadPreviewSummary,
  uniqueUploadedTextCount,
  type AppToast,
  type FigmaUploadPreview,
  type StepProgress,
} from "./workflow-ui";
import { FieldSkeleton, WorkflowSkeleton } from "./loading-skeleton";
import { usePluginUiResize } from "./use-plugin-ui-resize";

import "./ui.css";

const LEGACY_SESSION_MESSAGE =
  "Your previous Hyperlocalise sign-in is no longer supported. Connect with a connection token from Integrations.";

type BusyAction = "login" | "bind" | "upload" | "apply" | "translate" | null;

function preventLinkNavigation(event: Event) {
  event.preventDefault();
}

function postPluginMessage(message: UiToSandboxMessage) {
  parent.postMessage({ pluginMessage: message }, "*");
}

function requestFromSandbox<T extends SandboxToUiMessage["type"]>(
  message: UiToSandboxMessage,
  expectedType: T,
): Promise<Extract<SandboxToUiMessage, { type: T }>> {
  return new Promise((resolve, reject) => {
    const handleMessage = (event: MessageEvent<{ pluginMessage?: SandboxToUiMessage }>) => {
      const payload = event.data.pluginMessage;
      if (!payload) {
        return;
      }
      if (payload.type === "error") {
        window.removeEventListener("message", handleMessage);
        reject(new Error(payload.message));
        return;
      }
      if (payload.type === expectedType) {
        window.removeEventListener("message", handleMessage);
        resolve(payload as Extract<SandboxToUiMessage, { type: T }>);
      }
    };

    window.addEventListener("message", handleMessage);
    postPluginMessage(message);
  });
}

function isReconnectError(error: unknown) {
  if (!(error instanceof HyperlocaliseClientError)) {
    return false;
  }

  return (
    error.code === "unauthorized" ||
    error.code === "forbidden" ||
    error.code === "workspace_archived"
  );
}

function allPageIds(pageList: FigmaPageOption[]) {
  return pageList.map((page) => page.pageId);
}

function normalizeSelectedPageIds(selected: string[], pageList: FigmaPageOption[]) {
  const valid = new Set(allPageIds(pageList));
  return selected.filter((id) => valid.has(id));
}

function resolveSelectedPageIds(saved: string[], pageList: FigmaPageOption[]) {
  const normalized = normalizeSelectedPageIds(saved, pageList);
  return normalized.length > 0 ? normalized : allPageIds(pageList);
}

export function App() {
  const [settings, setSettings] = useState<PluginSettings>(DEFAULT_SETTINGS);
  const [tokenDraft, setTokenDraft] = useState("");
  const [file, setFile] = useState<FigmaFileInfo | null>(null);
  const [pages, setPages] = useState<FigmaPageOption[]>([]);
  const [projects, setProjects] = useState<FigmaSessionProject[]>([]);
  const [pageBinding, setPageBinding] = useState<FigmaPageJobBinding | null>(null);
  const [pageJob, setPageJob] = useState<FigmaPageJob | null>(null);
  const [busy, setBusy] = useState<BusyAction>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [booted, setBooted] = useState(false);
  const [workspaceLoading, setWorkspaceLoading] = useState(false);
  const [projectsReloading, setProjectsReloading] = useState(false);
  const [pagesLoading, setPagesLoading] = useState(true);
  const [localesLoading, setLocalesLoading] = useState(false);
  const [applyStatusLoading, setApplyStatusLoading] = useState(false);
  const [localeStatuses, setLocaleStatuses] = useState<FigmaLocaleStatus[]>([]);
  const [uploadPreview, setUploadPreview] = useState<FigmaUploadPreview | null>(null);
  const [uploadPreviewLoading, setUploadPreviewLoading] = useState(false);
  const [bindProgress, setBindProgress] = useState<StepProgress | null>(null);
  const [applyProgress, setApplyProgress] = useState<StepProgress | null>(null);
  const [translateProgress, setTranslateProgress] = useState<StepProgress | null>(null);
  const [toast, setToast] = useState<AppToast | null>(null);
  const [pickingProject, setPickingProject] = useState(false);
  const [jobPollPulse, setJobPollPulse] = useState(0);
  const pageIdRef = useRef<string | null>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const hasReceivedReadyRef = useRef(false);

  const showToast = (message: string, tone: AppToast["tone"] = "positive") => {
    setToast({ message, tone });
  };

  useEffect(() => {
    if (!toast) {
      return;
    }
    const timeout = window.setTimeout(() => setToast(null), 5_000);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  const selectedPageIds = settings.selectedPageIds;
  const primaryPageId = useMemo(() => {
    const selected = normalizeSelectedPageIds(selectedPageIds, pages);
    if (selected.length > 0) {
      return selected[0]!;
    }
    return file?.pageId ?? "";
  }, [file?.pageId, pages, selectedPageIds]);

  const workFile = useMemo((): FigmaFileInfo | null => {
    if (!file || !primaryPageId) {
      return null;
    }
    const pageName =
      (pages ?? []).find((page) => page.pageId === primaryPageId)?.pageName ?? file.pageName;
    return { ...file, pageId: primaryPageId, pageName };
  }, [file, pages, primaryPageId]);

  const auth = resourceAuthFromSettings(settings);
  const connected = Boolean(auth);
  const selectedProject = projects.find((project) => project.id === settings.projectId);
  const sourceLocale = selectedProject?.sourceLocale ?? "en";
  const translateToOptions = translateToOptionsForProject(selectedProject);
  const showConnectScreen = booted && !connected;
  const showProjectScreen = booted && connected && (pickingProject || !settings.projectId);
  const showWorkflowScreen = booted && connected && Boolean(settings.projectId) && !pickingProject;
  const workflowHydrating =
    workspaceLoading || (pagesLoading && pages.length === 0 && Boolean(settings.projectId));

  const uiLayoutKey = [
    booted ? "1" : "0",
    connected ? "1" : "0",
    settings.projectId,
    pickingProject ? "1" : "0",
    uploadPreview ? "upload" : "workflow",
    workflowHydrating ? "1" : "0",
    busy ?? "",
    uploadPreviewLoading ? "1" : "0",
    projectsReloading ? "1" : "0",
    localesLoading ? "1" : "0",
    pagesLoading ? "1" : "0",
    toast?.message ?? "",
    statusMessage ?? "",
    errorMessage ?? "",
  ].join("|");

  usePluginUiResize(shellRef, postPluginMessage, uiLayoutKey);

  const selectedLocaleStatus = localeStatuses.find((entry) =>
    localesMatchForPick(settings.selectedLocale, entry.locale),
  );
  const sourceLocaleStatus =
    localeStatuses.find((entry) => entry.isSource) ??
    localeStatuses.find((entry) => entry.locale === sourceLocale);
  const canUploadSource = selectedPagesShowSourceLocale(
    settings.appliedLocaleByPage,
    selectedPageIds,
    sourceLocale,
  );
  const canUpload =
    connected &&
    Boolean(settings.projectId) &&
    selectedPageIds.length > 0 &&
    canUploadSource &&
    busy == null &&
    Boolean(file) &&
    !pagesLoading;
  const applyEligible =
    connected &&
    Boolean(settings.projectId) &&
    selectedPageIds.length > 0 &&
    Boolean(settings.selectedLocale) &&
    canApplySelectedPages(selectedLocaleStatus, selectedPageIds);
  const applyButtonLoading = busy === "apply";
  const applyButtonDisabled =
    (!applyEligible && busy !== "apply") ||
    applyStatusLoading ||
    (busy != null && busy !== "apply");
  const pagesUploaded = selectedPagesCollected(sourceLocaleStatus, selectedPageIds);
  const canTranslate =
    connected &&
    Boolean(settings.projectId) &&
    selectedPageIds.length > 0 &&
    Boolean(settings.selectedLocale) &&
    settings.selectedLocale !== sourceLocale &&
    !localesLoading &&
    (pagesUploaded || canUploadSource) &&
    busy == null &&
    Boolean(file) &&
    !pagesLoading;

  const uploadTooltip = !canUpload
    ? selectedPageIds.length === 0
      ? "Select at least one page to upload."
      : !canUploadSource
        ? `Apply ${localeLabel(sourceLocale)} to the design before uploading.`
        : pagesLoading
          ? "Loading pages..."
          : busy != null
            ? "Wait for the current step to finish."
            : undefined
    : undefined;
  const translateTooltip = !canTranslate
    ? settings.selectedLocale === sourceLocale
      ? "Choose a target language to translate."
      : selectedPageIds.length === 0
        ? "Select at least one page to translate."
        : localesLoading
          ? "Loading translation status..."
          : !pagesUploaded && !canUploadSource
            ? `Apply ${localeLabel(sourceLocale)} to the design before translating.`
            : busy != null
              ? "Wait for the current step to finish."
              : undefined
    : undefined;
  const applyTooltip = applyButtonDisabled
    ? !settings.selectedLocale
      ? "Choose a language."
      : selectedPageIds.length === 0
        ? "Select at least one page to apply."
        : applyStatusLoading
          ? "Loading translation status..."
          : busy != null && busy !== "apply"
            ? "Wait for the current step to finish."
            : "No translations for the selected pages yet."
    : "Apply Hyperlocalise translations to the selected pages";

  const persistSettings = (next: PluginSettings) => {
    const settingsToStore = { ...next, appUrl: DEFAULT_APP_URL };
    setSettings(settingsToStore);
    postPluginMessage({ type: "storage-set", settings: settingsToStore });
  };

  const loadPageBinding = (pageId: string) => {
    void (async () => {
      try {
        const loaded = await requestFromSandbox({ type: "binding-read", pageId }, "binding-loaded");
        setPageBinding((current) => {
          return loaded.pageId === pageId ? loaded.binding : current;
        });
      } catch {
        setPageBinding(null);
      }
    })();
  };

  const updatePageSelection = (nextIds: string[]) => {
    persistSettings({ ...settings, selectedPageIds: nextIds });
    setPageJob(null);
    setStatusMessage(null);
    setErrorMessage(null);
    pageIdRef.current = nextIds[0] ?? null;
    if (nextIds.length === 1 && nextIds[0]) {
      loadPageBinding(nextIds[0]);
    } else {
      setPageBinding(null);
    }
  };

  const clearConnection = (current: PluginSettings) => ({
    ...current,
    accessToken: null,
    connectionToken: null,
    personalAccessToken: null,
    userEmail: null,
    organizationSlug: "",
    organizationName: null,
  });

  const persistBinding = (binding: FigmaPageJobBinding | null, pageId: string) => {
    if (pageIdRef.current === pageId) {
      setPageBinding(binding);
    }
    if (binding) {
      postPluginMessage({ type: "binding-set", binding, pageId });
    } else {
      postPluginMessage({ type: "binding-clear", pageId });
    }
  };

  const rememberPageJob = (job: FigmaPageJob, pageId: string) => {
    persistBinding(
      {
        projectId: job.projectId,
        jobId: job.jobId,
        sourcePath: job.sourcePath,
      },
      pageId,
    );
    if (pageIdRef.current !== pageId) {
      return;
    }
    setPageJob(job);
    setSettings((current) => {
      const next = { ...current, lastJobId: job.jobId };
      postPluginMessage({ type: "storage-set", settings: next });
      return next;
    });
  };

  const rememberCreatedJob = (
    created: { jobId: string; projectId: string; sourcePath: string },
    pageId: string,
    options: { showInFlightUi: boolean; targetLocales: string[] },
  ) => {
    persistBinding(
      {
        projectId: created.projectId,
        jobId: created.jobId,
        sourcePath: created.sourcePath,
      },
      pageId,
    );
    if (pageIdRef.current === pageId) {
      if (options.showInFlightUi) {
        setPageJob(
          pageJobFromCreate({
            jobId: created.jobId,
            projectId: created.projectId,
            sourcePath: created.sourcePath,
            targetLocales: options.targetLocales,
          }),
        );
      } else {
        setPageJob(null);
      }
    }
    setSettings((current) => {
      const next = { ...current, lastJobId: created.jobId };
      postPluginMessage({ type: "storage-set", settings: next });
      return next;
    });
  };

  useEffect(() => {
    pageIdRef.current = workFile?.pageId ?? null;
  }, [workFile?.pageId]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent<{ pluginMessage?: SandboxToUiMessage }>) => {
      const payload = event.data.pluginMessage;
      if (payload?.type === "ready") {
        const merged = mergeSettings(payload.settings);
        const pageList = payload.pages ?? [];
        const selectedPageIds = resolveSelectedPageIds(merged.selectedPageIds, pageList);
        const nextSettings = { ...merged, selectedPageIds };
        setSettings(nextSettings);
        if (selectedPageIds.join(",") !== merged.selectedPageIds.join(",")) {
          postPluginMessage({
            type: "storage-set",
            settings: { ...nextSettings, appUrl: DEFAULT_APP_URL },
          });
        }
        if (payload.legacySessionCleared || hadLegacyFigmaSession(payload.settings)) {
          setErrorMessage(LEGACY_SESSION_MESSAGE);
        }
        setFile(payload.file);
        setPages(pageList);
        pageIdRef.current = selectedPageIds[0] ?? payload.file.pageId;
        setPageBinding(selectedPageIds.length === 1 ? payload.binding : null);
        const isInitialReady = !hasReceivedReadyRef.current;
        hasReceivedReadyRef.current = true;
        setBooted(true);
        setPagesLoading(false);
        if (isInitialReady && resourceAuthFromSettings(nextSettings)) {
          setWorkspaceLoading(true);
        }
      }
      if (payload?.type === "page-changed") {
        const pageList = payload.pages ?? [];
        setFile(payload.file);
        setPages(pageList);
        pageIdRef.current = payload.file.pageId;
        setSettings((current) => {
          const nextSelected = resolveSelectedPageIds(
            normalizeSelectedPageIds(current.selectedPageIds, pageList),
            pageList,
          );
          return { ...current, selectedPageIds: nextSelected };
        });
        setPageBinding(null);
        setPageJob(null);
        setStatusMessage(null);
      }
    };

    window.addEventListener("message", handleMessage);
    postPluginMessage({ type: "boot" });
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  useEffect(() => {
    if (!booted || !auth) {
      setWorkspaceLoading(false);
      return;
    }

    let cancelled = false;

    async function loadWorkspace() {
      setWorkspaceLoading(true);
      try {
        const session = await fetchFigmaSession({
          appUrl: settings.appUrl,
          auth: auth!,
        });
        if (cancelled) {
          return;
        }

        setProjects(session.projects);
        const boundProject = session.project;
        const nextProjectId =
          boundProject?.id ?? resolvePersistedProjectId(settings.projectId, session.projects);
        const nextProject =
          boundProject ?? session.projects.find((project) => project.id === nextProjectId);
        persistSettings({
          ...settings,
          userEmail: null,
          organizationSlug: session.organization.slug ?? "",
          organizationName: session.organization.name,
          projectId: nextProjectId,
          selectedLocale: defaultSelectedLocale(nextProject ?? null, settings.selectedLocale),
        });
      } catch (error) {
        if (cancelled) {
          return;
        }
        if (isReconnectError(error)) {
          persistSettings(clearConnection(settings));
        }
        setErrorMessage(error instanceof Error ? error.message : "Unable to load workspace.");
      } finally {
        if (!cancelled) {
          setWorkspaceLoading(false);
        }
      }
    }

    void loadWorkspace();
    return () => {
      cancelled = true;
    };
  }, [booted, settings.accessToken, settings.connectionToken]);

  const refreshLocaleStatuses = async () => {
    if (!auth || !file || !settings.projectId || selectedPageIds.length === 0) {
      setLocaleStatuses([]);
      return;
    }
    const projectForLocales =
      projects.find((project) => project.id === settings.projectId) ?? selectedProject;
    const targetLocales = projectForLocales?.targetLocales ?? [];
    const statuses = await fetchFigmaLocaleStatuses({
      appUrl: settings.appUrl,
      auth,
      projectId: settings.projectId,
      fileKey: file.fileKey,
      pageIds: selectedPageIds,
      sourceLocale,
      targetLocales,
    });
    setLocaleStatuses(statuses);
  };

  useEffect(() => {
    if (
      !booted ||
      !auth ||
      !file ||
      !settings.projectId ||
      selectedPageIds.length === 0 ||
      projects.length === 0
    ) {
      return;
    }

    let cancelled = false;

    async function hydrateLocaleStatuses() {
      try {
        await refreshLocaleStatuses();
      } catch {
        if (!cancelled) {
          setLocaleStatuses([]);
        }
      }
    }

    void hydrateLocaleStatuses();
    return () => {
      cancelled = true;
    };
  }, [
    booted,
    settings.accessToken,
    settings.connectionToken,
    settings.projectId,
    file?.fileKey,
    selectedPageIds.join(","),
    sourceLocale,
    projects.map((project) => project.id).join(","),
  ]);

  useEffect(() => {
    if (
      !auth ||
      !file ||
      !settings.projectId ||
      selectedPageIds.length === 0 ||
      !settings.selectedLocale ||
      projects.length === 0
    ) {
      setApplyStatusLoading(false);
      return;
    }

    let cancelled = false;

    async function refreshApplyEligibility() {
      setApplyStatusLoading(true);
      try {
        await refreshLocaleStatuses();
      } catch {
        if (!cancelled) {
          setLocaleStatuses([]);
        }
      } finally {
        if (!cancelled) {
          setApplyStatusLoading(false);
        }
      }
    }

    void refreshApplyEligibility();
    return () => {
      cancelled = true;
      setApplyStatusLoading(false);
    };
  }, [
    settings.projectId,
    settings.selectedLocale,
    selectedPageIds.join(","),
    settings.accessToken,
    settings.connectionToken,
    file?.fileKey,
    projects.map((project) => project.id).join(","),
  ]);

  useEffect(() => {
    if (!booted || !auth || !file || selectedPageIds.length !== 1) {
      return;
    }

    const projectId = pageBinding?.projectId || settings.projectId;
    if (!projectId) {
      return;
    }

    let cancelled = false;

    async function hydratePageJob() {
      const originatedPageId = selectedPageIds[0]!;
      try {
        const { job } = await fetchCurrentFigmaJob({
          appUrl: settings.appUrl,
          auth: auth!,
          fileKey: file!.fileKey,
          pageId: originatedPageId,
          projectId,
        });
        if (job) {
          rememberPageJob(job, originatedPageId);
          if (cancelled || pageIdRef.current !== originatedPageId) {
            return;
          }
          if (job.status === "failed") {
            showToast(job.lastError || "Translation failed.", "critical");
          }
          if (!settings.selectedLocale) {
            const translationLocales = Object.keys(job.translationsByLocale);
            const nextLocale = job.targetLocales.find(Boolean) ?? translationLocales.find(Boolean);
            if (nextLocale) {
              persistSettings({ ...settings, selectedLocale: nextLocale });
            }
          }
          return;
        }
        persistBinding(null, originatedPageId);
        if (cancelled || pageIdRef.current !== originatedPageId) {
          return;
        }
        setPageJob(null);
      } catch (error) {
        if (pageBinding?.jobId) {
          try {
            const job = await getFigmaJob({
              appUrl: settings.appUrl,
              auth: auth!,
              jobId: pageBinding.jobId,
            });
            rememberPageJob(job, originatedPageId);
            return;
          } catch {
            // Keep the page binding and show the stored job id as a fallback.
          }
        }
        if (!cancelled && pageIdRef.current === originatedPageId) {
          setErrorMessage(error instanceof Error ? error.message : "Unable to load the page job.");
        }
      }
    }

    void hydratePageJob();
    return () => {
      cancelled = true;
    };
  }, [
    booted,
    settings.accessToken,
    settings.connectionToken,
    settings.projectId,
    file?.fileKey,
    selectedPageIds.join(","),
    pageBinding?.projectId,
  ]);

  useEffect(() => {
    if (!pageJob || !isInFlightJobStatus(pageJob.status) || !auth) {
      return;
    }

    let cancelled = false;
    const jobId = pageJob.jobId;
    const originatedPageId = pageIdRef.current;

    async function refreshJob() {
      try {
        const job = await getFigmaJob({
          appUrl: settings.appUrl,
          auth: auth!,
          jobId,
        });
        if (cancelled || !originatedPageId) {
          return;
        }
        persistBinding(
          {
            projectId: job.projectId,
            jobId: job.jobId,
            sourcePath: job.sourcePath,
          },
          originatedPageId,
        );
        if (pageIdRef.current !== originatedPageId) {
          return;
        }
        setPageJob(job);
        if (!isInFlightJobStatus(job.status)) {
          if (job.status === "succeeded") {
            showToast("Translations are ready. Choose a language and apply.", "positive");
          } else if (job.status === "waiting_for_review") {
            showToast("Needs review. You can still pull the current translations.", "info");
          } else if (job.status === "failed") {
            showToast(job.lastError || "Translation failed.", "critical");
          }
        } else {
          setJobPollPulse((current) => current + 1);
        }
      } catch (error) {
        if (!cancelled && originatedPageId && pageIdRef.current === originatedPageId) {
          setErrorMessage(error instanceof Error ? error.message : "Unable to check job status.");
        }
      }
    }

    void refreshJob();
    const interval = window.setInterval(() => {
      void refreshJob();
    }, FIGMA_JOB_POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [pageJob?.jobId, pageJob?.status, settings.accessToken, settings.connectionToken]);

  const runAction = async (action: Exclude<BusyAction, null>, work: () => Promise<void>) => {
    setBusy(action);
    setErrorMessage(null);
    try {
      await work();
    } catch (error) {
      if (isReconnectError(error)) {
        persistSettings(clearConnection(settings));
        showToast("Reconnect Hyperlocalise to continue.", "critical");
        return;
      }
      showToast(formatActionError(error), "critical");
    } finally {
      setBusy(null);
    }
  };

  const reloadLocaleOptions = async () => {
    if (!auth) {
      return;
    }
    setLocalesLoading(true);
    try {
      const session = await fetchFigmaSession({
        appUrl: settings.appUrl,
        auth,
      });
      setProjects(session.projects);
      const boundProject = session.project;
      const nextProjectId =
        boundProject?.id ?? resolvePersistedProjectId(settings.projectId, session.projects);
      const nextProject =
        boundProject ?? session.projects.find((project) => project.id === nextProjectId);
      persistSettings({
        ...settings,
        organizationSlug: session.organization.slug ?? "",
        organizationName: session.organization.name,
        projectId: nextProjectId,
        selectedLocale: defaultSelectedLocale(nextProject ?? null, settings.selectedLocale),
      });
      await refreshLocaleStatuses();
    } catch (error) {
      if (isReconnectError(error)) {
        persistSettings(clearConnection(settings));
        showToast("Reconnect Hyperlocalise to continue.", "critical");
        return;
      }
      showToast(error instanceof Error ? error.message : "Unable to reload languages.", "warn");
    } finally {
      setLocalesLoading(false);
    }
  };

  const reloadPages = () => {
    setPagesLoading(true);
    postPluginMessage({ type: "boot" });
  };

  const handleConnect = () =>
    runAction("login", async () => {
      const connectionToken = tokenDraft.trim();
      if (!connectionToken) {
        throw new Error("Paste a connection token from Integrations to connect.");
      }

      const session = await fetchFigmaSession({
        appUrl: settings.appUrl,
        auth: { connectionToken },
      });
      persistSettings({
        ...settings,
        accessToken: null,
        connectionToken,
        personalAccessToken: null,
        userEmail: null,
        organizationSlug: session.organization.slug ?? "",
        organizationName: session.organization.name,
      });
      setTokenDraft("");
      showToast("Connected.");
    });

  const handleProjectChange = (projectId: string) =>
    runAction("bind", async () => {
      const setStep = (label: string, value: number) => {
        setBindProgress({ label, value });
      };

      try {
        if (!auth) {
          throw new Error("Connect first.");
        }
        const project = projects.find((item) => item.id === projectId);
        setStep("Connecting project...", 20);
        const session = await bindFigmaProject({
          appUrl: settings.appUrl,
          auth,
          projectId,
        });
        setProjects(session.projects);
        const boundProject = session.project ?? project;
        setStep("Loading languages...", 55);
        persistSettings({
          ...settings,
          projectId,
          organizationSlug: session.organization.slug ?? settings.organizationSlug,
          organizationName: session.organization.name,
          selectedLocale: defaultSelectedLocale(boundProject ?? null, settings.selectedLocale),
          appliedLocaleByPage: {},
        });
        setStep("Almost ready...", 90);
        await refreshLocaleStatuses();
        setPickingProject(false);
      } finally {
        setBindProgress(null);
      }
    });

  const handleDisconnect = () => {
    persistSettings({
      ...clearConnection(settings),
      lastJobId: null,
      projectId: "",
      appliedLocaleByPage: {},
    });
    setPickingProject(false);
    setTokenDraft("");
    setProjects([]);
    setPageJob(null);
    setLocaleStatuses([]);
    setUploadPreview(null);
    showToast("Disconnected.", "info");
  };

  const ensureExtractedForPage = async (pageId: string) => {
    const result = await requestFromSandbox(
      {
        type: "extract",
        pageId,
        preserveFormatting: settings.preserveFormatting,
      },
      "extracted",
    );
    setFile(result.file);
    pageIdRef.current = pageId;
    return result;
  };

  const resolveSourceSegmentsForPage = async (
    pageId: string,
    extracted: Awaited<ReturnType<typeof ensureExtractedForPage>>,
  ) => {
    if (!auth || !settings.projectId) {
      return extracted.segments;
    }
    try {
      const sourcePage = await pullFigmaSourcePage({
        appUrl: settings.appUrl,
        auth,
        projectId: settings.projectId,
        fileKey: extracted.file.fileKey,
        pageId,
        locale: sourceLocale,
      });
      return remapExtractedSegmentsToSource(extracted.segments, sourcePage);
    } catch {
      return extracted.segments;
    }
  };

  const waitForJobCompletion = async (
    jobId: string,
    originatedPageId: string,
    onProgress?: (completed: number, total: number) => void,
  ) => {
    if (!auth) {
      return null;
    }

    let polls = 0;
    for (;;) {
      if (pageIdRef.current !== originatedPageId) {
        return null;
      }
      const job = await getFigmaJob({
        appUrl: settings.appUrl,
        auth: auth,
        jobId,
      });
      rememberPageJob(job, originatedPageId);
      polls += 1;
      onProgress?.(polls, polls + 4);
      if (!isInFlightJobStatus(job.status)) {
        return job;
      }
      await new Promise((resolve) => {
        window.setTimeout(resolve, FIGMA_JOB_POLL_INTERVAL_MS);
      });
    }
  };

  const applyTranslationsForLocale = async (originatedPageId: string, locale: string) => {
    if (!auth || !file) {
      throw new Error("Connect first.");
    }
    const projectId = pageJob?.projectId || settings.projectId;
    if (!projectId) {
      throw new Error("Select a project to pull translations from.");
    }

    let localeTranslations: Record<string, string> | undefined;

    const applyingSource = localesMatchForPick(locale, sourceLocale);

    if (applyingSource) {
      try {
        const sourcePage = await pullFigmaSourcePage({
          appUrl: settings.appUrl,
          auth,
          projectId,
          fileKey: file.fileKey,
          pageId: originatedPageId,
          locale: sourceLocale,
        });
        if (!sourcePage.needsReupload && sourcePage.entries.length > 0) {
          localeTranslations = Object.fromEntries(
            sourcePage.entries.map((entry) => [entry.key, entry.source]),
          );
        }
      } catch {
        localeTranslations = undefined;
      }
    }

    if (!localeTranslations) {
      const pulled = await pullFigmaTranslations({
        appUrl: settings.appUrl,
        auth: auth,
        projectId,
        fileKey: file.fileKey,
        pageId: originatedPageId,
      });
      let translationsByLocale: Record<string, Record<string, string>>;
      if (isFigmaPageJobPayload(pulled)) {
        rememberPageJob(pulled, originatedPageId);
        translationsByLocale = pulled.translationsByLocale;
      } else {
        translationsByLocale = pulled;
      }
      if (pageIdRef.current !== originatedPageId) {
        return 0;
      }
      localeTranslations = pickTranslationsForLocale(translationsByLocale, locale);
    }

    if (pageIdRef.current !== originatedPageId) {
      return 0;
    }
    if (!localeTranslations) {
      throw new Error("No translations for the selected language.");
    }

    const extracted = await requestFromSandbox(
      {
        type: "extract",
        pageId: originatedPageId,
        preserveFormatting: settings.preserveFormatting,
      },
      "extracted",
    );
    if (pageIdRef.current !== originatedPageId) {
      return 0;
    }
    const sourceByKey = Object.fromEntries(
      extracted.segments.map((segment) => [segment.key, segment.text]),
    );

    const applied = await requestFromSandbox(
      {
        type: "apply",
        pageId: originatedPageId,
        translations: localeTranslations,
        sourceByKey,
        preserveFormatting: settings.preserveFormatting,
      },
      "applied",
    );
    return applied.count;
  };

  const createJobForPage = async (pageId: string, generate: boolean) => {
    if (!auth || !settings.projectId) {
      throw new Error("Connect and choose a project first.");
    }
    const locale = settings.selectedLocale;
    if (!locale) {
      throw new Error("Choose a language.");
    }
    if (generate && locale === sourceLocale) {
      throw new Error("Choose a target language to translate.");
    }

    pageIdRef.current = pageId;
    const extracted = await ensureExtractedForPage(pageId);
    const segments = await resolveSourceSegmentsForPage(pageId, extracted);
    if (segments.length === 0) {
      throw new Error("No text found on the selected page.");
    }

    const originatedPageId = pageId;
    const jobTargetLocales =
      locale === sourceLocale && !generate
        ? (selectedProject?.targetLocales.map((entry) => entry.trim()).filter(Boolean) ?? [])
        : [locale];
    if (jobTargetLocales.length === 0) {
      throw new Error("This project has no target languages configured.");
    }

    const created = await createFigmaJob({
      appUrl: settings.appUrl,
      auth,
      projectId: settings.projectId,
      fileKey: extracted.file.fileKey,
      pageId: originatedPageId,
      fileName: extracted.file.fileName,
      pageName: extracted.file.pageName,
      sourceLocale,
      targetLocales: jobTargetLocales,
      generate,
      segments,
    });

    rememberCreatedJob(created, originatedPageId, {
      showInFlightUi: generate,
      targetLocales: generate ? [locale] : jobTargetLocales,
    });

    return { created, extracted, locale, originatedPageId };
  };

  const extractSelectedSourcePages = async (): Promise<FigmaUploadPreview> => {
    const segmentsByPage: FigmaUploadPreview["segmentsByPage"] = [];
    for (const pageId of selectedPageIds) {
      const extracted = await ensureExtractedForPage(pageId);
      const segments = await resolveSourceSegmentsForPage(pageId, extracted);
      segmentsByPage.push({ pageId, segments });
    }
    const segmentTotal = segmentsByPage.reduce((sum, entry) => sum + entry.segments.length, 0);
    if (segmentTotal === 0) {
      throw new Error("Add text to the selected pages before uploading.");
    }
    return { pageIds: [...selectedPageIds], segmentsByPage };
  };

  const openUploadPreview = async () => {
    if (busy != null || uploadPreviewLoading) {
      return;
    }
    if (selectedPageIds.length === 0) {
      showToast("Select at least one page to upload.", "warn");
      return;
    }
    if (!canUploadSource) {
      showToast(`Apply ${localeLabel(sourceLocale)} to the design before uploading.`, "warn");
      return;
    }
    setUploadPreviewLoading(true);
    setErrorMessage(null);
    try {
      setUploadPreview(await extractSelectedSourcePages());
    } catch (error) {
      if (isReconnectError(error)) {
        persistSettings(clearConnection(settings));
        showToast("Reconnect Hyperlocalise to continue.", "critical");
        return;
      }
      showToast(formatActionError(error), "critical");
    } finally {
      setUploadPreviewLoading(false);
    }
  };

  const confirmUpload = () =>
    runAction("upload", async () => {
      if (!uploadPreview) {
        return;
      }
      const preview = uploadPreview;
      setUploadPreview(null);
      for (const { pageId } of preview.segmentsByPage) {
        const { originatedPageId } = await createJobForPage(pageId, false);
        if (pageIdRef.current !== originatedPageId) {
          return;
        }
      }
      await refreshLocaleStatuses();
      showToast(
        `Uploaded ${preview.pageIds.length} page file${preview.pageIds.length === 1 ? "" : "s"}.`,
      );
    });

  const handleApply = () =>
    runAction("apply", async () => {
      const setStep = (label: string, value: number) => {
        setApplyProgress({ label, value });
      };

      try {
        const locale = settings.selectedLocale;
        if (!locale) {
          throw new Error("Choose a language.");
        }
        if (!file) {
          throw new Error("Connect first.");
        }
        if (selectedPageIds.length === 0) {
          throw new Error("Select at least one page to apply.");
        }
        setUploadPreview(null);
        setStep("Loading translations from Hyperlocalise...", 10);

        let segmentTotal = 0;
        const appliedPageIds: string[] = [];
        for (const pageId of selectedPageIds) {
          pageIdRef.current = pageId;
          const count = await applyTranslationsForLocale(pageId, locale);
          if (pageIdRef.current !== pageId) {
            return;
          }
          if (count > 0) {
            appliedPageIds.push(pageId);
          }
          segmentTotal += count;
          setStep("Writing translations to selected pages...", 70);
        }

        const pageCount = selectedPageIds.length;
        const outcome = applyOutcomeMessage(locale, pageCount, segmentTotal, localeLabel);
        if (outcome.tone === "critical") {
          throw new Error(outcome.message);
        }
        persistSettings({
          ...settings,
          appliedLocaleByPage: recordAppliedLocales(
            settings.appliedLocaleByPage,
            appliedPageIds.length > 0 ? appliedPageIds : selectedPageIds,
            locale,
          ),
        });
        setStep("Finishing up...", 95);
        showToast(outcome.message);
      } finally {
        setApplyProgress(null);
      }
    });

  const handleTranslate = () =>
    runAction("translate", async () => {
      const setStep = (label: string, value: number) => {
        setTranslateProgress({ label, value });
      };

      try {
        if (selectedPageIds.length === 0) {
          throw new Error("Select at least one page to translate.");
        }
        const locale = settings.selectedLocale;
        if (!locale) {
          throw new Error("Choose a language.");
        }
        if (locale === sourceLocale) {
          throw new Error("Choose a target language to translate.");
        }

        const pageCount = selectedPageIds.length;
        let segmentTotal = 0;
        const appliedPageIds: string[] = [];
        let jobIndex = 0;

        if (!pagesUploaded) {
          if (!canUploadSource) {
            throw new Error(`Apply ${localeLabel(sourceLocale)} to the design before translating.`);
          }
          setStep("Uploading source text...", 6);
          const preview = await extractSelectedSourcePages();
          for (const { pageId } of preview.segmentsByPage) {
            await createJobForPage(pageId, false);
          }
          await refreshLocaleStatuses();
        }

        for (const pageId of selectedPageIds) {
          jobIndex += 1;
          setStep("Starting translation...", 12);
          const { created, originatedPageId } = await createJobForPage(pageId, true);

          setStep("Translating with AI...", 42);
          const job = await waitForJobCompletion(created.jobId, originatedPageId, (completed) => {
            const jobSpan = 40;
            const value =
              42 +
              Math.round(
                ((jobIndex - 1 + completed / Math.max(completed + 4, 1)) / pageCount) * jobSpan,
              );
            setStep("Translating with AI...", Math.min(value, 82));
          });
          if (!job) {
            return;
          }
          if (job.status === "failed") {
            throw new Error(job.lastError || "Translation job failed.");
          }
          if (job.status !== "succeeded" && job.status !== "waiting_for_review") {
            throw new Error("Translation did not finish in time.");
          }

          setStep("Applying to your design...", 88);
          const count = await applyTranslationsForLocale(originatedPageId, locale);
          if (pageIdRef.current !== originatedPageId) {
            return;
          }
          if (count > 0) {
            appliedPageIds.push(originatedPageId);
          }
          segmentTotal += count;
        }

        const outcome = applyOutcomeMessage(locale, pageCount, segmentTotal, localeLabel);
        if (outcome.tone === "critical") {
          throw new Error(outcome.message);
        }

        persistSettings({
          ...settings,
          appliedLocaleByPage: recordAppliedLocales(
            settings.appliedLocaleByPage,
            appliedPageIds.length > 0 ? appliedPageIds : selectedPageIds,
            locale,
          ),
          lastJobId: settings.lastJobId,
        });
        setStep("Finishing up...", 96);
        try {
          await refreshLocaleStatuses();
        } catch {
          // Stale status must not fail a completed translate.
        }
        showToast(outcome.message);
      } finally {
        setTranslateProgress(null);
      }
    });

  const pageJobPollingProgress =
    pageJob && selectedPageIds.length === 1 && busy == null && isInFlightJobStatus(pageJob.status)
      ? jobPollingStepProgress(pageJob.status, jobPollPulse)
      : null;
  const translateFooterProgress = busy === "translate" ? translateProgress : null;

  const allPagesSelected = pages.length > 0 && selectedPageIds.length === pages.length;
  const projectDropdownOptions = projects.map((project) => ({
    value: project.id,
    text: project.name,
  }));
  const translateDropdownPlaceholder = !selectedProject
    ? "Select a project first"
    : "Select a language";
  const projectDropdownValue = projectDropdownOptions.some(
    (option) => option.value === settings.projectId,
  )
    ? settings.projectId
    : null;
  const translateDropdownValue = translateToOptions.some(
    (locale) => locale.value === settings.selectedLocale,
  )
    ? settings.selectedLocale
    : null;

  const previewSegmentCount = uploadPreview
    ? uniqueUploadedTextCount(uploadPreview.segmentsByPage.flatMap((entry) => entry.segments))
    : 0;
  const showUploadScreen = showWorkflowScreen && Boolean(uploadPreview);

  const toastMarkup = toast ? (
    <div className="toast">
      <Banner variant={toastBannerVariant(toast.tone)} icon={null}>
        {toast.message}
      </Banner>
    </div>
  ) : null;

  return (
    <div className={`appShell${showUploadScreen ? " appShellFill" : ""}`} ref={shellRef}>
      {!booted ? (
        <div className="body">
          <WorkflowSkeleton />
        </div>
      ) : null}

      {showConnectScreen ? (
        <div className="body">
          <Container space="small">
            <Text>
              <Bold>Hyperlocalise</Bold>
            </Text>
            <VerticalSpace space="extraSmall" />
            <Text>
              <Muted>
                Connect your Hyperlocalise workspace to upload text from this file, translate it,
                and apply copy back onto the page.
              </Muted>
            </Text>
            <VerticalSpace space="small" />
            <FormField
              label="Connection token"
              hint="In Hyperlocalise, open Integrations → Figma, add a connection, and copy the token."
            >
              <Textbox
                password
                spellCheck={false}
                value={tokenDraft}
                onValueInput={setTokenDraft}
                disabled={busy != null}
                placeholder="hl_figma_…"
              />
            </FormField>
            <VerticalSpace space="small" />
            <Button
              fullWidth
              onClick={() => void handleConnect()}
              disabled={busy != null || tokenDraft.trim().length === 0}
            >
              {busy === "login" ? "Connecting…" : "Connect Hyperlocalise"}
            </Button>
          </Container>
        </div>
      ) : null}

      {showProjectScreen ? (
        <div className="body">
          <Container space="small">
            <FormField label="Project">
              <div className="pageFieldRow">
                <div className="pageFieldSelect">
                  {projectsReloading ? (
                    <FieldSkeleton />
                  ) : (
                    <Dropdown
                      value={projectDropdownValue}
                      options={projectDropdownOptions}
                      placeholder={busy === "bind" ? "Connecting..." : "Select a project"}
                      disabled={busy === "bind" || projects.length === 0}
                      onValueChange={(value) => void handleProjectChange(value)}
                    />
                  )}
                </div>
                <TooltipWrap label="Reload projects">
                  <IconButton
                    aria-label="Reload projects"
                    disabled={busy === "bind" || projectsReloading}
                    onClick={() => {
                      if (!auth || projectsReloading) {
                        return;
                      }
                      setProjectsReloading(true);
                      void fetchFigmaSession({ appUrl: settings.appUrl, auth })
                        .then((session) => {
                          setProjects(session.projects);
                        })
                        .catch((error) => {
                          showToast(
                            error instanceof Error ? error.message : "Unable to reload projects.",
                            "warn",
                          );
                        })
                        .finally(() => {
                          setProjectsReloading(false);
                        });
                    }}
                  >
                    <IconRefresh16 />
                  </IconButton>
                </TooltipWrap>
              </div>
            </FormField>
            {busy === "bind" && bindProgress ? (
              <div className="stepProgress">
                <Text>
                  <Muted>{bindProgress.label}</Muted>
                </Text>
                <progress className="progressBar" max={100} value={bindProgress.value} />
              </div>
            ) : null}
            <VerticalSpace space="small" />
            <Text>
              {settings.projectId && pickingProject ? (
                <>
                  <Link
                    href="#"
                    onClick={(event) => {
                      preventLinkNavigation(event);
                      if (busy == null) {
                        setPickingProject(false);
                      }
                    }}
                  >
                    Cancel
                  </Link>
                  {" · "}
                </>
              ) : null}
              <Link
                href="#"
                onClick={(event) => {
                  preventLinkNavigation(event);
                  if (busy == null) {
                    handleDisconnect();
                  }
                }}
              >
                Switch Account
              </Link>
            </Text>
            {toastMarkup}
          </Container>
        </div>
      ) : null}

      {showUploadScreen && uploadPreview ? (
        <div className="body uploadScreen" key="upload-preview">
          <div className="uploadScreenInner">
            <Container space="small">
              <Text>
                <Bold>Upload to Hyperlocalise</Bold>
              </Text>
              <VerticalSpace space="extraSmall" />
              <Text>
                <Muted>
                  {uploadPreviewSummary(uploadPreview.pageIds.length, previewSegmentCount)}
                  {selectedProject ? ` to ${selectedProject.name}` : ""}.
                </Muted>
              </Text>
            </Container>
            <div className="uploadScreenFooter">
              {toastMarkup}
              <div className="uploadScreenActions">
                <Button
                  onClick={() => void confirmUpload()}
                  loading={busy === "upload"}
                  disabled={busy != null}
                >
                  Upload pages
                </Button>
                <Button secondary onClick={() => setUploadPreview(null)} disabled={busy != null}>
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {showWorkflowScreen && !uploadPreview ? (
        <>
          <div className="body" key="workflow-main">
            {workflowHydrating ? (
              <WorkflowSkeleton />
            ) : (
              <Container space="small">
                <div className="workflowTop">
                  {selectedProject ? (
                    <div className="workflowProjectLine">
                      <Text>
                        <Muted>Project: {selectedProject.name}</Muted>
                        {" · "}
                        <Link
                          href="#"
                          onClick={(event) => {
                            preventLinkNavigation(event);
                            if (busy == null) {
                              setPickingProject(true);
                            }
                          }}
                        >
                          Change
                        </Link>
                        {" · "}
                        <Link
                          href="#"
                          onClick={(event) => {
                            preventLinkNavigation(event);
                            if (busy == null) {
                              handleDisconnect();
                            }
                          }}
                        >
                          Switch Account
                        </Link>
                      </Text>
                    </div>
                  ) : null}

                  <VerticalSpace space="medium" />

                  <FormField label="Translate to">
                    <div className="pageFieldRow">
                      <div className="pageFieldSelect">
                        {localesLoading ? (
                          <FieldSkeleton />
                        ) : (
                          <Dropdown
                            value={translateDropdownValue}
                            options={translateToOptions.map((locale) => ({
                              value: locale.value,
                              text: locale.label,
                            }))}
                            placeholder={translateDropdownPlaceholder}
                            disabled={busy != null || !selectedProject}
                            onValueChange={(value) =>
                              persistSettings({ ...settings, selectedLocale: value })
                            }
                          />
                        )}
                      </div>
                      <TooltipWrap label="Reload languages">
                        <IconButton
                          aria-label="Reload languages"
                          disabled={localesLoading || !selectedProject || busy != null}
                          onClick={() => void reloadLocaleOptions()}
                        >
                          <IconRefresh16 />
                        </IconButton>
                      </TooltipWrap>
                    </div>
                  </FormField>
                  {selectedProject ? (
                    <div className="fieldDescription">
                      <Text>
                        <Muted>Source language {localeLabel(selectedProject.sourceLocale)}</Muted>
                      </Text>
                    </div>
                  ) : null}

                  <VerticalSpace space="medium" />
                  <Divider />
                  <VerticalSpace space="medium" />

                  <FormField label="Pages to translate">
                    <div className="pageFieldRow">
                      <div className="pageFieldSelect">
                        {pagesLoading ? (
                          <FieldSkeleton />
                        ) : (
                          <PageMultiSelect
                            pages={pages}
                            selectedPageIds={selectedPageIds}
                            disabled={busy != null || pagesLoading}
                            placeholder="Select pages"
                            onChange={(pageIds) => updatePageSelection(pageIds)}
                          />
                        )}
                      </div>
                      <TooltipWrap label="Reload pages">
                        <IconButton
                          aria-label="Reload pages"
                          disabled={pagesLoading || busy != null}
                          onClick={reloadPages}
                        >
                          <IconRefresh16 />
                        </IconButton>
                      </TooltipWrap>
                    </div>
                    <div className="pageMenuActions">
                      <Link
                        href="#"
                        onClick={(event) => {
                          preventLinkNavigation(event);
                          if (busy == null && !pagesLoading && !allPagesSelected) {
                            updatePageSelection(allPageIds(pages));
                          }
                        }}
                      >
                        Select all
                      </Link>
                      <Link
                        href="#"
                        onClick={(event) => {
                          preventLinkNavigation(event);
                          if (busy == null && !pagesLoading && selectedPageIds.length > 0) {
                            updatePageSelection([]);
                          }
                        }}
                      >
                        Clear all
                      </Link>
                    </div>
                  </FormField>
                </div>

                {pageJobPollingProgress ? (
                  <div className="stepProgress" aria-label="Translation progress">
                    <Text>
                      <Muted>{pageJobPollingProgress.label}</Muted>
                    </Text>
                    <progress
                      className="progressBar"
                      max={100}
                      value={pageJobPollingProgress.value}
                    />
                  </div>
                ) : null}

                <VerticalSpace space="small" />
                <Columns space="extraSmall">
                  <TooltipButton
                    fullWidth
                    secondary
                    tooltipLabel={uploadTooltip}
                    onClick={() => void openUploadPreview()}
                    disabled={!canUpload || uploadPreviewLoading}
                    loading={uploadPreviewLoading}
                  >
                    Upload
                  </TooltipButton>
                  <TooltipButton
                    fullWidth
                    secondary
                    tooltipLabel={applyTooltip}
                    onClick={() => void handleApply()}
                    disabled={applyButtonDisabled}
                    loading={applyButtonLoading}
                  >
                    Apply
                  </TooltipButton>
                </Columns>
                {busy === "apply" && applyProgress ? (
                  <div className="stepProgress">
                    <Text>
                      <Muted>{applyProgress.label}</Muted>
                    </Text>
                    <progress className="progressBar" max={100} value={applyProgress.value} />
                  </div>
                ) : null}
                {toastMarkup}
              </Container>
            )}
          </div>
          <div className="footer">
            {translateFooterProgress ? (
              <div className="stepProgress footerStepProgress">
                <Text>
                  <Muted>{translateFooterProgress.label}</Muted>
                </Text>
                <progress className="progressBar" max={100} value={translateFooterProgress.value} />
              </div>
            ) : null}
            <div className="footerPrimaryAction">
              {workflowHydrating ? (
                <FieldSkeleton />
              ) : (
                <TooltipButton
                  fullWidth
                  tooltipLabel={translateTooltip}
                  onClick={() => void handleTranslate()}
                  disabled={!canTranslate && busy !== "translate"}
                  loading={busy === "translate" && !translateFooterProgress}
                >
                  <span className="translateButtonInner">
                    <IconWand16 />
                    Translate
                  </span>
                </TooltipButton>
              )}
            </div>
          </div>
        </>
      ) : null}

      {statusMessage || errorMessage ? (
        <div className="feedback">
          {statusMessage ? (
            <Text>
              <Muted>{statusMessage}</Muted>
            </Text>
          ) : null}
          {errorMessage ? <p className="error">{errorMessage}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
