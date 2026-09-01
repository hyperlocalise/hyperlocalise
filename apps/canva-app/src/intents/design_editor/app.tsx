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
  Badge,
  Box,
  Button,
  CheckboxGroup,
  FormField,
  LinkButton,
  Rows,
  Select,
  Switch,
  Text,
  TextInput,
  Title,
} from "@canva/app-ui-kit";
import { getDesignToken } from "@canva/design";
import { useEffect, useMemo, useState } from "react";

import * as styles from "../../../styles/components.css";
import { applyTranslationsToDesign, extractDesignContent, listDesignPages } from "./design-content";
import {
  buildCanvaJobUrl,
  CANVA_JOB_POLL_INTERVAL_MS,
  type CanvaResourceAuth,
  createCanvaJob,
  deauthorizeHyperlocalise,
  fetchCanvaSession,
  fetchCurrentCanvaJob,
  generateCanvaJob,
  getCanvaJob,
  getHyperlocaliseAccessToken,
  HyperlocaliseClientError,
  openExternalUrl,
  pullCanvaTranslations,
  requestHyperlocaliseAuthorization,
} from "./hyperlocalise-client";
import {
  loadSettings,
  parseSelectedPageValues,
  parseTargetLocales,
  saveSettings,
  selectedPageValues,
} from "./settings";
import type { AppSettings, CanvaDesignJob, DesignPageInfo, DesignSegment } from "./types";

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

type BusyAction = "connect" | "extract" | "create" | "generate" | "pull" | null;

function defaultSelectedPages(pages: DesignPageInfo[]): number[] {
  return pages.filter((page) => page.editable).map((page) => page.index);
}

function pageDescription(page: DesignPageInfo): string {
  if (!page.editable) {
    return page.locked ? "Locked page" : "Unsupported page type";
  }

  return "Editable page";
}

function isInFlightStatus(status: CanvaDesignJob["status"]) {
  return status === "queued" || status === "running";
}

function jobStatusLabel(status: CanvaDesignJob["status"]) {
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
}): CanvaDesignJob {
  return {
    jobId: input.jobId,
    status: "queued",
    projectId: input.projectId,
    sourcePath: input.sourcePath,
    targetLocales: input.targetLocales,
    lastError: null,
    translationsByLocale: {},
  };
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

export const App = () => {
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings());
  const [tokenDraft, setTokenDraft] = useState("");
  const [designPages, setDesignPages] = useState<DesignPageInfo[]>([]);
  const [pagesLoading, setPagesLoading] = useState(true);
  const [pagesError, setPagesError] = useState<string | null>(null);
  const [segments, setSegments] = useState<DesignSegment[]>([]);
  const [pageJob, setPageJob] = useState<CanvaDesignJob | null>(null);
  const [selectedLocale, setSelectedLocale] = useState("");
  const [busy, setBusy] = useState<BusyAction>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [oauthReady, setOauthReady] = useState(false);

  const targetLocales = useMemo(
    () => parseTargetLocales(settings.targetLocales),
    [settings.targetLocales],
  );
  const editablePages = useMemo(() => designPages.filter((page) => page.editable), [designPages]);
  const selectedPageIndices = useMemo(() => {
    if (settings.selectedPageIndices.length > 0) {
      return settings.selectedPageIndices.filter((index) =>
        editablePages.some((page) => page.index === index),
      );
    }

    return defaultSelectedPages(designPages);
  }, [designPages, editablePages, settings.selectedPageIndices]);
  const legacyConnectionToken = settings.connectionToken.trim();
  const connected = oauthReady || legacyConnectionToken.length > 0;

  const resolveAuth = async (): Promise<CanvaResourceAuth> => {
    const accessToken = await getHyperlocaliseAccessToken();
    if (accessToken) {
      return { accessToken };
    }
    return { connectionToken: legacyConnectionToken };
  };
  const canCreateJob =
    connected &&
    targetLocales.length > 0 &&
    selectedPageIndices.length > 0 &&
    segments.length > 0 &&
    busy == null;
  const canPull =
    connected &&
    busy == null &&
    pageJob != null &&
    (pageJob.status === "succeeded" || pageJob.status === "waiting_for_review");
  const canGeneratePageJob =
    connected && pageJob != null && pageJob.status === "queued" && busy == null;

  const persistSettings = (next: AppSettings) => {
    setSettings(next);
    saveSettings(next);
  };

  const updateSettings = (patch: Partial<AppSettings>) => {
    persistSettings({ ...settings, ...patch });
  };

  const disconnect = () => {
    void deauthorizeHyperlocalise();
    setOauthReady(false);
    persistSettings({
      ...settings,
      connectionToken: "",
      organizationSlug: "",
      organizationName: "",
      projectName: "",
      lastJobId: "",
    });
    setPageJob(null);
    setTokenDraft("");
    setStatusMessage("Disconnected.");
  };

  useEffect(() => {
    let cancelled = false;

    async function loadPages() {
      setPagesLoading(true);
      setPagesError(null);

      try {
        const pages = await listDesignPages();
        if (cancelled) {
          return;
        }

        setDesignPages(pages);
        setSettings((current) => {
          if (current.selectedPageIndices.length > 0) {
            return current;
          }

          const next = {
            ...current,
            selectedPageIndices: defaultSelectedPages(pages),
          };
          saveSettings(next);
          return next;
        });
      } catch (error) {
        if (!cancelled) {
          setPagesError(error instanceof Error ? error.message : "Unable to load design pages.");
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
  }, []);

  useEffect(() => {
    if (targetLocales.length === 0) {
      setSelectedLocale("");
      return;
    }

    if (!targetLocales.includes(selectedLocale)) {
      setSelectedLocale(targetLocales[0] ?? "");
    }
  }, [selectedLocale, targetLocales]);

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

        persistSettings({
          ...settings,
          organizationSlug: session.organization.slug ?? "",
          organizationName: session.organization.name,
          projectName: session.project.name,
          sourceLocale: settings.sourceLocale || session.connection.sourceLocale,
          targetLocales:
            settings.targetLocales.trim().length > 0
              ? settings.targetLocales
              : session.connection.targetLocales.join(", "),
        });

        const { token } = await getDesignToken();
        const current = await fetchCurrentCanvaJob({
          auth: await resolveAuth(),
          designToken: token,
        });
        if (!cancelled && current) {
          setPageJob(current);
        }
      } catch (error) {
        if (cancelled) {
          return;
        }
        if (isReconnectError(error)) {
          disconnect();
          setErrorMessage("Reconnect Hyperlocalise to continue.");
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
    if (!pageJob || !isInFlightStatus(pageJob.status) || !connected) {
      return;
    }

    const jobId = pageJob.jobId;
    let cancelled = false;

    async function refreshJob() {
      try {
        const job = await getCanvaJob({
          auth: await resolveAuth(),
          jobId,
        });
        if (cancelled) {
          return;
        }
        setPageJob(job);
        if (job.status === "succeeded") {
          setStatusMessage("Translations are ready. Choose a locale and pull them into Canva.");
        } else if (job.status === "waiting_for_review") {
          setStatusMessage("Needs review. You can still pull the current translations.");
        } else if (job.status === "failed") {
          setErrorMessage(job.lastError || "Translation job failed.");
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
    }, CANVA_JOB_POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [connected, pageJob?.jobId, pageJob?.status, oauthReady, legacyConnectionToken]);

  const runAction = async (action: Exclude<BusyAction, null>, work: () => Promise<void>) => {
    setBusy(action);
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      await work();
    } catch (error) {
      if (isReconnectError(error)) {
        disconnect();
        setErrorMessage("Reconnect Hyperlocalise to continue.");
        return;
      }
      setErrorMessage(error instanceof Error ? error.message : "Something went wrong.");
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
      persistSettings({
        ...settings,
        connectionToken: "",
        organizationSlug: session.organization.slug ?? "",
        organizationName: session.organization.name,
        projectName: session.project.name,
        sourceLocale: session.connection.sourceLocale || settings.sourceLocale,
        targetLocales: session.connection.targetLocales.join(", ") || settings.targetLocales,
      });
      setStatusMessage("Connected.");
    });

  const handleConnectToken = () =>
    runAction("connect", async () => {
      const connectionToken = tokenDraft.trim();
      if (!connectionToken) {
        throw new Error("Paste a connection token from Hyperlocalise.");
      }
      const session = await fetchCanvaSession(connectionToken);
      persistSettings({
        ...settings,
        connectionToken,
        organizationSlug: session.organization.slug ?? "",
        organizationName: session.organization.name,
        projectName: session.project.name,
        sourceLocale: session.connection.sourceLocale || settings.sourceLocale,
        targetLocales: session.connection.targetLocales.join(", ") || settings.targetLocales,
      });
      setTokenDraft("");
      setStatusMessage("Connected.");
    });

  const handleExtract = () =>
    runAction("extract", async () => {
      if (selectedPageIndices.length === 0) {
        throw new Error("Select at least one editable page.");
      }
      const extracted = await extractDesignContent(
        selectedPageIndices,
        settings.preserveFormatting,
      );
      setSegments(extracted.segments);
      if (extracted.segments.length === 0) {
        throw new Error("Add text to the selected pages before localizing.");
      }
      setStatusMessage(
        `Extracted ${extracted.segments.length} text segment${extracted.segments.length === 1 ? "" : "s"}.`,
      );
    });

  const handleCreateJob = (generate: boolean) =>
    runAction(generate ? "generate" : "create", async () => {
      if (segments.length === 0) {
        throw new Error("Extract text first.");
      }
      const { token } = await getDesignToken();
      const created = await createCanvaJob({
        auth: await resolveAuth(),
        designToken: token,
        sourceLocale: settings.sourceLocale.trim(),
        targetLocales,
        generate,
        segments,
      });
      const nextJob = pageJobFromCreate({
        ...created,
        targetLocales,
      });
      setPageJob(nextJob);
      persistSettings({ ...settings, lastJobId: created.jobId });
      setStatusMessage(
        generate
          ? "Job created. Translating…"
          : `Job ${created.jobId} created. Generate translations when you are ready.`,
      );
    });

  const handleGenerateExisting = () =>
    runAction("generate", async () => {
      if (!pageJob) {
        throw new Error("Create a job first.");
      }
      await generateCanvaJob({
        auth: await resolveAuth(),
        jobId: pageJob.jobId,
      });
      setPageJob({ ...pageJob, status: "queued", lastError: null });
      setStatusMessage("Generating translations…");
    });

  const handlePull = () =>
    runAction("pull", async () => {
      const { token } = await getDesignToken();
      const pulled = await pullCanvaTranslations({
        auth: await resolveAuth(),
        designToken: token,
      });
      setPageJob(pulled);
      const locale =
        selectedLocale || Object.keys(pulled.translationsByLocale)[0] || targetLocales[0];
      const translations = locale ? pulled.translationsByLocale[locale] : undefined;
      if (!locale || !translations) {
        throw new Error(`No translated content returned for ${locale || "the selected locale"}.`);
      }
      await applyTranslationsToDesign(
        translations,
        selectedPageIndices,
        settings.preserveFormatting,
      );
      setStatusMessage(
        `Applied ${Object.keys(translations).length} translated segments (${locale}).`,
      );
    });

  const jobHref =
    pageJob && settings.organizationSlug
      ? buildCanvaJobUrl({
          organizationSlug: settings.organizationSlug,
          projectId: pageJob.projectId,
          jobId: pageJob.jobId,
        })
      : null;

  return (
    <div className={styles.scrollContainer}>
      <Rows spacing="2u">
        <Rows spacing="1u">
          <Title size="small">Hyperlocalise for Canva</Title>
          <Text>
            Connect your workspace, extract text from selected pages, create a translation job, then
            pull reviewed locales back into this design.
          </Text>
        </Rows>

        {pagesError ? (
          <Alert tone="warn" title="Pages unavailable">
            <Text>{pagesError}</Text>
          </Alert>
        ) : null}

        {errorMessage ? (
          <Alert tone="critical" title="Something went wrong">
            <Text>{errorMessage}</Text>
          </Alert>
        ) : null}

        {statusMessage ? (
          <Alert tone="positive" title="Status">
            <Text>{statusMessage}</Text>
          </Alert>
        ) : null}

        <Box padding="2u" className={styles.panel}>
          <Rows spacing="1.5u">
            <Rows spacing="0.5u">
              <Title size="xsmall">Workspace</Title>
              <Text size="small" tone="secondary">
                Sign in with Hyperlocalise through Canva OAuth. A pasted connection token is only
                for local development.
              </Text>
            </Rows>

            {connected ? (
              <Rows spacing="1u">
                <Text size="small">
                  {settings.organizationName || "Connected"}
                  {settings.projectName ? ` · ${settings.projectName}` : ""}
                </Text>
                <Button variant="secondary" onClick={disconnect} disabled={busy != null}>
                  Disconnect
                </Button>
              </Rows>
            ) : (
              <Rows spacing="1.5u">
                <Button
                  variant="primary"
                  stretch
                  onClick={handleConnectOauth}
                  loading={busy === "connect"}
                  disabled={busy != null}
                >
                  Connect Hyperlocalise
                </Button>
                <FormField
                  label="Connection token"
                  description="Optional fallback. Paste a token from workspace Integrations → Canva."
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
            )}
          </Rows>
        </Box>

        {connected ? (
          <>
            <Box padding="2u" className={styles.panel}>
              <Rows spacing="1.5u">
                <Rows spacing="0.5u">
                  <Title size="xsmall">Pages to localize</Title>
                  <Text size="small" tone="secondary">
                    Choose which pages to include in extract, upload, and pull.
                  </Text>
                </Rows>

                {pagesLoading ? (
                  <Text size="small" tone="secondary">
                    Loading pages from your design...
                  </Text>
                ) : (
                  <Rows spacing="1u">
                    <Rows spacing="0.5u">
                      <Text size="small">
                        {selectedPageIndices.length} of {editablePages.length} editable pages
                        selected
                      </Text>
                      <div className={styles.pageActions}>
                        <LinkButton
                          onClick={() =>
                            updateSettings({
                              selectedPageIndices: defaultSelectedPages(designPages),
                            })
                          }
                        >
                          Select all
                        </LinkButton>
                        <LinkButton onClick={() => updateSettings({ selectedPageIndices: [] })}>
                          Clear
                        </LinkButton>
                      </div>
                    </Rows>

                    <CheckboxGroup
                      value={selectedPageValues(selectedPageIndices)}
                      onChange={(values) =>
                        updateSettings({
                          selectedPageIndices: parseSelectedPageValues(values),
                        })
                      }
                      options={designPages.map((page) => ({
                        value: String(page.index),
                        label: page.label,
                        description: pageDescription(page),
                        disabled: !page.editable,
                      }))}
                    />
                  </Rows>
                )}
              </Rows>
            </Box>

            <Box padding="2u" className={styles.panel}>
              <Rows spacing="1.5u">
                <Rows spacing="0.5u">
                  <Title size="xsmall">Locales</Title>
                  <Text size="small" tone="secondary">
                    Defaults come from the connection. You can still edit them for this design.
                  </Text>
                </Rows>

                <FormField
                  label="Source locale"
                  value={settings.sourceLocale}
                  control={(props) => (
                    <Select
                      {...props}
                      options={LOCALE_OPTIONS}
                      onChange={(value) => updateSettings({ sourceLocale: value })}
                    />
                  )}
                />

                <FormField
                  label="Target locales"
                  description="Comma-separated locale codes"
                  value={settings.targetLocales}
                  control={(props) => (
                    <TextInput
                      {...props}
                      placeholder="es, fr, de"
                      onChange={(value) => updateSettings({ targetLocales: value })}
                    />
                  )}
                />

                <FormField
                  label="Apply locale"
                  value={selectedLocale}
                  control={(props) => (
                    <Select
                      {...props}
                      stretch
                      disabled={targetLocales.length === 0}
                      options={targetLocales.map((locale) => ({
                        value: locale,
                        label: locale,
                      }))}
                      onChange={setSelectedLocale}
                    />
                  )}
                />

                <FormField
                  label="Preserve inline formatting"
                  value={settings.preserveFormatting}
                  control={(props) => (
                    <Switch
                      {...props}
                      value={settings.preserveFormatting}
                      onChange={(value) => updateSettings({ preserveFormatting: value })}
                    />
                  )}
                />
              </Rows>
            </Box>

            <Box padding="2u" className={styles.panel}>
              <Rows spacing="1.5u">
                <Rows spacing="0.5u">
                  <Title size="xsmall">Job</Title>
                  <Text size="small" tone="secondary">
                    Extract text, create a job, generate translations, then pull a locale back into
                    Canva.
                  </Text>
                </Rows>

                {pageJob ? (
                  <Rows spacing="1u">
                    <div className={styles.workflowStep}>
                      <Badge
                        text={jobStatusLabel(pageJob.status)}
                        tone={
                          pageJob.status === "succeeded"
                            ? "positive"
                            : pageJob.status === "failed" || pageJob.status === "cancelled"
                              ? "critical"
                              : "info"
                        }
                      />
                      <Text size="small">{pageJob.jobId}</Text>
                    </div>
                    {jobHref ? (
                      <LinkButton onClick={() => void openExternalUrl(jobHref)}>
                        Open in Hyperlocalise
                      </LinkButton>
                    ) : null}
                  </Rows>
                ) : (
                  <Text size="small" tone="secondary">
                    No job for this design yet.
                  </Text>
                )}

                <Text size="small" tone="secondary">
                  {segments.length > 0
                    ? `${segments.length} extracted segment${segments.length === 1 ? "" : "s"}.`
                    : "Extract text from the selected pages to create a job."}
                </Text>

                <Button
                  variant="secondary"
                  stretch
                  onClick={handleExtract}
                  disabled={busy != null || selectedPageIndices.length === 0}
                  loading={busy === "extract"}
                >
                  Extract text
                </Button>
                <Button
                  variant="primary"
                  stretch
                  onClick={() => handleCreateJob(true)}
                  disabled={!canCreateJob}
                  loading={busy === "generate"}
                >
                  Create job and generate
                </Button>
                <Button
                  variant="secondary"
                  stretch
                  onClick={() => handleCreateJob(false)}
                  disabled={!canCreateJob}
                  loading={busy === "create"}
                >
                  Create job only
                </Button>
                <Button
                  variant="secondary"
                  stretch
                  onClick={handleGenerateExisting}
                  disabled={!canGeneratePageJob}
                >
                  Generate translations
                </Button>
                <Button
                  variant="primary"
                  stretch
                  onClick={handlePull}
                  disabled={!canPull}
                  loading={busy === "pull"}
                >
                  Pull translations
                </Button>
              </Rows>
            </Box>
          </>
        ) : null}
      </Rows>
    </div>
  );
};
