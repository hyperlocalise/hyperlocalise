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
  Alert,
  Button,
  FormField,
  LinkButton,
  ProgressBar,
  Rows,
  Select,
  Text,
  TextInput,
  Title,
} from "@canva/app-ui-kit";
import { ReloadIcon, RestrictedMagicGradientIcon } from "@canva/app-ui-kit/icons";
import { getDesignMetadata, getDesignToken } from "@canva/design";
import { useEffect, useMemo, useRef, useState } from "react";

import * as styles from "../../../styles/components.css";
import { applyTranslationsToDesign, extractDesignContent, listDesignPages } from "./design-content";
import { normalizeSegmentText } from "./segment-file";
import {
  bindCanvaProject,
  deauthorizeHyperlocalise,
  fetchCanvaLocaleStatuses,
  fetchCanvaSession,
  collectAndGenerateCanvaLocaleJobs,
  generateCanvaLocaleJob,
  getHyperlocaliseAccessToken,
  waitForCanvaJobs,
  HyperlocaliseClientError,
  pullCanvaLocalePages,
  requestHyperlocaliseAuthorization,
  type CanvaResourceAuth,
  collectCanvaDesign,
} from "./hyperlocalise-client";
import { isLocalDevelopment } from "./local-development";
import {
  loadSettings,
  parseSelectedPageValues,
  parseTargetLocales,
  projectLocalesToSettings,
  recordAppliedLocales,
  saveSettings,
  selectedPagesShowSourceLocale,
  selectedPageValues,
  settingsForDesign,
} from "./settings";
import type {
  AppSettings,
  ApplyResult,
  CanvaLocaleStatus,
  CanvaSession,
  CanvaSessionProject,
  DesignPageInfo,
  ExtractedDesignContent,
} from "./types";

type BusyAction = "connect" | "bind" | "upload" | "apply" | "translate" | null;
type ToastTone = "positive" | "critical" | "warn" | "info";
type AppToast = {
  tone: ToastTone;
  message: string;
};

type StepProgress = {
  label: string;
  value: number;
};

function localeLabel(locale: string) {
  const tag = locale.trim();
  if (!tag) {
    return tag;
  }

  try {
    const language =
      new Intl.DisplayNames(["en"], { type: "language" }).of(new Intl.Locale(tag).language) ?? tag;
    return `${language} (${tag})`;
  } catch {
    return tag;
  }
}

function defaultSelectedPages(pages: DesignPageInfo[]): number[] {
  return pages.filter((page) => page.editable).map((page) => page.index);
}

function defaultSelectedLocale(project: CanvaSessionProject | null, current: string) {
  if (!project) {
    return "";
  }
  const locales = [project.sourceLocale, ...project.targetLocales].filter(Boolean);
  if (current && locales.includes(current)) {
    return current;
  }
  return locales[0] ?? "";
}

function localeOptions(project: CanvaSessionProject | null) {
  if (!project) {
    return [];
  }
  const seen = new Set<string>();
  return [project.sourceLocale, ...project.targetLocales]
    .map((locale) => locale.trim())
    .filter((locale) => {
      if (!locale || seen.has(locale)) {
        return false;
      }
      seen.add(locale);
      return true;
    })
    .map((locale) => ({
      value: locale,
      label: localeLabel(locale),
    }));
}

function pageHasPullableTranslations(
  entry: CanvaLocaleStatus,
  page: CanvaLocaleStatus["pages"][number],
) {
  if (page.needsReupload) {
    return false;
  }
  if (entry.isSource) {
    return page.status === "succeeded";
  }
  return page.status === "succeeded" || page.status === "waiting_for_review";
}

function formatPageList(pageIndices: number[]) {
  return pageIndices.map((index) => `Page ${index + 1}`).join(", ");
}

function selectedPagesNeedingReupload(
  entry: CanvaLocaleStatus | undefined,
  selected: number[],
): number[] {
  if (!entry) {
    return [];
  }
  return selected.filter((index) => {
    const page = entry.pages.find((item) => item.pageIndex === index);
    return page?.needsReupload === true;
  });
}

function selectedPagesMissingFromCollect(
  entry: CanvaLocaleStatus | undefined,
  selected: number[],
): number[] {
  if (!entry) {
    return selected;
  }
  return selected.filter((index) => !entry.pages.some((page) => page.pageIndex === index));
}

function selectedPagesCollected(entry: CanvaLocaleStatus | undefined, selected: number[]) {
  return (
    selected.length > 0 &&
    selectedPagesMissingFromCollect(entry, selected).length === 0 &&
    selectedPagesNeedingReupload(entry, selected).length === 0
  );
}

function persistAppliedLocale(
  settings: AppSettings,
  locale: string,
  appliedPageIndices: number[],
): AppSettings {
  return {
    ...settings,
    appliedLocaleByPage: recordAppliedLocales(
      settings.appliedLocaleByPage,
      appliedPageIndices,
      locale,
    ),
  };
}

function uniqueUploadedTextCount(segments: ExtractedDesignContent["segments"]) {
  const seen = new Set<string>();
  for (const segment of segments) {
    const normalized = normalizeSegmentText(segment.text);
    if (!normalized) {
      continue;
    }
    seen.add(`${segment.pageIndex}\0${normalized}`);
  }
  return seen.size;
}

function applyOutcomeMessage(
  locale: string,
  pageCount: number,
  result: ApplyResult,
): { message: string; tone: ToastTone } {
  const matched = result.replaced + result.alreadyApplied;
  if (result.pagesNeedingUpload.length > 0 && matched === 0) {
    return {
      message: `Upload ${formatPageList(result.pagesNeedingUpload)} again to apply translations.`,
      tone: "critical",
    };
  }
  if (matched === 0 && result.skipped > 0) {
    return {
      message: "Text on the selected pages changed since upload. Upload again, then apply.",
      tone: "critical",
    };
  }
  if (matched === 0 && result.untranslated > 0) {
    return {
      message: `No ${localeLabel(locale)} translations for the selected pages yet.`,
      tone: "critical",
    };
  }
  if (result.replaced === 0 && result.alreadyApplied > 0) {
    return {
      message: `${localeLabel(locale)} is already applied to the selected pages.`,
      tone: "positive",
    };
  }
  if (result.replaced > 0) {
    const skippedNote =
      result.skipped > 0
        ? ` ${result.skipped} text box${result.skipped === 1 ? "" : "es"} changed since upload — Upload again to include them.`
        : "";
    return {
      message: `Applied ${localeLabel(locale)} to ${pageCount} page${pageCount === 1 ? "" : "s"}.${skippedNote}`,
      tone: "positive",
    };
  }
  return {
    message: "No matching text on those pages. Upload the pages again, then apply.",
    tone: "critical",
  };
}

function canApplySelectedPages(entry: CanvaLocaleStatus | undefined, selected: number[]) {
  if (!entry || selected.length === 0) {
    return false;
  }
  return selected.every((index) => {
    const page = entry.pages.find((item) => item.pageIndex === index);
    if (!page) {
      return false;
    }
    return pageHasPullableTranslations(entry, page);
  });
}

function uploadPreviewSummary(pageCount: number, textCount: number) {
  const pages = `${pageCount} page${pageCount === 1 ? "" : "s"}`;
  const texts = `${textCount} text${textCount === 1 ? "" : "s"}`;
  return `${pages} · ${texts}`;
}

function isReconnectError(error: unknown) {
  if (!(error instanceof HyperlocaliseClientError)) {
    return false;
  }

  return (
    error.code === "unauthorized" ||
    error.code === "canva_connection_token_required" ||
    error.code === "canva_connection_not_found" ||
    error.code === "canva_connection_disabled" ||
    error.code === "canva_access_token_invalid" ||
    error.code === "canva_user_token_required" ||
    error.code === "canva_user_token_invalid"
  );
}

function formatActionError(error: unknown): string {
  if (error instanceof HyperlocaliseClientError) {
    switch (error.code) {
      case "canva_project_not_bound":
        return "Choose a project in the app before applying.";
      case "canva_design_not_collected":
        return "Upload the selected pages first, then apply.";
      case "job_target_locale_not_in_project":
        return "That language is not in the project. Reload languages or update project settings.";
      default:
        return error.message;
    }
  }

  return error instanceof Error ? error.message : "Something went wrong.";
}

export const App = () => {
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings());
  const [tokenDraft, setTokenDraft] = useState("");
  const [showTokenField, setShowTokenField] = useState(false);
  const [designPages, setDesignPages] = useState<DesignPageInfo[]>([]);
  const [pagesLoading, setPagesLoading] = useState(true);
  const [localesLoading, setLocalesLoading] = useState(false);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [applyStatusLoading, setApplyStatusLoading] = useState(false);
  const [localeStatuses, setLocaleStatuses] = useState<CanvaLocaleStatus[]>([]);
  const [projects, setProjects] = useState<CanvaSessionProject[]>([]);
  const [busy, setBusy] = useState<BusyAction>(null);
  const [oauthReady, setOauthReady] = useState(false);
  const [pickingProject, setPickingProject] = useState(() => !loadSettings().projectId);
  const [pagesReloadKey, setPagesReloadKey] = useState(0);
  const [uploadPreview, setUploadPreview] = useState<ExtractedDesignContent | null>(null);
  const [bindProgress, setBindProgress] = useState<StepProgress | null>(null);
  const [applyProgress, setApplyProgress] = useState<StepProgress | null>(null);
  const [translateProgress, setTranslateProgress] = useState<StepProgress | null>(null);
  const [toast, setToast] = useState<AppToast | null>(null);
  const didInitializePages = useRef(false);

  const showToast = (message: string, tone: ToastTone = "positive") => {
    setToast({ message, tone });
  };

  useEffect(() => {
    if (!toast) {
      return;
    }
    const timeout = window.setTimeout(() => setToast(null), 5_000);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  const editablePages = useMemo(() => designPages.filter((page) => page.editable), [designPages]);
  const selectedPageIndices = useMemo(
    () =>
      settings.selectedPageIndices.filter((index) =>
        editablePages.some((page) => page.index === index),
      ),
    [editablePages, settings.selectedPageIndices],
  );
  const selectedPagesKey = useMemo(() => {
    const sorted = [...selectedPageIndices];
    sorted.sort((left, right) => left - right);
    return sorted.join(",");
  }, [selectedPageIndices]);
  const allowConnectionToken = isLocalDevelopment();
  const legacyConnectionToken = allowConnectionToken ? settings.connectionToken.trim() : "";
  const connected = oauthReady || legacyConnectionToken.length > 0;
  const selectedProject =
    projects.find((project) => project.id === settings.projectId) ??
    (settings.projectId
      ? {
          id: settings.projectId,
          name: settings.projectName,
          sourceLocale: settings.sourceLocale,
          targetLocales: parseTargetLocales(settings.targetLocales),
        }
      : null);
  const selectedLocaleStatus = localeStatuses.find(
    (entry) => entry.locale === settings.selectedLocale,
  );

  const resolveAuth = async (): Promise<CanvaResourceAuth> => {
    const accessToken = await getHyperlocaliseAccessToken();
    if (accessToken) {
      return { accessToken };
    }
    return { connectionToken: legacyConnectionToken };
  };

  const sourceLocaleStatus =
    localeStatuses.find((entry) => entry.isSource) ??
    localeStatuses.find((entry) => entry.locale === selectedProject?.sourceLocale);
  const pagesNeedReupload = selectedPagesNeedingReupload(
    selectedLocaleStatus ?? sourceLocaleStatus,
    selectedPageIndices,
  );
  const sourceLocale = selectedProject?.sourceLocale || settings.sourceLocale;
  const canUploadSource = selectedPagesShowSourceLocale(
    settings.appliedLocaleByPage,
    selectedPageIndices,
    sourceLocale,
  );
  const canUpload =
    connected &&
    Boolean(settings.projectId) &&
    selectedPageIndices.length > 0 &&
    canUploadSource &&
    busy == null;
  const applyEligible =
    connected &&
    Boolean(settings.projectId) &&
    selectedPageIndices.length > 0 &&
    Boolean(settings.selectedLocale) &&
    canApplySelectedPages(selectedLocaleStatus, selectedPageIndices);
  const applyButtonLoading = busy === "apply";
  const applyButtonDisabled =
    (!applyEligible && busy !== "apply") ||
    applyStatusLoading ||
    (busy != null && busy !== "apply");
  const pagesUploaded = selectedPagesCollected(sourceLocaleStatus, selectedPageIndices);
  const canTranslate =
    connected &&
    Boolean(settings.projectId) &&
    selectedPageIndices.length > 0 &&
    Boolean(settings.selectedLocale) &&
    settings.selectedLocale !== selectedProject?.sourceLocale &&
    !localesLoading &&
    (pagesUploaded || canUploadSource) &&
    busy == null;

  const uploadTooltip = !canUpload
    ? selectedPageIndices.length === 0
      ? "Select at least one page to upload."
      : !canUploadSource
        ? `Apply ${localeLabel(sourceLocale)} to the design before uploading.`
        : busy != null
          ? "Wait for the current step to finish."
          : undefined
    : undefined;
  const translateTooltip = !canTranslate
    ? settings.selectedLocale === selectedProject?.sourceLocale
      ? "Choose a target language to translate."
      : selectedPageIndices.length === 0
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
      : selectedPageIndices.length === 0
        ? "Select at least one page to apply."
        : pagesNeedReupload.length > 0
          ? `Upload ${formatPageList(pagesNeedReupload)} again to use Apply.`
          : applyStatusLoading
            ? "Loading translation status..."
            : busy != null && busy !== "apply"
              ? "Wait for the current step to finish."
              : "No translations for the selected pages yet."
    : "Apply Hyperlocalise translations to the selected pages";

  const persistSettings = (next: AppSettings) => {
    setSettings(next);
    saveSettings(next);
  };

  const rememberDesign = (designId: string | undefined) => {
    if (!designId) {
      return;
    }
    setSettings((current) => {
      const next = settingsForDesign(current, designId);
      saveSettings(next);
      return next;
    });
  };

  const applySession = (session: CanvaSession, next: AppSettings): AppSettings => {
    setProjects(session.projects);
    if (!session.project) {
      setPickingProject(true);
      return {
        ...next,
        organizationSlug: session.organization.slug ?? "",
        organizationName: session.organization.name,
        projectId: "",
        projectName: "",
        sourceLocale: "",
        targetLocales: "",
        selectedLocale: "",
        appliedLocaleByPage: {},
      };
    }
    setPickingProject(false);

    const locales = projectLocalesToSettings(session.project);
    return {
      ...next,
      organizationSlug: session.organization.slug ?? "",
      organizationName: session.organization.name,
      projectId: session.project.id,
      projectName: session.project.name,
      ...locales,
      selectedLocale: defaultSelectedLocale(session.project, next.selectedLocale),
    };
  };

  const updateSettings = (patch: Partial<AppSettings>) => {
    persistSettings({ ...settings, ...patch });
  };

  const disconnect = (message?: string, tone: ToastTone = "info") => {
    void deauthorizeHyperlocalise();
    setOauthReady(false);
    persistSettings({
      ...settings,
      connectionToken: "",
      organizationSlug: "",
      organizationName: "",
      projectId: "",
      projectName: "",
      selectedLocale: "",
      designId: "",
      appliedLocaleByPage: {},
      lastJobId: "",
    });
    setProjects([]);
    setLocaleStatuses([]);
    setTokenDraft("");
    setPickingProject(true);
    if (message) {
      showToast(message, tone);
    }
  };

  useEffect(() => {
    let cancelled = false;

    async function loadPages() {
      setPagesLoading(true);

      try {
        const pages = await listDesignPages();
        if (cancelled) {
          return;
        }

        setDesignPages(pages);
        setSettings((current) => {
          if (current.selectedPageIndices.length > 0 || didInitializePages.current) {
            didInitializePages.current = true;
            return current;
          }

          didInitializePages.current = true;
          const next = {
            ...current,
            selectedPageIndices: defaultSelectedPages(pages),
          };
          saveSettings(next);
          return next;
        });
      } catch (error) {
        if (!cancelled) {
          showToast(
            error instanceof Error ? error.message : "Unable to load design pages.",
            "warn",
          );
        }
      } finally {
        if (!cancelled) {
          setPagesLoading(false);
        }
      }
    }

    void loadPages();

    return () => {
      cancelled = true;
    };
  }, [pagesReloadKey]);

  useEffect(() => {
    let cancelled = false;

    async function restoreOauthSession() {
      const accessToken = await getHyperlocaliseAccessToken();
      if (!cancelled && accessToken) {
        setOauthReady(true);
      }
    }

    void restoreOauthSession();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!connected) {
      return;
    }

    let cancelled = false;

    async function hydrateSession() {
      try {
        const session = await fetchCanvaSession(await resolveAuth());
        if (cancelled) {
          return;
        }

        persistSettings(applySession(session, settings));
        if (!session.project) {
          setLocaleStatuses([]);
          return;
        }

        const { token } = await getDesignToken();
        const statuses = await fetchCanvaLocaleStatuses({
          auth: await resolveAuth(),
          designToken: token,
        });
        if (!cancelled) {
          setLocaleStatuses(statuses.locales);
          rememberDesign(statuses.designId);
        }
      } catch (error) {
        if (cancelled) {
          return;
        }
        if (isReconnectError(error)) {
          disconnect("Reconnect Hyperlocalise to continue.", "critical");
        }
      }
    }

    void hydrateSession();

    return () => {
      cancelled = true;
    };
    // Session hydrate runs once after OAuth or a fallback token is present.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected]);

  useEffect(() => {
    if (
      !connected ||
      !settings.projectId ||
      selectedPageIndices.length === 0 ||
      !settings.selectedLocale
    ) {
      return;
    }

    let cancelled = false;

    async function refreshApplyEligibility() {
      setApplyStatusLoading(true);
      try {
        const { token } = await getDesignToken();
        const statuses = await fetchCanvaLocaleStatuses({
          auth: await resolveAuth(),
          designToken: token,
        });
        if (!cancelled) {
          setLocaleStatuses(statuses.locales);
          rememberDesign(statuses.designId);
        }
      } catch (error) {
        if (cancelled) {
          return;
        }
        if (isReconnectError(error)) {
          disconnect("Reconnect Hyperlocalise to continue.", "critical");
          return;
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
    };
    // Refetch when the target locale or selected pages change so Apply reflects latest jobs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, settings.projectId, settings.selectedLocale, selectedPagesKey]);

  const runAction = async (action: Exclude<BusyAction, null>, work: () => Promise<void>) => {
    setBusy(action);
    try {
      await work();
    } catch (error) {
      if (isReconnectError(error)) {
        disconnect("Reconnect Hyperlocalise to continue.", "critical");
        return;
      }
      showToast(formatActionError(error), "critical");
    } finally {
      setBusy(null);
    }
  };

  const handleConnectOauth = () =>
    runAction("connect", async () => {
      const status = await requestHyperlocaliseAuthorization();
      if (status !== "completed") {
        throw new Error("Canva authorization was cancelled.");
      }
      const accessToken = await getHyperlocaliseAccessToken();
      if (!accessToken) {
        throw new Error("Canva did not return a Hyperlocalise access token.");
      }
      const session = await fetchCanvaSession({ accessToken });
      setOauthReady(true);
      persistSettings(
        applySession(session, {
          ...settings,
          connectionToken: "",
        }),
      );
    });

  const handleConnectToken = () =>
    runAction("connect", async () => {
      if (!allowConnectionToken) {
        throw new Error("Connection tokens are only available in local development.");
      }
      const connectionToken = tokenDraft.trim();
      if (!connectionToken) {
        throw new Error("Paste a connection token from Hyperlocalise.");
      }
      const session = await fetchCanvaSession(connectionToken);
      persistSettings(
        applySession(session, {
          ...settings,
          connectionToken,
        }),
      );
      setTokenDraft("");
    });

  const refreshLocaleStatuses = async () => {
    if (!settings.projectId) {
      setLocaleStatuses([]);
      return;
    }
    const { token } = await getDesignToken();
    const statuses = await fetchCanvaLocaleStatuses({
      auth: await resolveAuth(),
      designToken: token,
    });
    setLocaleStatuses(statuses.locales);
    rememberDesign(statuses.designId);
    return statuses;
  };

  const reloadProjectOptions = async () => {
    setProjectsLoading(true);
    try {
      const session = await fetchCanvaSession(await resolveAuth());
      setProjects(session.projects);
      persistSettings(applySession(session, settings));
      if (!session.project) {
        setLocaleStatuses([]);
        return;
      }
      await refreshLocaleStatuses();
    } catch (error) {
      if (isReconnectError(error)) {
        disconnect("Reconnect Hyperlocalise to continue.", "critical");
        return;
      }
      showToast(error instanceof Error ? error.message : "Unable to reload projects.", "warn");
    } finally {
      setProjectsLoading(false);
    }
  };

  const reloadLocaleOptions = async () => {
    if (!settings.projectId) {
      return;
    }

    setLocalesLoading(true);
    try {
      const session = await fetchCanvaSession(await resolveAuth());
      persistSettings(applySession(session, settings));
      if (!session.project) {
        setLocaleStatuses([]);
        return;
      }
      await refreshLocaleStatuses();
    } catch (error) {
      if (isReconnectError(error)) {
        disconnect("Reconnect Hyperlocalise to continue.", "critical");
        return;
      }
      showToast(error instanceof Error ? error.message : "Unable to reload languages.", "warn");
    } finally {
      setLocalesLoading(false);
    }
  };

  const handleProjectChange = (projectId: string) =>
    runAction("bind", async () => {
      const setStep = (label: string, value: number) => {
        setBindProgress({ label, value });
      };

      try {
        setStep("Connecting project...", 20);
        const session = await bindCanvaProject({
          auth: await resolveAuth(),
          projectId,
        });
        setStep("Loading languages...", 55);
        persistSettings(applySession(session, settings));
        if (!session.project) {
          setLocaleStatuses([]);
          setPickingProject(true);
          return;
        }
        const { token } = await getDesignToken();
        const statuses = await fetchCanvaLocaleStatuses({
          auth: await resolveAuth(),
          designToken: token,
        });
        setLocaleStatuses(statuses.locales);
        rememberDesign(statuses.designId);
        setStep("Almost ready...", 90);
      } finally {
        setBindProgress(null);
      }
    });

  const pullSourcePagesForUpload = async () => {
    const sourceLocale = selectedProject?.sourceLocale || settings.sourceLocale;
    if (!sourceLocale) {
      return [];
    }
    try {
      const { token } = await getDesignToken();
      const pulled = await pullCanvaLocalePages({
        auth: await resolveAuth(),
        designToken: token,
        locale: sourceLocale,
      });
      return pulled.pages;
    } catch (error) {
      if (
        error instanceof HyperlocaliseClientError &&
        error.code === "canva_design_not_collected"
      ) {
        return [];
      }
      throw error;
    }
  };

  const extractSelectedSourcePages = async () => {
    const sourcePages = await pullSourcePagesForUpload();
    const extracted = await extractDesignContent(selectedPageIndices, sourcePages);
    if (extracted.segments.length === 0) {
      throw new Error("Add text to the selected pages before uploading.");
    }
    return extracted;
  };

  const collectSegments = async (segments: ExtractedDesignContent["segments"]) => {
    const [{ token }, metadata] = await Promise.all([getDesignToken(), getDesignMetadata()]);
    return collectCanvaDesign({
      auth: await resolveAuth(),
      designToken: token,
      designTitle: metadata.title,
      segments,
    });
  };

  const openUploadPreview = () =>
    runAction("upload", async () => {
      if (selectedPageIndices.length === 0) {
        throw new Error("Select at least one editable page.");
      }
      if (
        !selectedPagesShowSourceLocale(
          settings.appliedLocaleByPage,
          selectedPageIndices,
          sourceLocale,
        )
      ) {
        throw new Error(`Apply ${localeLabel(sourceLocale)} to the design before uploading.`);
      }
      setUploadPreview(await extractSelectedSourcePages());
    });

  const confirmUpload = () =>
    runAction("upload", async () => {
      if (!uploadPreview) {
        return;
      }
      const collected = await collectSegments(uploadPreview.segments);
      setUploadPreview(null);
      await refreshLocaleStatuses();
      showToast(
        `Uploaded ${collected.pages.length} page file${collected.pages.length === 1 ? "" : "s"}.`,
      );
    });

  const handleApply = () =>
    runAction("apply", async () => {
      const setStep = (label: string, value: number) => {
        setApplyProgress({ label, value });
      };

      try {
        if (!settings.selectedLocale) {
          throw new Error("Choose a language.");
        }
        setUploadPreview(null);
        setStep("Loading translations from Hyperlocalise...", 10);
        const { token } = await getDesignToken();
        const pulled = await pullCanvaLocalePages({
          auth: await resolveAuth(),
          designToken: token,
          locale: settings.selectedLocale,
        });
        const selected = new Set(selectedPageIndices);
        const pages = pulled.pages.filter((page) => selected.has(page.pageIndex));
        if (pages.length === 0) {
          throw new Error("No translations to apply for the selected pages.");
        }
        setStep("Writing translations to selected pages...", 70);
        const applied = await applyTranslationsToDesign(pages);
        const outcome = applyOutcomeMessage(settings.selectedLocale, pages.length, applied);
        if (outcome.tone === "critical") {
          throw new Error(outcome.message);
        }
        persistSettings(
          persistAppliedLocale(settings, settings.selectedLocale, applied.appliedPageIndices),
        );
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
        if (!settings.selectedLocale) {
          throw new Error("Choose a language.");
        }
        if (settings.selectedLocale === selectedProject?.sourceLocale) {
          throw new Error("Choose a target language to translate.");
        }
        if (selectedPageIndices.length === 0) {
          throw new Error("Select at least one editable page.");
        }

        const { token } = await getDesignToken();
        const auth = await resolveAuth();
        const metadata = await getDesignMetadata();

        let generated: { locale: string; projectId: string; jobIds: string[] };
        if (!pagesUploaded) {
          if (!canUploadSource) {
            throw new Error(`Apply ${localeLabel(sourceLocale)} to the design before translating.`);
          }
          setStep("Uploading source text...", 6);
          const extracted = await extractSelectedSourcePages();
          setStep("Starting translation...", 12);
          generated = await collectAndGenerateCanvaLocaleJobs({
            auth,
            designToken: token,
            designTitle: metadata.title,
            locale: settings.selectedLocale,
            segments: extracted.segments,
          });
          await refreshLocaleStatuses();
        } else {
          setStep("Starting translation...", 12);
          generated = await generateCanvaLocaleJob({
            auth,
            designToken: token,
            locale: settings.selectedLocale,
          });
        }
        persistSettings({
          ...settings,
          lastJobId: generated.jobIds[0] ?? settings.lastJobId,
        });

        setStep("Translating with AI...", 42);
        await waitForCanvaJobs({
          auth,
          jobIds: generated.jobIds,
          onProgress: (completed, total) => {
            const jobSpan = 40;
            const value = 42 + Math.round((completed / Math.max(total, 1)) * jobSpan);
            setStep("Translating with AI...", Math.min(value, 82));
          },
        });

        setStep("Applying to your design...", 88);
        const pulled = await pullCanvaLocalePages({
          auth,
          designToken: token,
          locale: settings.selectedLocale,
        });
        const selected = new Set(selectedPageIndices);
        const pages = pulled.pages.filter((page) => selected.has(page.pageIndex));
        if (pages.length === 0) {
          throw new Error("No translations to apply.");
        }
        const applied = await applyTranslationsToDesign(pages);
        const outcome = applyOutcomeMessage(settings.selectedLocale, pages.length, applied);
        if (outcome.tone === "critical") {
          throw new Error(outcome.message);
        }

        persistSettings({
          ...persistAppliedLocale(settings, settings.selectedLocale, applied.appliedPageIndices),
          lastJobId: generated.jobIds[0] ?? settings.lastJobId,
        });
        setStep("Finishing up...", 96);
        await refreshLocaleStatuses();
        const skippedNote =
          applied.skipped > 0
            ? ` ${applied.skipped} text box${applied.skipped === 1 ? "" : "es"} changed since upload — Upload again to include them.`
            : "";
        showToast(
          `Translated ${localeLabel(settings.selectedLocale)} and applied to ${pages.length} page${pages.length === 1 ? "" : "s"}.${skippedNote}`,
        );
      } finally {
        setTranslateProgress(null);
      }
    });

  const showProjectScreen = connected && (pickingProject || !selectedProject);
  const showTranslateScreen = connected && !showProjectScreen;

  const toastMarkup = toast ? (
    <div className={styles.toast}>
      <Alert tone={toast.tone} onDismiss={() => setToast(null)}>
        <Text>{toast.message}</Text>
      </Alert>
    </div>
  ) : null;

  return (
    <div className={styles.appShell}>
      {showProjectScreen ? (
        <div className={styles.body}>
          <FormField
            label="Project"
            value={settings.projectId}
            control={(props) => (
              <div className={styles.pageFieldRow}>
                <div className={styles.pageFieldSelect}>
                  <Select
                    {...props}
                    stretch
                    placeholder={
                      busy === "bind"
                        ? "Connecting..."
                        : projectsLoading
                          ? "Loading projects..."
                          : "Select a project"
                    }
                    disabled={busy === "bind" || projectsLoading}
                    options={projects.map((project) => ({
                      value: project.id,
                      label: project.name,
                    }))}
                    onChange={(value) => {
                      void handleProjectChange(value);
                    }}
                  />
                </div>
                <Button
                  variant="tertiary"
                  size="small"
                  icon={ReloadIcon}
                  ariaLabel="Reload projects"
                  tooltipLabel="Reload projects"
                  onClick={() => void reloadProjectOptions()}
                  loading={projectsLoading}
                  disabled={projectsLoading || busy === "bind"}
                />
              </div>
            )}
          />
          {busy === "bind" && bindProgress ? (
            <div className={styles.stepProgress}>
              <Text size="small" tone="secondary">
                {bindProgress.label}
              </Text>
              <ProgressBar size="small" value={bindProgress.value} ariaLabel={bindProgress.label} />
            </div>
          ) : null}
          <div className={styles.projectCta}>
            {selectedProject ? (
              <LinkButton onClick={() => setPickingProject(false)}>Cancel</LinkButton>
            ) : null}
            <LinkButton onClick={() => disconnect("Disconnected.")}>Switch Account</LinkButton>
          </div>
          {toastMarkup}
        </div>
      ) : showTranslateScreen && uploadPreview ? (
        <>
          <div className={styles.body}>
            <Title size="small">Upload to Hyperlocalise</Title>
            <Text size="small">
              {uploadPreviewSummary(
                uploadPreview.pageIndices.length,
                uniqueUploadedTextCount(uploadPreview.segments),
              )}
              {selectedProject ? ` to ${selectedProject.name}` : ""}.
            </Text>
          </div>
          <div className={styles.footer}>
            <Rows spacing="1u">
              <Button
                variant="primary"
                stretch
                onClick={confirmUpload}
                loading={busy === "upload"}
                disabled={busy != null}
              >
                Upload pages
              </Button>
              <Button
                variant="secondary"
                stretch
                onClick={() => setUploadPreview(null)}
                disabled={busy != null}
              >
                Cancel
              </Button>
            </Rows>
          </div>
          {toastMarkup}
        </>
      ) : showTranslateScreen ? (
        <>
          <div className={styles.body}>
            {selectedProject ? (
              <div className={styles.projectCta}>
                <Text size="small" tone="secondary">
                  Project: {selectedProject.name}
                </Text>
                <Text size="small" tone="secondary">
                  ·
                </Text>
                <LinkButton onClick={() => setPickingProject(true)}>Change</LinkButton>
                <Text size="small" tone="secondary">
                  ·
                </Text>
                <LinkButton onClick={() => disconnect("Disconnected.")}>Switch Account</LinkButton>
              </div>
            ) : null}
            <FormField
              label="Translate to"
              value={settings.selectedLocale}
              control={(props) => (
                <div className={styles.pageFieldRow}>
                  <div className={styles.pageFieldSelect}>
                    <Select
                      {...props}
                      stretch
                      placeholder={localesLoading ? "Loading languages..." : "Select a language"}
                      disabled={localesLoading || !selectedProject}
                      options={localeOptions(selectedProject)}
                      onChange={(value) => updateSettings({ selectedLocale: value })}
                    />
                  </div>
                  <Button
                    variant="tertiary"
                    size="small"
                    icon={ReloadIcon}
                    ariaLabel="Reload languages"
                    tooltipLabel="Reload languages"
                    onClick={() => void reloadLocaleOptions()}
                    loading={localesLoading}
                    disabled={localesLoading || !selectedProject}
                  />
                </div>
              )}
            />
            {selectedProject ? (
              <Text size="small" tone="secondary">
                Source language {localeLabel(selectedProject.sourceLocale)}
              </Text>
            ) : null}
            <hr className={styles.sectionRule} />
            <FormField
              label="Pages to translate"
              value={selectedPageValues(selectedPageIndices).join(",")}
              control={(props) => (
                <div className={styles.pageField}>
                  <div className={styles.pageFieldRow}>
                    <div className={styles.pageFieldSelect}>
                      <Select
                        {...props}
                        type="multi"
                        stretch
                        placeholder={pagesLoading ? "Loading pages..." : "Select pages"}
                        disabled={pagesLoading}
                        value={selectedPageValues(selectedPageIndices)}
                        options={designPages.map((page) => ({
                          value: String(page.index),
                          label: page.label,
                          disabled: !page.editable,
                        }))}
                        onChange={(values) =>
                          updateSettings({
                            selectedPageIndices: parseSelectedPageValues(values),
                          })
                        }
                      />
                    </div>
                    <Button
                      variant="tertiary"
                      size="small"
                      icon={ReloadIcon}
                      ariaLabel="Reload pages"
                      tooltipLabel="Reload pages"
                      onClick={() => setPagesReloadKey((current) => current + 1)}
                      loading={pagesLoading}
                      disabled={pagesLoading}
                    />
                  </div>
                  <div className={styles.pageMenuActions}>
                    <LinkButton
                      onClick={() =>
                        updateSettings({
                          selectedPageIndices: defaultSelectedPages(designPages),
                        })
                      }
                      disabled={
                        pagesLoading ||
                        editablePages.length === 0 ||
                        selectedPageIndices.length === editablePages.length
                      }
                    >
                      Select all
                    </LinkButton>
                    <LinkButton
                      onClick={() => updateSettings({ selectedPageIndices: [] })}
                      disabled={pagesLoading || selectedPageIndices.length === 0}
                    >
                      Clear all
                    </LinkButton>
                  </div>
                </div>
              )}
            />
            <div className={styles.stepActions}>
              <Button
                variant="secondary"
                stretch
                onClick={openUploadPreview}
                disabled={!canUpload}
                loading={busy === "upload"}
                tooltipLabel={uploadTooltip}
              >
                Upload
              </Button>
              <Button
                variant="secondary"
                stretch
                onClick={handleApply}
                disabled={applyButtonDisabled}
                loading={applyButtonLoading}
                tooltipLabel={applyTooltip}
              >
                Apply
              </Button>
            </div>
            {selectedPagesNeedingReupload(selectedLocaleStatus, selectedPageIndices).length > 0 ? (
              <Text size="small" tone="secondary">
                Upload{" "}
                {formatPageList(
                  selectedPagesNeedingReupload(selectedLocaleStatus, selectedPageIndices),
                )}{" "}
                again to use Apply.
              </Text>
            ) : null}
            {busy === "apply" && applyProgress ? (
              <div className={styles.stepProgress}>
                <Text size="small" tone="secondary">
                  {applyProgress.label}
                </Text>
                <ProgressBar
                  size="small"
                  value={applyProgress.value}
                  ariaLabel={applyProgress.label}
                />
              </div>
            ) : null}
            {toastMarkup}
          </div>
          <div className={styles.footer}>
            <Rows spacing="1u">
              {busy === "translate" && translateProgress ? (
                <div className={styles.stepProgress}>
                  <Text size="small" tone="secondary">
                    {translateProgress.label}
                  </Text>
                  <ProgressBar
                    size="small"
                    value={translateProgress.value}
                    ariaLabel={translateProgress.label}
                  />
                </div>
              ) : null}
              <Button
                variant="primary"
                stretch
                icon={RestrictedMagicGradientIcon}
                onClick={handleTranslate}
                disabled={!canTranslate}
                loading={busy === "translate"}
                tooltipLabel={translateTooltip}
              >
                Translate
              </Button>
            </Rows>
          </div>
        </>
      ) : (
        <div className={styles.body}>
          <Text>Connect your Hyperlocalise account to translate your Canva designs.</Text>
          <Button
            variant="primary"
            stretch
            onClick={handleConnectOauth}
            loading={busy === "connect"}
            disabled={busy != null}
          >
            Connect Hyperlocalise
          </Button>
          {allowConnectionToken ? (
            <>
              <LinkButton onClick={() => setShowTokenField((current) => !current)}>
                {showTokenField ? "Hide connection token" : "Use a connection token"}
              </LinkButton>
              {showTokenField ? (
                <Rows spacing="1u">
                  <FormField
                    label="Connection token"
                    value={tokenDraft}
                    control={(props) => (
                      <TextInput {...props} placeholder="hl_canva_..." onChange={setTokenDraft} />
                    )}
                  />
                  <Button
                    variant="secondary"
                    stretch
                    onClick={handleConnectToken}
                    disabled={busy != null || tokenDraft.trim().length === 0}
                  >
                    Connect with token
                  </Button>
                </Rows>
              ) : null}
            </>
          ) : null}
          {toastMarkup}
        </div>
      )}
    </div>
  );
};
