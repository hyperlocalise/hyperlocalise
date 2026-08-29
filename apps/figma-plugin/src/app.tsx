import { useEffect, useState } from "react";

import {
  createFigmaJob,
  fetchCurrentFigmaJob,
  fetchFigmaProjects,
  fetchFigmaSession,
  FIGMA_JOB_POLL_INTERVAL_MS,
  generateFigmaJob,
  getFigmaJob,
  HyperlocaliseClientError,
  pullFigmaTranslations,
  signInWithOAuth,
  type FigmaProject,
} from "./hyperlocalise-client";
import { buildFigmaJobUrl, type FigmaPageJobBinding } from "./page-binding";
import type {
  FigmaFileInfo,
  FigmaPageJob,
  FigmaSegment,
  PluginSettings,
  SandboxToUiMessage,
  UiToSandboxMessage,
} from "./plugin-messages";
import {
  DEFAULT_SETTINGS,
  mergeSettings,
  normalizeAppUrl,
  resolvePersistedProjectId,
} from "./settings";

import "./ui.css";

const LOCALE_OPTIONS = [
  { value: "en", label: "English (en)" },
  { value: "es", label: "Spanish (es)" },
  { value: "fr", label: "French (fr)" },
  { value: "de", label: "German (de)" },
  { value: "it", label: "Italian (it)" },
  { value: "pt", label: "Portuguese (pt)" },
  { value: "ja", label: "Japanese (ja)" },
  { value: "ko", label: "Korean (ko)" },
  { value: "zh-CN", label: "Chinese Simplified (zh-CN)" },
  { value: "vi-VN", label: "Vietnamese (vi-VN)" },
];

type BusyAction = "login" | "extract" | "create" | "generate" | "pull" | null;

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

function isInFlightStatus(status: FigmaPageJob["status"]) {
  return status === "queued" || status === "running";
}

function jobStatusLabel(status: FigmaPageJob["status"]) {
  switch (status) {
    case "queued":
      return "Queued";
    case "running":
      return "Translating";
    case "waiting_for_review":
      return "Needs review";
    case "succeeded":
      return "Ready";
    case "failed":
      return "Failed";
    case "cancelled":
      return "Cancelled";
  }
}

function pageJobFromCreate(input: {
  jobId: string;
  projectId: string;
  sourcePath: string;
  targetLocales: string[];
  generated: boolean;
}): FigmaPageJob {
  return {
    jobId: input.jobId,
    status: input.generated ? "queued" : "queued",
    projectId: input.projectId,
    sourcePath: input.sourcePath,
    targetLocales: input.targetLocales,
    lastError: null,
    translationsByLocale: {},
  };
}

export function App() {
  const [settings, setSettings] = useState<PluginSettings>(DEFAULT_SETTINGS);
  const [file, setFile] = useState<FigmaFileInfo | null>(null);
  const [projects, setProjects] = useState<FigmaProject[]>([]);
  const [organizations, setOrganizations] = useState<Array<{ slug: string; name: string }>>([]);
  const [segments, setSegments] = useState<FigmaSegment[]>([]);
  const [pageBinding, setPageBinding] = useState<FigmaPageJobBinding | null>(null);
  const [pageJob, setPageJob] = useState<FigmaPageJob | null>(null);
  const [applyLocale, setApplyLocale] = useState("");
  const [busy, setBusy] = useState<BusyAction>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [booted, setBooted] = useState(false);

  const signedIn = Boolean(settings.sealedSession);
  const selectedProject = projects.find((project) => project.id === settings.projectId);
  const canCreateJob =
    signedIn &&
    Boolean(settings.organizationSlug) &&
    Boolean(settings.projectId) &&
    settings.targetLocales.length > 0 &&
    segments.length > 0 &&
    busy == null;
  const canPull =
    signedIn &&
    Boolean(settings.organizationSlug) &&
    Boolean(pageJob?.projectId || settings.projectId) &&
    busy !== "pull" &&
    pageJob != null &&
    (pageJob.status === "succeeded" || pageJob.status === "waiting_for_review");
  const canGeneratePageJob =
    signedIn &&
    pageJob != null &&
    (pageJob.status === "queued" || pageJob.status === "failed") &&
    busy == null;

  const persistSettings = (next: PluginSettings) => {
    setSettings(next);
    postPluginMessage({ type: "storage-set", settings: next });
  };

  const persistBinding = (binding: FigmaPageJobBinding | null) => {
    setPageBinding(binding);
    if (binding) {
      postPluginMessage({ type: "binding-set", binding });
    } else {
      postPluginMessage({ type: "binding-clear" });
    }
  };

  const rememberPageJob = (job: FigmaPageJob) => {
    setPageJob(job);
    persistBinding({
      projectId: job.projectId,
      jobId: job.jobId,
      sourcePath: job.sourcePath,
    });
    setSettings((current) => {
      const next = { ...current, lastJobId: job.jobId };
      postPluginMessage({ type: "storage-set", settings: next });
      return next;
    });
  };

  useEffect(() => {
    const handleMessage = (event: MessageEvent<{ pluginMessage?: SandboxToUiMessage }>) => {
      const payload = event.data.pluginMessage;
      if (payload?.type === "ready") {
        setSettings(mergeSettings(payload.settings));
        setFile(payload.file);
        setPageBinding(payload.binding);
        setBooted(true);
      }
      if (payload?.type === "page-changed") {
        setFile(payload.file);
        setPageBinding(payload.binding);
        setPageJob(null);
        setSegments([]);
        setStatusMessage(null);
      }
    };

    window.addEventListener("message", handleMessage);
    postPluginMessage({ type: "boot" });
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  useEffect(() => {
    if (!settings.sealedSession) {
      return;
    }

    let cancelled = false;

    async function loadWorkspace() {
      try {
        const session = await fetchFigmaSession({
          appUrl: settings.appUrl,
          sealedSession: settings.sealedSession!,
          organizationSlug: settings.organizationSlug || undefined,
        });
        if (cancelled) {
          return;
        }

        const nextSlug =
          settings.organizationSlug ||
          session.organization.slug ||
          session.organizations[0]?.slug ||
          "";
        const loadedProjects = nextSlug
          ? await fetchFigmaProjects({
              appUrl: settings.appUrl,
              sealedSession: settings.sealedSession!,
              organizationSlug: nextSlug,
            })
          : [];
        if (cancelled) {
          return;
        }

        setOrganizations(
          session.organizations.flatMap((organization) =>
            organization.slug ? [{ slug: organization.slug, name: organization.name }] : [],
          ),
        );
        setProjects(loadedProjects);
        const nextProjectId = resolvePersistedProjectId(settings.projectId, loadedProjects);
        const nextProject = loadedProjects.find((project) => project.id === nextProjectId);
        persistSettings({
          ...settings,
          userEmail: session.user.email,
          organizationSlug: nextSlug,
          projectId: nextProjectId,
          sourceLocale: settings.sourceLocale || nextProject?.sourceLocale || "en",
          targetLocales:
            settings.targetLocales.length > 0
              ? settings.targetLocales
              : (nextProject?.targetLocales ?? ["es"]),
        });
      } catch (error) {
        if (cancelled) {
          return;
        }
        if (error instanceof HyperlocaliseClientError && error.code === "unauthorized") {
          persistSettings({
            ...settings,
            sealedSession: null,
            userEmail: null,
          });
        }
        setErrorMessage(error instanceof Error ? error.message : "Unable to load workspace.");
      }
    }

    void loadWorkspace();
    return () => {
      cancelled = true;
    };
  }, [booted, settings.sealedSession, settings.organizationSlug]);

  useEffect(() => {
    if (!booted || !settings.sealedSession || !file || !settings.organizationSlug) {
      return;
    }

    let cancelled = false;

    async function hydratePageJob() {
      try {
        const job = await fetchCurrentFigmaJob({
          appUrl: settings.appUrl,
          sealedSession: settings.sealedSession!,
          organizationSlug: settings.organizationSlug,
          fileKey: file!.fileKey,
          pageId: file!.pageId,
          projectId: pageBinding?.projectId || settings.projectId || undefined,
        });
        if (cancelled) {
          return;
        }
        if (job) {
          rememberPageJob(job);
          const locales = Object.keys(job.translationsByLocale);
          setApplyLocale((current) => current || locales[0] || job.targetLocales[0] || "");
          return;
        }
        persistBinding(null);
        setPageJob(null);
      } catch (error) {
        if (cancelled) {
          return;
        }
        if (pageBinding?.jobId) {
          try {
            const job = await getFigmaJob({
              appUrl: settings.appUrl,
              sealedSession: settings.sealedSession!,
              organizationSlug: settings.organizationSlug,
              jobId: pageBinding.jobId,
            });
            if (!cancelled) {
              rememberPageJob(job);
            }
            return;
          } catch {
            // Keep the page binding and show the stored job id as a fallback.
          }
        }
        setErrorMessage(error instanceof Error ? error.message : "Unable to load the page job.");
      }
    }

    void hydratePageJob();
    return () => {
      cancelled = true;
    };
  }, [booted, settings.sealedSession, settings.organizationSlug, file?.fileKey, file?.pageId]);

  useEffect(() => {
    if (!pageJob || !isInFlightStatus(pageJob.status) || !settings.sealedSession) {
      return;
    }

    let cancelled = false;
    const jobId = pageJob.jobId;

    async function refreshJob() {
      try {
        const job = await getFigmaJob({
          appUrl: settings.appUrl,
          sealedSession: settings.sealedSession!,
          organizationSlug: settings.organizationSlug,
          jobId,
        });
        if (cancelled) {
          return;
        }
        setPageJob(job);
        persistBinding({
          projectId: job.projectId,
          jobId: job.jobId,
          sourcePath: job.sourcePath,
        });
        if (!isInFlightStatus(job.status)) {
          const locales = Object.keys(job.translationsByLocale);
          setApplyLocale((current) => current || locales[0] || job.targetLocales[0] || "");
          if (job.status === "succeeded") {
            setStatusMessage("Translations are ready. Choose a locale and pull them into Figma.");
          } else if (job.status === "waiting_for_review") {
            setStatusMessage("Needs review. You can still pull the current translations.");
          } else if (job.status === "failed") {
            setErrorMessage(job.lastError || "Translation job failed.");
          }
        }
      } catch (error) {
        if (!cancelled) {
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
  }, [pageJob?.jobId, pageJob?.status, settings.sealedSession, settings.organizationSlug]);

  const runAction = async (action: Exclude<BusyAction, null>, work: () => Promise<void>) => {
    setBusy(action);
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      await work();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Something went wrong.");
    } finally {
      setBusy(null);
    }
  };

  const handleSignIn = () =>
    runAction("login", async () => {
      const session = await signInWithOAuth(settings.appUrl);
      persistSettings({
        ...settings,
        sealedSession: session.sealedSession,
        userEmail: session.email,
      });
      setStatusMessage("Signed in.");
    });

  const handleSignOut = () => {
    persistSettings({
      ...settings,
      sealedSession: null,
      userEmail: null,
      lastJobId: null,
    });
    setProjects([]);
    setPageJob(null);
    setStatusMessage("Signed out.");
  };

  const handleExtract = () =>
    runAction("extract", async () => {
      const result = await requestFromSandbox(
        { type: "extract", preserveFormatting: settings.preserveFormatting },
        "extracted",
      );
      setSegments(result.segments);
      setFile(result.file);
      setStatusMessage(
        result.segments.length > 0
          ? `Extracted ${result.segments.length} text segment${result.segments.length === 1 ? "" : "s"} from ${result.file.pageName}.`
          : "No text found on the current selection or page.",
      );
    });

  const handleCreateJob = (generate: boolean) =>
    runAction(generate ? "generate" : "create", async () => {
      if (!settings.sealedSession || !file) {
        throw new Error("Sign in and extract text first.");
      }
      if (!settings.projectId) {
        throw new Error("Select a project to upload to.");
      }

      const created = await createFigmaJob({
        appUrl: settings.appUrl,
        sealedSession: settings.sealedSession,
        organizationSlug: settings.organizationSlug,
        projectId: settings.projectId,
        fileKey: file.fileKey,
        pageId: file.pageId,
        fileName: file.fileName,
        sourceLocale: settings.sourceLocale,
        targetLocales: settings.targetLocales,
        generate,
        segments,
      });

      rememberPageJob(
        pageJobFromCreate({
          ...created,
          targetLocales: settings.targetLocales,
        }),
      );
      setStatusMessage(
        generate
          ? "Job created. Translating…"
          : `Job ${created.jobId} created. Generate translations when you are ready.`,
      );
    });

  const handleGenerateExisting = () =>
    runAction("generate", async () => {
      if (!settings.sealedSession || !pageJob) {
        throw new Error("Create a job first.");
      }

      await generateFigmaJob({
        appUrl: settings.appUrl,
        sealedSession: settings.sealedSession,
        organizationSlug: settings.organizationSlug,
        jobId: pageJob.jobId,
      });
      setPageJob({ ...pageJob, status: "queued", lastError: null });
      setStatusMessage("Generating translations…");
    });

  const handlePull = () =>
    runAction("pull", async () => {
      if (!settings.sealedSession || !file) {
        throw new Error("Sign in first.");
      }
      const projectId = pageJob?.projectId || settings.projectId;
      if (!projectId) {
        throw new Error("Select a project to pull translations from.");
      }

      const pulled = await pullFigmaTranslations({
        appUrl: settings.appUrl,
        sealedSession: settings.sealedSession,
        organizationSlug: settings.organizationSlug,
        projectId,
        fileKey: file.fileKey,
        pageId: file.pageId,
      });
      rememberPageJob(pulled);
      const locales = Object.keys(pulled.translationsByLocale);
      const locale = applyLocale || locales[0] || settings.targetLocales[0];
      if (!locale || !pulled.translationsByLocale[locale]) {
        throw new Error("No translations for the selected locale.");
      }

      setApplyLocale(locale);
      const applied = await requestFromSandbox(
        {
          type: "apply",
          translations: pulled.translationsByLocale[locale],
          preserveFormatting: settings.preserveFormatting,
        },
        "applied",
      );
      setStatusMessage(
        `Applied ${applied.count} translated segment${applied.count === 1 ? "" : "s"} (${locale}).`,
      );
    });

  const jobHref =
    pageJob && settings.organizationSlug
      ? buildFigmaJobUrl({
          appUrl: settings.appUrl,
          organizationSlug: settings.organizationSlug,
          projectId: pageJob.projectId,
          jobId: pageJob.jobId,
        })
      : null;

  return (
    <div className="container">
      <header className="header">
        <h1>Hyperlocalise</h1>
        <p className="description">
          Sign in, choose a project, extract text, then create a job and pull translations back onto
          the page.
        </p>
      </header>

      <label className="field">
        <span>Hyperlocalise URL</span>
        <input
          value={settings.appUrl}
          onChange={(event) =>
            persistSettings({ ...settings, appUrl: normalizeAppUrl(event.target.value) })
          }
          disabled={busy != null}
        />
      </label>

      {signedIn ? (
        <div className="session">
          <p>{settings.userEmail ?? "Signed in"}</p>
          <button type="button" className="button" onClick={handleSignOut} disabled={busy != null}>
            Sign out
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="button buttonPrimary"
          onClick={() => void handleSignIn()}
          disabled={busy != null}
        >
          {busy === "login" ? "Signing in…" : "Sign in with Hyperlocalise"}
        </button>
      )}

      {signedIn ? (
        <>
          {organizations.length > 0 ? (
            <label className="field">
              <span>Organization</span>
              <select
                value={settings.organizationSlug}
                onChange={(event) =>
                  persistSettings({
                    ...settings,
                    organizationSlug: event.target.value,
                    projectId: "",
                  })
                }
                disabled={busy != null}
              >
                {organizations.map((organization) => (
                  <option key={organization.slug} value={organization.slug}>
                    {organization.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          <label className="field">
            <span>Project</span>
            <select
              value={settings.projectId}
              onChange={(event) => {
                const project = projects.find((item) => item.id === event.target.value);
                persistSettings({
                  ...settings,
                  projectId: event.target.value,
                  sourceLocale: project?.sourceLocale || settings.sourceLocale,
                  targetLocales: project?.targetLocales.length
                    ? project.targetLocales
                    : settings.targetLocales,
                });
              }}
              disabled={busy != null || projects.length === 0}
            >
              <option value="">
                {projects.length === 0 ? "No projects" : "Select a project…"}
              </option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
            <p className="hint">Extracted text uploads to this project.</p>
          </label>

          <label className="field">
            <span>Source locale</span>
            <select
              value={settings.sourceLocale}
              onChange={(event) =>
                persistSettings({ ...settings, sourceLocale: event.target.value })
              }
              disabled={busy != null}
            >
              {LOCALE_OPTIONS.map((locale) => (
                <option key={locale.value} value={locale.value}>
                  {locale.label}
                </option>
              ))}
            </select>
          </label>

          <fieldset className="field">
            <legend>Target locales</legend>
            <div className="chips">
              {LOCALE_OPTIONS.filter((locale) => locale.value !== settings.sourceLocale).map(
                (locale) => {
                  const checked = settings.targetLocales.includes(locale.value);
                  return (
                    <label key={locale.value} className="chip">
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={busy != null}
                        onChange={() => {
                          persistSettings({
                            ...settings,
                            targetLocales: checked
                              ? settings.targetLocales.filter((value) => value !== locale.value)
                              : [...settings.targetLocales, locale.value],
                          });
                        }}
                      />
                      {locale.value}
                    </label>
                  );
                },
              )}
            </div>
          </fieldset>

          <label className="switch">
            <input
              type="checkbox"
              checked={settings.preserveFormatting}
              disabled={busy != null}
              onChange={(event) =>
                persistSettings({
                  ...settings,
                  preserveFormatting: event.target.checked,
                })
              }
            />
            Preserve text formatting
          </label>

          <p className="meta">
            {file ? `${file.fileName} · ${file.pageName}` : "Current Figma page"}
            {selectedProject ? ` · ${selectedProject.name}` : ""}
          </p>

          {pageJob ? (
            <section className="jobCard" aria-label="Page job">
              <p className="jobCardStatus">
                <span className={`jobBadge jobBadge-${pageJob.status}`}>
                  {jobStatusLabel(pageJob.status)}
                </span>
                {isInFlightStatus(pageJob.status) ? (
                  <span className="jobPulse">Working…</span>
                ) : null}
              </p>
              <p className="jobCardId">{pageJob.jobId}</p>
              {pageJob.lastError && pageJob.status === "failed" ? (
                <p className="error">{pageJob.lastError}</p>
              ) : null}
              {jobHref ? (
                <a className="jobLink" href={jobHref} target="_blank" rel="noreferrer">
                  Open in Hyperlocalise
                </a>
              ) : null}
            </section>
          ) : null}

          <div className="actions">
            <button
              type="button"
              className="button"
              onClick={() => void handleExtract()}
              disabled={busy != null}
            >
              {busy === "extract" ? "Extracting…" : "Extract text"}
            </button>
            <button
              type="button"
              className="button buttonPrimary"
              onClick={() => void handleCreateJob(true)}
              disabled={!canCreateJob}
              title={!settings.projectId ? "Select a project to upload to" : undefined}
            >
              {busy === "generate" ? "Creating…" : "Create job and generate"}
            </button>
            <button
              type="button"
              className="button"
              onClick={() => void handleCreateJob(false)}
              disabled={!canCreateJob}
              title={!settings.projectId ? "Select a project to upload to" : undefined}
            >
              {busy === "create" ? "Creating…" : "Create job only"}
            </button>
            <button
              type="button"
              className="button"
              onClick={() => void handleGenerateExisting()}
              disabled={!canGeneratePageJob}
            >
              {busy === "generate" && pageJob ? "Generating…" : "Generate job"}
            </button>
          </div>

          <label className="field">
            <span>Pull locale</span>
            <select
              value={applyLocale || settings.targetLocales[0] || ""}
              onChange={(event) => setApplyLocale(event.target.value)}
              disabled={busy === "pull"}
            >
              {settings.targetLocales.map((locale) => (
                <option key={locale} value={locale}>
                  {locale}
                </option>
              ))}
            </select>
          </label>

          <button
            type="button"
            className="button buttonPrimary"
            onClick={() => void handlePull()}
            disabled={!canPull}
            title={!settings.projectId ? "Select a project to pull translations from" : undefined}
          >
            {busy === "pull" ? "Pulling…" : "Pull translations into Figma"}
          </button>
        </>
      ) : null}

      {statusMessage ? <p className="status">{statusMessage}</p> : null}
      {errorMessage ? <p className="error">{errorMessage}</p> : null}

      <div className="footer">
        <button
          type="button"
          className="button"
          onClick={() => postPluginMessage({ type: "cancel" })}
        >
          Close
        </button>
      </div>
    </div>
  );
}
