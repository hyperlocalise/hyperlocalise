import { useEffect, useState } from "react";

import {
    createFigmaJob,
    fetchFigmaProjects,
    fetchFigmaSession,
    generateFigmaJob,
    HyperlocaliseClientError,
    pollFigmaJob,
    pullFigmaTranslations,
    signInWithOAuth,
    type FigmaProject,
} from "./hyperlocalise-client";
import type {
    FigmaFileInfo,
    FigmaSegment,
    PluginSettings,
    SandboxToUiMessage,
    UiToSandboxMessage,
} from "./plugin-messages";
import { DEFAULT_SETTINGS, mergeSettings, normalizeAppUrl } from "./settings";

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

export function App() {
    const [settings, setSettings] = useState<PluginSettings>(DEFAULT_SETTINGS);
    const [file, setFile] = useState<FigmaFileInfo | null>(null);
    const [projects, setProjects] = useState<FigmaProject[]>([]);
    const [organizations, setOrganizations] = useState<Array<{ slug: string; name: string }>>([]);
    const [segments, setSegments] = useState<FigmaSegment[]>([]);
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
    const canPull = signedIn && Boolean(settings.organizationSlug) && Boolean(settings.projectId) && busy == null;

    const persistSettings = (next: PluginSettings) => {
        setSettings(next);
        postPluginMessage({ type: "storage-set", settings: next });
    };

    useEffect(() => {
        const handleMessage = (event: MessageEvent<{ pluginMessage?: SandboxToUiMessage }>) => {
            const payload = event.data.pluginMessage;
            if (payload?.type === "ready") {
                setSettings(mergeSettings(payload.settings));
                setFile(payload.file);
                setBooted(true);
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
                const nextProjectId =
                    settings.projectId && loadedProjects.some((project) => project.id === settings.projectId)
                        ? settings.projectId
                        : (loadedProjects[0]?.id ?? "");
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

            const created = await createFigmaJob({
                appUrl: settings.appUrl,
                sealedSession: settings.sealedSession,
                organizationSlug: settings.organizationSlug,
                projectId: settings.projectId,
                fileKey: file.fileKey,
                fileName: file.fileName,
                sourceLocale: settings.sourceLocale,
                targetLocales: settings.targetLocales,
                generate,
                segments,
            });

            persistSettings({ ...settings, lastJobId: created.jobId });
            setStatusMessage(
                generate
                    ? "Job created. Generating translations…"
                    : `Job ${created.jobId} created. Generate translations when you are ready.`,
            );

            if (generate) {
                const completed = await pollFigmaJob({
                    appUrl: settings.appUrl,
                    sealedSession: settings.sealedSession,
                    organizationSlug: settings.organizationSlug,
                    jobId: created.jobId,
                });
                const locales = Object.keys(completed.translationsByLocale);
                setApplyLocale((current) => current || locales[0] || settings.targetLocales[0] || "");
                setStatusMessage("Translations are ready. Choose a locale and pull them into Figma.");
            }
        });

    const handleGenerateExisting = () =>
        runAction("generate", async () => {
            if (!settings.sealedSession || !settings.lastJobId) {
                throw new Error("Create a job first.");
            }

            await generateFigmaJob({
                appUrl: settings.appUrl,
                sealedSession: settings.sealedSession,
                organizationSlug: settings.organizationSlug,
                jobId: settings.lastJobId,
            });
            const completed = await pollFigmaJob({
                appUrl: settings.appUrl,
                sealedSession: settings.sealedSession,
                organizationSlug: settings.organizationSlug,
                jobId: settings.lastJobId,
            });
            const locales = Object.keys(completed.translationsByLocale);
            setApplyLocale((current) => current || locales[0] || settings.targetLocales[0] || "");
            setStatusMessage("Translations are ready. Choose a locale and pull them into Figma.");
        });

    const handlePull = () =>
        runAction("pull", async () => {
            if (!settings.sealedSession || !file) {
                throw new Error("Sign in first.");
            }

            const pulled = await pullFigmaTranslations({
                appUrl: settings.appUrl,
                sealedSession: settings.sealedSession,
                organizationSlug: settings.organizationSlug,
                projectId: settings.projectId,
                fileKey: file.fileKey,
            });
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
            persistSettings({ ...settings, lastJobId: pulled.jobId ?? settings.lastJobId });
            setStatusMessage(`Applied ${applied.count} translated segment${applied.count === 1 ? "" : "s"} (${locale}).`);
        });

    return (
        <div className="container">
            <header className="header">
                <h1>Hyperlocalise</h1>
                <p className="description">
                    Extract text from this file, create a translation job, then pull generated
                    translations back onto the page.
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
                                    targetLocales:
                                        project?.targetLocales.length ? project.targetLocales : settings.targetLocales,
                                });
                            }}
                            disabled={busy != null || projects.length === 0}
                        >
                            {projects.length === 0 ? <option value="">No projects</option> : null}
                            {projects.map((project) => (
                                <option key={project.id} value={project.id}>
                                    {project.name}
                                </option>
                            ))}
                        </select>
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
                        {file
                            ? `${file.fileName} · ${file.pageName}`
                            : "Current Figma page"}
                        {selectedProject ? ` · ${selectedProject.name}` : ""}
                    </p>

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
                        >
                            {busy === "generate" ? "Generating…" : "Create job and generate"}
                        </button>
                        <button
                            type="button"
                            className="button"
                            onClick={() => void handleCreateJob(false)}
                            disabled={!canCreateJob}
                        >
                            {busy === "create" ? "Creating…" : "Create job only"}
                        </button>
                        <button
                            type="button"
                            className="button"
                            onClick={() => void handleGenerateExisting()}
                            disabled={!settings.lastJobId || busy != null}
                        >
                            Generate last job
                        </button>
                    </div>

                    <label className="field">
                        <span>Pull locale</span>
                        <select
                            value={applyLocale || settings.targetLocales[0] || ""}
                            onChange={(event) => setApplyLocale(event.target.value)}
                            disabled={busy != null}
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
                    disabled={busy != null}
                >
                    Close
                </button>
            </div>
        </div>
    );
}
