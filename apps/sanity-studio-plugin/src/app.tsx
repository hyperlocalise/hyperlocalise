import { SparklesIcon } from "@sanity/icons/Sparkles";
import { Box, Button, Card, Flex, Select, Stack, Text } from "@sanity/ui";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useClient, useDataset, useProjectId, useSchema } from "sanity";

import { ConnectScreen, ProjectScreen } from "./connect-screens";
import type { HyperlocalisePluginConfig } from "./config";
import { documentDisplayName, extractDocumentSegments } from "./extract-document-segments";
import {
  createSanityJob,
  fetchCurrentSanityJob,
  fetchSanityLocaleStatusesFromApi,
  fetchSanitySession,
  getSanityJob,
  resourceAuthFromSettings,
  SANITY_JOB_POLL_INTERVAL_MS,
  type SanityDocumentJob,
  type SanitySessionProject,
} from "./hyperlocalise-client";
import { defaultSelectedLocale, translateToOptionsForProject } from "./locale-label";
import { projectLocalesMatch } from "./locale-map";
import { resolveLocalizationMode, type LocalizationMode } from "./localization-mode";
import {
  fetchSanityIntegrationHealth,
  isSanityOauthCancelled,
  runSanityOAuthHandoff,
} from "./sanity-oauth";
import { collectExcludedFieldNames, schemaI18nHints } from "./schema-hints";
import { buildSanityDocumentSourcePath } from "./source-path";
import { loadSettings, saveSettings, type PluginSettings } from "./settings";
import {
  actionLabel,
  writeLocaleVersionLabel,
  fetchDocumentLevelTargetRef,
  fieldLevelTargetHasContent,
  emptyDocumentLocaleStatuses,
  hasHlTranslationForLocale,
  lookupLocaleProgress,
  parseLocaleStatusesForDocument,
  uploadTargetLocaleFromSanity,
} from "./target-translations";
import { localeVersionWrittenMessage, writeStudioLocaleVersion } from "./write-studio-locale";
import {
  DocumentHero,
  isActiveTranslationJobStatus,
  isJobReadyToWrite,
  publishedDocumentId,
  TranslationProgressBar,
  WorkflowHeader,
  WorkflowPanel,
  WorkflowProjectLine,
  WorkflowSection,
  WorkflowSessionLoading,
} from "./workflow-ui";

type Screen = "connect" | "project" | "workflow";
type BusyAction = "connect" | "upload" | "translate" | "write" | null;

function i18nApiMode(mode: LocalizationMode): "document" | "field" | null {
  if (mode === "document-level") {
    return "document";
  }
  if (mode === "field-level") {
    return "field";
  }
  return null;
}

export function HyperlocaliseDocumentWorkflow({
  pluginOptions,
  documentId,
  documentType,
  document,
}: {
  pluginOptions: HyperlocalisePluginConfig;
  documentId: string;
  documentType: string;
  document: Record<string, unknown>;
}) {
  const sanityProjectId = useProjectId() ?? "";
  const dataset = useDataset() ?? "production";
  const schema = useSchema();
  const client = useClient({ apiVersion: "2024-01-01" });

  const settingsScope = `${sanityProjectId}:${dataset}`;
  const [screen, setScreen] = useState<Screen>("connect");
  const [loadedScope, setLoadedScope] = useState(settingsScope);
  const [settings, setSettings] = useState<PluginSettings>(() =>
    loadSettings(sanityProjectId, dataset),
  );
  const [busy, setBusy] = useState<BusyAction>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [sessionProjects, setSessionProjects] = useState<SanitySessionProject[]>([]);
  const [sessionOrg, setSessionOrg] = useState<{ name: string } | null>(null);
  const [selectedLocale, setSelectedLocale] = useState("");
  const [sourcePath, setSourcePath] = useState<string | null>(null);
  const [pageJob, setPageJob] = useState<SanityDocumentJob | null>(null);
  const [documentHlStatus, setDocumentHlStatus] = useState(emptyDocumentLocaleStatuses);
  const [sanityTargetReady, setSanityTargetReady] = useState(false);
  const [choosingProject, setChoosingProject] = useState(false);
  const pendingWriteJobIdRef = useRef<string | null>(null);
  const auth = useMemo(() => resourceAuthFromSettings(settings), [settings]);
  const [sessionLoading, setSessionLoading] = useState(() => Boolean(auth));

  const publishedId = publishedDocumentId(documentId);
  const appUrl = settings.appUrl;
  const project = useMemo(
    () => sessionProjects.find((entry) => entry.id === settings.projectId) ?? null,
    [sessionProjects, settings.projectId],
  );
  const workflowProjectLabel = useMemo(() => {
    if (project?.name) {
      return project.name;
    }
    if (settings.projectId) {
      return "Unknown project — choose again";
    }
    return "Not selected";
  }, [project?.name, settings.projectId]);

  const { hasLanguageField, hasInternationalizedArrayField } = schemaI18nHints(
    documentType,
    schema,
  );
  const excludeFieldNames = collectExcludedFieldNames(documentType, schema);
  const localizationMode = resolveLocalizationMode({
    documentType,
    options: pluginOptions,
    hasLanguageField,
    hasInternationalizedArrayField,
  });
  const apiI18nMode = i18nApiMode(localizationMode);

  if (loadedScope !== settingsScope) {
    setLoadedScope(settingsScope);
    setSettings(loadSettings(sanityProjectId, dataset));
  }
  useEffect(() => {
    if (!auth) {
      setSessionLoading(false);
      setScreen("connect");
      return;
    }

    let cancelled = false;
    setSessionLoading(true);
    void (async () => {
      try {
        const session = await fetchSanitySession({ appUrl, auth });
        if (cancelled) {
          return;
        }
        setSessionProjects(session.projects);
        setSessionOrg(session.organization);
        setSelectedLocale((current) =>
          defaultSelectedLocale(
            session.projects.find((entry) => entry.id === settings.projectId) ?? null,
            current,
            pluginOptions.supportedLanguages,
          ),
        );
        setScreen(settings.projectId ? "workflow" : "project");
      } catch {
        if (!cancelled) {
          setScreen("connect");
        }
      } finally {
        if (!cancelled) {
          setSessionLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [auth, appUrl, pluginOptions.supportedLanguages, settings.projectId]);

  const refreshDocumentHlStatus = useCallback(async () => {
    if (!auth || !settings.projectId || !apiI18nMode) {
      setDocumentHlStatus(emptyDocumentLocaleStatuses());
      return;
    }
    try {
      const { locales } = await fetchSanityLocaleStatusesFromApi({
        appUrl,
        auth,
        projectId: settings.projectId,
        sanityProjectId,
        dataset,
        documentIds: [publishedId],
      });
      setDocumentHlStatus(parseLocaleStatusesForDocument(locales, publishedId));
    } catch {
      setDocumentHlStatus(emptyDocumentLocaleStatuses());
    }
  }, [apiI18nMode, appUrl, auth, dataset, publishedId, sanityProjectId, settings.projectId]);

  useEffect(() => {
    void refreshDocumentHlStatus();
  }, [refreshDocumentHlStatus]);

  useEffect(() => {
    if (!selectedLocale || localizationMode === "unsupported") {
      setSanityTargetReady(false);
      return;
    }
    if (localizationMode === "field-level") {
      setSanityTargetReady(
        fieldLevelTargetHasContent({
          document: document,
          locale: selectedLocale,
          i18nMode: localizationMode,
          customBlockTypes: pluginOptions.customBlockTypes,
          excludeFieldNames,
        }),
      );
      return;
    }
    let cancelled = false;
    void (async () => {
      const ref = await fetchDocumentLevelTargetRef(client, publishedId, selectedLocale);
      if (!cancelled) {
        setSanityTargetReady(Boolean(ref));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    client,
    document,
    excludeFieldNames,
    localizationMode,
    pluginOptions.customBlockTypes,
    publishedId,
    selectedLocale,
  ]);

  useEffect(() => {
    if (!auth || !settings.projectId || !apiI18nMode) {
      return;
    }
    void (async () => {
      try {
        const { job } = await fetchCurrentSanityJob({
          appUrl,
          auth,
          projectId: settings.projectId!,
          sanityProjectId,
          dataset,
          documentId: publishedId,
          documentType,
        });
        setPageJob(job);
        if (job?.sourcePath) {
          setSourcePath(job.sourcePath);
        }
      } catch {
        setPageJob(null);
      }
    })();
  }, [
    apiI18nMode,
    appUrl,
    auth,
    dataset,
    documentType,
    publishedId,
    sanityProjectId,
    settings.projectId,
  ]);

  const switchAccount = useCallback(() => {
    const next = saveSettings(sanityProjectId, dataset, {
      ...settings,
      accessToken: undefined,
      refreshToken: undefined,
      projectId: undefined,
    });
    setSettings(next);
    setChoosingProject(false);
    setScreen("connect");
  }, [dataset, sanityProjectId, settings]);

  const connect = useCallback(async () => {
    setBusy("connect");
    setError(null);
    try {
      const health = await fetchSanityIntegrationHealth(appUrl);
      if (!health.sanityOauthConfigured || !health.sanityOauthClientId) {
        throw new Error("Hyperlocalise OAuth is not configured for this app URL.");
      }
      const tokens = await runSanityOAuthHandoff({
        appUrl,
        clientId: health.sanityOauthClientId,
      });
      const next = saveSettings(sanityProjectId, dataset, {
        ...settings,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
      });
      setSettings(next);
      setScreen("project");
    } catch (connectError) {
      if (!isSanityOauthCancelled(connectError)) {
        setError(connectError instanceof Error ? connectError.message : "Connect failed.");
      }
    } finally {
      setBusy(null);
    }
  }, [appUrl, dataset, sanityProjectId, settings]);

  const documentPayload = document;
  const documentTitle = documentDisplayName(documentPayload);
  const localizationModeLabel =
    localizationMode === "field-level" ? "Field-level i18n" : "Document-level i18n";

  const buildSegments = useCallback(() => {
    if (!project || !apiI18nMode) {
      return [];
    }
    return extractDocumentSegments({
      document: documentPayload,
      documentId: publishedId,
      documentType,
      i18nMode: localizationMode,
      sourceLocale: project.sourceLocale,
      customBlockTypes: pluginOptions.customBlockTypes,
      excludeFieldNames,
    });
  }, [
    apiI18nMode,
    documentPayload,
    documentType,
    excludeFieldNames,
    localizationMode,
    pluginOptions.customBlockTypes,
    project,
    publishedId,
  ]);

  const resolvedSourcePath = useMemo(() => {
    if (sourcePath) {
      return sourcePath;
    }
    try {
      return buildSanityDocumentSourcePath({
        sanityProjectId,
        dataset,
        documentType,
        documentId: publishedId,
        documentTitle,
      });
    } catch {
      return null;
    }
  }, [dataset, documentTitle, documentType, publishedId, sanityProjectId, sourcePath]);

  const upload = useCallback(async () => {
    if (!auth || !settings.projectId || !project || !apiI18nMode || !selectedLocale) {
      return;
    }
    const segments = buildSegments();
    if (segments.length === 0) {
      setError("No translatable text found on this document.");
      return;
    }
    setBusy("upload");
    setError(null);
    setStatus(null);
    try {
      const result = await uploadTargetLocaleFromSanity({
        appUrl,
        auth,
        client,
        projectId: settings.projectId,
        sanityProjectId,
        dataset,
        documentId: publishedId,
        documentType,
        documentTitle,
        locale: selectedLocale,
        i18nMode: localizationMode,
        sourceDocument: documentPayload,
        sourceStatus: documentHlStatus.source,
        sourceSegments: segments,
        customBlockTypes: pluginOptions.customBlockTypes,
        excludeFieldNames,
      });
      if (result.sourcePath) {
        setSourcePath(result.sourcePath);
      }
      await refreshDocumentHlStatus();
      setStatus(
        `Imported ${result.imported} ${selectedLocale} translation${result.imported === 1 ? "" : "s"} into Hyperlocalise.`,
      );
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Upload failed.");
    } finally {
      setBusy(null);
    }
  }, [
    apiI18nMode,
    appUrl,
    auth,
    buildSegments,
    client,
    dataset,
    documentHlStatus.source,
    documentPayload,
    documentTitle,
    documentType,
    excludeFieldNames,
    localizationMode,
    pluginOptions.customBlockTypes,
    project,
    publishedId,
    refreshDocumentHlStatus,
    sanityProjectId,
    selectedLocale,
    settings.projectId,
  ]);

  const translate = useCallback(async () => {
    if (!auth || !settings.projectId || !project || !apiI18nMode || !selectedLocale) {
      return;
    }
    if (projectLocalesMatch(selectedLocale, project.sourceLocale)) {
      setError("Pick a target locale to translate into.");
      return;
    }
    setBusy("translate");
    setError(null);
    setStatus(null);
    try {
      const segments = buildSegments();
      if (segments.length === 0 && documentHlStatus.source !== "succeeded") {
        setError(
          localizationMode === "field-level"
            ? `No ${project.sourceLocale} field content found on this document.`
            : "No translatable text found on this document.",
        );
        return;
      }
      const job = await createSanityJob({
        appUrl,
        auth,
        projectId: settings.projectId,
        sanityProjectId,
        dataset,
        documentId: publishedId,
        documentType,
        documentTitle,
        sourceLocale: project.sourceLocale,
        targetLocales: [selectedLocale],
        segments: segments.length > 0 ? segments : undefined,
        generate: true,
      });
      pendingWriteJobIdRef.current = job.jobId;
      setSourcePath(job.sourcePath);
      setPageJob({
        jobId: job.jobId,
        status: job.generated ? "running" : "queued",
        projectId: job.projectId,
        sourcePath: job.sourcePath,
        targetLocales: [selectedLocale],
        lastError: null,
        translationsByLocale: {},
      });
      setStatus("Translation started.");
      await refreshDocumentHlStatus();
    } catch (translateError) {
      setError(translateError instanceof Error ? translateError.message : "Translate failed.");
    } finally {
      setBusy(null);
    }
  }, [
    apiI18nMode,
    appUrl,
    auth,
    buildSegments,
    dataset,
    documentHlStatus.source,
    documentTitle,
    documentType,
    localizationMode,
    project,
    publishedId,
    refreshDocumentHlStatus,
    sanityProjectId,
    selectedLocale,
    settings.projectId,
  ]);

  const writeLocale = useCallback(
    async (sourcePathOverride?: string | null) => {
      const path = sourcePathOverride || resolvedSourcePath;
      if (!auth || !settings.projectId || !project || !apiI18nMode || !selectedLocale || !path) {
        throw new Error("Unable to write a locale version yet.");
      }
      return writeStudioLocaleVersion({
        client,
        appUrl,
        auth,
        projectId: settings.projectId,
        sourcePath: path,
        document: documentPayload,
        i18nMode: apiI18nMode,
        sourceSanityLocale: project.sourceLocale,
        targetSanityLocale: selectedLocale,
        sourceDocumentId: publishedId,
        documentType,
      });
    },
    [
      apiI18nMode,
      appUrl,
      auth,
      client,
      documentPayload,
      documentType,
      project,
      publishedId,
      resolvedSourcePath,
      selectedLocale,
      settings.projectId,
    ],
  );

  const apply = useCallback(async () => {
    if (project && projectLocalesMatch(selectedLocale, project.sourceLocale)) {
      setError("Pick a target locale to write.");
      return;
    }
    setBusy("write");
    setError(null);
    setStatus(null);
    try {
      await writeLocale();
      setStatus(localeVersionWrittenMessage(selectedLocale));
      await refreshDocumentHlStatus();
    } catch (writeError) {
      setError(writeError instanceof Error ? writeError.message : "Write failed.");
    } finally {
      setBusy(null);
    }
  }, [project, refreshDocumentHlStatus, selectedLocale, writeLocale]);

  useEffect(() => {
    if (!auth || !pageJob || !isActiveTranslationJobStatus(pageJob.status)) {
      return;
    }
    const timer = window.setInterval(() => {
      void getSanityJob({ appUrl, auth, jobId: pageJob.jobId })
        .then(async (job) => {
          setPageJob(job);
          if (job.sourcePath) {
            setSourcePath(job.sourcePath);
          }
          void refreshDocumentHlStatus();
          if (
            !isJobReadyToWrite(job.status) ||
            pendingWriteJobIdRef.current !== job.jobId
          ) {
            return;
          }
          pendingWriteJobIdRef.current = null;
          try {
            await writeLocale(job.sourcePath);
            setStatus(localeVersionWrittenMessage(selectedLocale));
            await refreshDocumentHlStatus();
          } catch (writeError) {
            setError(writeError instanceof Error ? writeError.message : "Write failed.");
          }
        })
        .catch(() => undefined);
    }, SANITY_JOB_POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [appUrl, auth, pageJob, refreshDocumentHlStatus, selectedLocale, writeLocale]);

  const sourceCollected = documentHlStatus.source === "succeeded";
  const selectedHlStatus = useMemo(() => {
    if (!selectedLocale) {
      return undefined;
    }
    if (documentHlStatus.byLocale[selectedLocale]) {
      return documentHlStatus.byLocale[selectedLocale];
    }
    for (const [locale, status] of Object.entries(documentHlStatus.byLocale)) {
      if (projectLocalesMatch(locale, selectedLocale)) {
        return status;
      }
    }
    return undefined;
  }, [documentHlStatus.byLocale, selectedLocale]);
  const selectedProgress = useMemo(() => {
    if (!selectedLocale) {
      return documentHlStatus.sourceProgress;
    }
    return lookupLocaleProgress(documentHlStatus.progressByLocale, selectedLocale);
  }, [documentHlStatus.progressByLocale, documentHlStatus.sourceProgress, selectedLocale]);
  const writeReady = hasHlTranslationForLocale(selectedHlStatus);
  const activeJob = Boolean(pageJob && isActiveTranslationJobStatus(pageJob.status));
  const progressStatus = activeJob
    ? pageJob!.status
    : selectedLocale
      ? (selectedHlStatus ?? "missing")
      : sourceCollected
        ? "collected"
        : "missing";
  const showProgress =
    Boolean(pageJob) ||
    sourceCollected ||
    Boolean(selectedProgress && selectedProgress.segmentCount > 0);
  const localeTags = selectedLocale ? [selectedLocale] : [];

  const translateTargetOptions = translateToOptionsForProject(
    project,
    pluginOptions.supportedLanguages,
  );

  if (sessionLoading) {
    return <WorkflowSessionLoading />;
  }

  if (screen === "connect") {
    return (
      <ConnectScreen error={error} busy={busy === "connect"} onConnect={() => void connect()} />
    );
  }

  if (screen === "project") {
    return (
      <ProjectScreen
        projectId={settings.projectId ?? ""}
        projects={sessionProjects}
        disabled={busy !== null}
        showCancel={choosingProject && Boolean(settings.projectId)}
        onCancel={() => {
          setChoosingProject(false);
          setScreen("workflow");
        }}
        onSwitchAccount={switchAccount}
        onSelect={(projectId) => {
          const next = saveSettings(sanityProjectId, dataset, { ...settings, projectId });
          setSettings(next);
          setSelectedLocale(
            defaultSelectedLocale(
              sessionProjects.find((entry) => entry.id === projectId) ?? null,
              selectedLocale,
              pluginOptions.supportedLanguages,
            ),
          );
          if (projectId) {
            setChoosingProject(false);
            setScreen("workflow");
          }
        }}
      />
    );
  }

  return (
    <WorkflowPanel>
      <WorkflowHeader title="Hyperlocalise" subtitle={sessionOrg?.name ?? null} />
      <WorkflowProjectLine
        projectName={workflowProjectLabel}
        disabled={busy !== null}
        onChangeProject={() => {
          setChoosingProject(true);
          setScreen("project");
        }}
        onSwitchAccount={switchAccount}
      />

      {localizationMode === "unsupported" ? (
        <Card padding={3} tone="caution">
          <Text size={1}>
            This document type is not configured for document-level or field-level i18n. Add it to
            `documentLocalizationSchemaTypes` or `fieldLocalizationSchemaTypes`.
          </Text>
        </Card>
      ) : (
        <>
          <DocumentHero
            displayName={documentTitle}
            documentType={documentType}
            meta={localizationModeLabel}
          />

          <WorkflowSection title="Translate to">
            <Select
              value={selectedLocale}
              onChange={(event) => setSelectedLocale(event.currentTarget.value)}
            >
              <option value="">Select locale</option>
              {translateTargetOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </WorkflowSection>

          {showProgress ? (
            <Card
              padding={3}
              tone={
                progressStatus === "failed" || progressStatus === "cancelled"
                  ? "critical"
                  : activeJob
                    ? "primary"
                    : !selectedLocale && sourceCollected
                      ? "positive"
                      : selectedProgress &&
                          selectedProgress.approvedCount === selectedProgress.segmentCount &&
                          selectedProgress.segmentCount > 0
                        ? "positive"
                        : selectedProgress && selectedProgress.reviewCount > 0
                          ? "caution"
                          : "default"
              }
            >
              <TranslationProgressBar
                status={progressStatus}
                lastError={pageJob?.lastError}
                progress={selectedProgress}
                sourceOnly={!selectedLocale}
              />
            </Card>
          ) : null}

          {error ? (
            <Card padding={3} tone="critical">
              <Text size={1}>{error}</Text>
            </Card>
          ) : null}
          {status ? (
            <Card padding={3} tone="positive">
              <Text size={1}>{status}</Text>
            </Card>
          ) : null}

          <Card padding={3} radius={3} shadow={1}>
            <Stack gap={3}>
              <Flex gap={2} wrap="nowrap">
                <Box flex={1} style={{ minWidth: 0 }}>
                  <Button
                    width="fill"
                    text={actionLabel("Upload", localeTags)}
                    tone="primary"
                    disabled={
                      busy !== null || !project || !selectedLocale || !sanityTargetReady
                    }
                    loading={busy === "upload"}
                    onClick={() => void upload()}
                  />
                </Box>
                <Box flex={1} style={{ minWidth: 0 }}>
                  <Button
                    width="fill"
                    text={writeLocaleVersionLabel(localeTags)}
                    disabled={busy !== null || !selectedLocale || !writeReady}
                    loading={busy === "write"}
                    onClick={() => void apply()}
                  />
                </Box>
              </Flex>
              <Button
                width="fill"
                text={actionLabel("Translate", localeTags)}
                icon={SparklesIcon}
                tone="primary"
                disabled={busy !== null || !selectedLocale || !project}
                loading={busy === "translate"}
                onClick={() => void translate()}
              />
            </Stack>
          </Card>
        </>
      )}
    </WorkflowPanel>
  );
}
