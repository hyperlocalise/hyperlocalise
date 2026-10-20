import { Box, Button, Card, Flex, Select, Stack, Text } from "@sanity/ui";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useClient, useDataset, useProjectId, useSchema } from "sanity";

import { createDocumentLevelTranslation, patchCurrentDocumentDraft } from "./apply-studio-document";
import { ConnectScreen, ProjectScreen } from "./connect-screens";
import type { HyperlocalisePluginConfig } from "./config";
import { HyperlocaliseIcon } from "./hyperlocalise-icon";
import { extractDocumentSegments, readDocumentTitle } from "./extract-document-segments";
import {
  collectSanityDocument,
  createSanityJob,
  fetchCurrentSanityJob,
  fetchSanityApplyPlan,
  fetchSanityLocaleStatusesFromApi,
  fetchSanitySession,
  getSanityJob,
  resourceAuthFromSettings,
  SANITY_JOB_POLL_INTERVAL_MS,
  type SanityDocumentJob,
  type SanitySessionProject,
} from "./hyperlocalise-client";
import { defaultSelectedLocale, localeLabel, translateToOptionsForProject } from "./locale-label";
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

type Screen = "connect" | "project" | "workflow";
type BusyAction = "connect" | "upload" | "translate" | "apply" | null;

function publishedDocumentId(documentId: string): string {
  return documentId.replace(/^drafts\./, "");
}

function i18nApiMode(mode: LocalizationMode): "document" | "field" | null {
  if (mode === "document-level") {
    return "document";
  }
  if (mode === "field-level") {
    return "field";
  }
  return null;
}

function isInFlightJobStatus(status: string): boolean {
  return status === "queued" || status === "running" || status === "processing";
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
  const [collected, setCollected] = useState(false);

  const publishedId = publishedDocumentId(documentId);
  const appUrl = settings.appUrl;
  const auth = useMemo(() => resourceAuthFromSettings(settings), [settings]);
  const project = useMemo(
    () => sessionProjects.find((entry) => entry.id === settings.projectId) ?? null,
    [sessionProjects, settings.projectId],
  );

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
  if (!auth && screen !== "connect") {
    setScreen("connect");
  }

  useEffect(() => {
    if (!auth) {
      return;
    }
    void (async () => {
      try {
        const session = await fetchSanitySession({ appUrl, auth });
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
        setScreen("connect");
      }
    })();
  }, [auth, appUrl, pluginOptions.supportedLanguages, settings.projectId]);

  useEffect(() => {
    if (!auth || !settings.projectId || !apiI18nMode) {
      return;
    }
    void (async () => {
      try {
        const { locales } = await fetchSanityLocaleStatusesFromApi({
          appUrl,
          auth,
          projectId: settings.projectId!,
          sanityProjectId,
          dataset,
          documentIds: [publishedId],
        });
        const docStatus = locales
          .flatMap((locale) => locale.documents)
          .find((entry) => entry.documentId === publishedId);
        setCollected(docStatus?.status === "succeeded" || docStatus?.status === "collected");
      } catch {
        setCollected(false);
      }
    })();
  }, [apiI18nMode, appUrl, auth, dataset, publishedId, sanityProjectId, settings.projectId]);

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

  useEffect(() => {
    if (!auth || !pageJob || !isInFlightJobStatus(pageJob.status)) {
      return;
    }
    const timer = window.setInterval(() => {
      void getSanityJob({ appUrl, auth, jobId: pageJob.jobId })
        .then((job) => {
          setPageJob(job);
          if (job.sourcePath) {
            setSourcePath(job.sourcePath);
          }
          if (job.status === "completed") {
            setStatus("Translation finished. You can apply when ready.");
          }
        })
        .catch(() => undefined);
    }, SANITY_JOB_POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [appUrl, auth, pageJob]);

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
  const documentTitle = readDocumentTitle(documentPayload);

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
    if (!auth || !settings.projectId || !project || !apiI18nMode) {
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
      const result = await collectSanityDocument({
        appUrl,
        auth,
        projectId: settings.projectId,
        sanityProjectId,
        dataset,
        documentId: publishedId,
        documentType,
        documentTitle,
        segments,
      });
      setSourcePath(result.sourcePath);
      setCollected(true);
      setStatus(`Uploaded ${result.segmentCount} segments.`);
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
    dataset,
    documentTitle,
    documentType,
    project,
    publishedId,
    sanityProjectId,
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
      const segments = collected ? undefined : buildSegments();
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
        segments,
        generate: true,
      });
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
    collected,
    dataset,
    documentTitle,
    documentType,
    project,
    publishedId,
    sanityProjectId,
    selectedLocale,
    settings.projectId,
  ]);

  const apply = useCallback(async () => {
    if (
      !auth ||
      !settings.projectId ||
      !project ||
      !apiI18nMode ||
      !selectedLocale ||
      !resolvedSourcePath
    ) {
      return;
    }
    if (projectLocalesMatch(selectedLocale, project.sourceLocale)) {
      setError("Pick a target locale to apply.");
      return;
    }
    setBusy("apply");
    setError(null);
    setStatus(null);
    try {
      const plan = await fetchSanityApplyPlan({
        appUrl,
        auth,
        projectId: settings.projectId,
        sourcePath: resolvedSourcePath,
        document: documentPayload,
        i18nMode: apiI18nMode,
        sourceSanityLocale: project.sourceLocale,
        targetSanityLocale: selectedLocale,
      });
      if (plan.missingKeys.length > 0) {
        throw new Error(
          `${plan.missingKeys.length} segments are missing approved translations. Finish them in Hyperlocalise first.`,
        );
      }
      if (plan.i18nMode === "field") {
        await patchCurrentDocumentDraft({
          client,
          publishedDocumentId: publishedId,
          document: plan.document,
        });
      } else {
        await createDocumentLevelTranslation({
          client,
          sourceDocumentId: publishedId,
          sourceLocale: project.sourceLocale,
          targetLocale: selectedLocale,
          documentType,
          translatedDocument: plan.document,
        });
      }
      setStatus(`Applied ${localeLabel(selectedLocale)} translations to this document.`);
    } catch (applyError) {
      setError(applyError instanceof Error ? applyError.message : "Apply failed.");
    } finally {
      setBusy(null);
    }
  }, [
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
  ]);

  const translateTargetOptions = translateToOptionsForProject(
    project,
    pluginOptions.supportedLanguages,
  );

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
            setScreen("workflow");
          }
        }}
      />
    );
  }

  return (
    <Box padding={4} style={{ width: 420, maxWidth: "100%" }}>
      <Stack gap={4}>
        <Flex align="center" justify="space-between">
          <Stack gap={2}>
            <Flex align="center" gap={2}>
              <HyperlocaliseIcon width={18} height={18} />
              <Text size={2} weight="semibold">
                Hyperlocalise
              </Text>
            </Flex>
            {sessionOrg ? (
              <Text muted size={1}>
                {sessionOrg.name}
              </Text>
            ) : null}
          </Stack>
          <Button
            mode="bleed"
            text="Reconnect"
            onClick={() => {
              saveSettings(sanityProjectId, dataset, {
                ...settings,
                accessToken: undefined,
                refreshToken: undefined,
              });
              setScreen("connect");
            }}
          />
        </Flex>

        {localizationMode === "unsupported" ? (
          <Card padding={3} tone="caution">
            <Text size={1}>
              This document type is not configured for document-level or field-level i18n. Add it to
              `documentLocalizationSchemaTypes` or `fieldLocalizationSchemaTypes`.
            </Text>
          </Card>
        ) : (
          <>
            <Stack gap={2}>
              <Text size={1} weight="semibold">
                Document
              </Text>
              <Text muted size={1}>
                {documentType} · {publishedId}
              </Text>
              <Text muted size={1}>
                Mode: {localizationMode === "field-level" ? "Field-level" : "Document-level"}
              </Text>
            </Stack>

            <Stack gap={2}>
              <Text size={1} weight="semibold">
                Translate to
              </Text>
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
            </Stack>

            {pageJob ? (
              <Card padding={3} tone={isInFlightJobStatus(pageJob.status) ? "primary" : "default"}>
                <Text size={1}>
                  Job {pageJob.jobId.slice(0, 8)}… · {pageJob.status}
                </Text>
                {pageJob.lastError ? (
                  <Text size={1} muted>
                    {pageJob.lastError}
                  </Text>
                ) : null}
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

            <Stack gap={3}>
              <Button
                text="Upload"
                tone="primary"
                disabled={busy !== null}
                loading={busy === "upload"}
                onClick={() => void upload()}
              />
              <Button
                text="Translate"
                disabled={busy !== null || !selectedLocale}
                loading={busy === "translate"}
                onClick={() => void translate()}
              />
              <Button
                text="Apply"
                disabled={busy !== null || !selectedLocale || !collected}
                loading={busy === "apply"}
                onClick={() => void apply()}
              />
            </Stack>
          </>
        )}
      </Stack>
    </Box>
  );
}
