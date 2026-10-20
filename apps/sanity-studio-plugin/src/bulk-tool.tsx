import { SparklesIcon } from "@sanity/icons/Sparkles";
import { Box, Button, Card, Checkbox, Flex, Select, Stack, Text } from "@sanity/ui";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useClient, useDataset, useProjectId } from "sanity";

import { createDocumentLevelTranslation } from "./apply-studio-document";
import { ConnectScreen, ProjectScreen } from "./connect-screens";
import { parseBulkConfig, type HyperlocaliseBulkConfig } from "./config";
import { ConfigErrorCard } from "./config-error";
import { documentDisplayName, extractDocumentSegments } from "./extract-document-segments";
import { HyperlocaliseIcon } from "./hyperlocalise-icon";
import {
  createSanityJob,
  fetchSanityApplyPlan,
  fetchSanityLocaleStatusesFromApi,
  fetchSanitySession,
  resourceAuthFromSettings,
  SANITY_JOB_POLL_INTERVAL_MS,
  type SanitySessionProject,
} from "./hyperlocalise-client";
import { isRecord, readString } from "./json";
import { defaultSelectedLocale, translateToOptionsForProject } from "./locale-label";
import {
  fetchSanityIntegrationHealth,
  isSanityOauthCancelled,
  runSanityOAuthHandoff,
} from "./sanity-oauth";
import { buildSanityDocumentSourcePath } from "./source-path";
import { loadSettings, saveSettings, type PluginSettings } from "./settings";
import { projectLocalesMatch } from "./locale-map";
import {
  actionLabel,
  createLocaleVersionLabel,
  fetchDocumentLevelTargetsMap,
  hasHlTranslationForLocale,
  parseLocaleStatusesForDocument,
  uploadTargetLocaleFromSanity,
} from "./target-translations";
import {
  BulkActionProgress,
  documentListLabel,
  isActiveTranslationJobStatus,
  publishedDocumentId,
  TranslationProgressBar,
  WorkflowHeader,
  WorkflowPanel,
  WorkflowProjectLine,
  WorkflowSection,
  WorkflowSessionLoading,
} from "./workflow-ui";

type Screen = "connect" | "project" | "workflow";
type BusyAction = "connect" | "upload" | "translate" | "apply" | null;

type ListedDocument = {
  _id: string;
  _type: string;
  title?: string;
  name?: string;
  language?: string;
};

type BulkProgress = {
  action: BusyAction;
  current: number;
  total: number;
};

function HyperlocaliseBulkWorkflow({ config }: { config: HyperlocaliseBulkConfig }) {
  const sanityProjectId = useProjectId() ?? "";
  const dataset = useDataset() ?? "production";
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
  const [documents, setDocuments] = useState<ListedDocument[]>([]);
  const [selectedDocumentIds, setSelectedDocumentIds] = useState<string[]>([]);
  const [selectedLocale, setSelectedLocale] = useState("");
  const [documentHlById, setDocumentHlById] = useState<
    Record<string, { source: string; byLocale: Record<string, string> }>
  >({});
  const [targetsByDoc, setTargetsByDoc] = useState<Record<string, Record<string, string>>>({});
  const [bulkProgress, setBulkProgress] = useState<BulkProgress | null>(null);
  const [choosingProject, setChoosingProject] = useState(false);

  const appUrl = settings.appUrl;
  const auth = useMemo(() => resourceAuthFromSettings(settings), [settings]);
  const [sessionLoading, setSessionLoading] = useState(() => Boolean(auth));
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
  const localeOptions = translateToOptionsForProject(project, config.supportedLanguages);

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
        const selectedProject =
          session.projects.find((entry) => entry.id === settings.projectId) ?? null;
        setSelectedLocale((current) =>
          defaultSelectedLocale(selectedProject, current, config.supportedLanguages),
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
  }, [appUrl, auth, config.supportedLanguages, settings.projectId]);

  const refreshDocuments = useCallback(async () => {
    if (!project) {
      setDocuments([]);
      return;
    }
    const rows = await client.fetch<ListedDocument[]>(
      `*[_type in $types && (language == $source || !defined(language))]{_id, _type, title, name, language} | order(_updatedAt desc)[0...200]`,
      { types: config.schemaTypes, source: project.sourceLocale },
    );
    const listed = rows.map((row) => ({
      ...row,
      _id: publishedDocumentId(row._id),
      title: typeof row.title === "string" ? row.title : undefined,
      name: typeof row.name === "string" ? row.name : undefined,
    }));
    setDocuments(listed);
    if (auth && settings.projectId && listed.length > 0) {
      try {
        const { locales } = await fetchSanityLocaleStatusesFromApi({
          appUrl,
          auth,
          projectId: settings.projectId,
          sanityProjectId,
          dataset,
          documentIds: listed.map((row) => row._id),
        });
        const nextHl: Record<string, { source: string; byLocale: Record<string, string> }> = {};
        for (const row of listed) {
          nextHl[row._id] = parseLocaleStatusesForDocument(locales, row._id);
        }
        setDocumentHlById(nextHl);
      } catch {
        setDocumentHlById({});
      }
      try {
        const targetLocales =
          selectedLocale.trim().length > 0
            ? [selectedLocale]
            : (project?.targetLocales ?? []);
        const targets = await fetchDocumentLevelTargetsMap(
          client,
          listed.map((row) => row._id),
          targetLocales,
        );
        setTargetsByDoc(targets);
      } catch {
        setTargetsByDoc({});
      }
    } else {
      setDocumentHlById({});
      setTargetsByDoc({});
    }
  }, [
    appUrl,
    auth,
    client,
    config.schemaTypes,
    dataset,
    project,
    sanityProjectId,
    selectedLocale,
    settings.projectId,
  ]);

  const refreshLocaleStatuses = useCallback(async () => {
    if (!auth || !settings.projectId || documents.length === 0) {
      return;
    }
    try {
      const { locales } = await fetchSanityLocaleStatusesFromApi({
        appUrl,
        auth,
        projectId: settings.projectId,
        sanityProjectId,
        dataset,
        documentIds: documents.map((row) => row._id),
      });
      const nextHl: Record<string, { source: string; byLocale: Record<string, string> }> = {};
      for (const row of documents) {
        nextHl[row._id] = parseLocaleStatusesForDocument(locales, row._id);
      }
      setDocumentHlById(nextHl);
    } catch {
      // Keep the last known statuses when polling fails.
    }
  }, [appUrl, auth, dataset, documents, sanityProjectId, settings.projectId]);

  useEffect(() => {
    if (screen !== "workflow") {
      return;
    }
    void refreshDocuments().catch(() => {
      setError("Unable to list documents.");
    });
  }, [refreshDocuments, screen]);

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

  const selectedDocuments = documents.filter((document) =>
    selectedDocumentIds.includes(document._id),
  );

  const lookupLocaleStatus = useCallback(
    (byLocale: Record<string, string>, locale: string): string | undefined => {
      if (byLocale[locale]) {
        return byLocale[locale];
      }
      for (const [key, value] of Object.entries(byLocale)) {
        if (projectLocalesMatch(key, locale)) {
          return value;
        }
      }
      return undefined;
    },
    [],
  );

  const lookupTargetRef = useCallback(
    (docId: string, locale: string): string | undefined => {
      const published = publishedDocumentId(docId);
      const row = targetsByDoc[published];
      if (!row) {
        return undefined;
      }
      if (row[locale]) {
        return row[locale];
      }
      for (const [key, ref] of Object.entries(row)) {
        if (projectLocalesMatch(key, locale)) {
          return ref;
        }
      }
      return undefined;
    },
    [targetsByDoc],
  );

  const uploadEligibleCount = useMemo(() => {
    if (!selectedLocale) {
      return 0;
    }
    let count = 0;
    for (const listed of selectedDocuments) {
      if (lookupTargetRef(listed._id, selectedLocale)) {
        count += 1;
      }
    }
    return count;
  }, [lookupTargetRef, selectedDocuments, selectedLocale]);

  const applyEligibleCount = useMemo(() => {
    if (!selectedLocale) {
      return 0;
    }
    let count = 0;
    for (const listed of selectedDocuments) {
      const hl = documentHlById[listed._id];
      if (!hl) {
        continue;
      }
      if (hasHlTranslationForLocale(lookupLocaleStatus(hl.byLocale, selectedLocale))) {
        count += 1;
      }
    }
    return count;
  }, [documentHlById, lookupLocaleStatus, selectedDocuments, selectedLocale]);

  const localeTags = selectedLocale ? [selectedLocale] : [];

  const hasActiveTranslationJobs = useMemo(() => {
    if (!selectedLocale) {
      return false;
    }
    for (const document of documents) {
      const hl = documentHlById[document._id];
      if (!hl) {
        continue;
      }
      const status = lookupLocaleStatus(hl.byLocale, selectedLocale);
      if (status && isActiveTranslationJobStatus(status)) {
        return true;
      }
    }
    return false;
  }, [documentHlById, documents, lookupLocaleStatus, selectedLocale]);

  useEffect(() => {
    if (screen !== "workflow" || !hasActiveTranslationJobs) {
      return;
    }
    const timer = window.setInterval(() => {
      void refreshLocaleStatuses();
    }, SANITY_JOB_POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [hasActiveTranslationJobs, refreshLocaleStatuses, screen]);

  const runForSelected = useCallback(
    async (action: "upload" | "translate" | "apply") => {
      if (!auth || !settings.projectId || !project) {
        return;
      }
      if (selectedDocuments.length === 0) {
        setError("Select at least one document.");
        return;
      }
      if ((action === "upload" || action === "translate" || action === "apply") && !selectedLocale) {
        setError("Select a target locale.");
        return;
      }
      setBusy(action);
      setError(null);
      setStatus(null);
      const total =
        action === "upload"
          ? uploadEligibleCount
          : action === "apply"
            ? applyEligibleCount
            : selectedDocuments.length;
      if (total === 0) {
        setError(
          action === "upload"
            ? "No selected documents have a Sanity translation for the chosen locale."
            : "No Hyperlocalise translations found for the chosen locale on the selected documents.",
        );
        setBusy(null);
        return;
      }
      setBulkProgress({ action, current: 0, total });
      try {
        let processed = 0;
        let skipped = 0;
        for (const listed of selectedDocuments) {
          const raw = await client.getDocument(listed._id);
          const fallback = await client.getDocument(`drafts.${listed._id}`);
          const document = (isRecord(raw) ? raw : isRecord(fallback) ? fallback : null) as Record<
            string,
            unknown
          > | null;
          if (!document) {
            throw new Error(`Unable to load ${listed._id}.`);
          }
          const documentType = readString(document._type) ?? listed._type;
          const documentTitle = documentDisplayName(document, documentListLabel(listed));
          const segments = extractDocumentSegments({
            document,
            documentId: listed._id,
            documentType,
            i18nMode: "document-level",
            sourceLocale: project.sourceLocale,
            customBlockTypes: config.customBlockTypes,
          });
          const hl = documentHlById[listed._id] ?? { source: "missing", byLocale: {} };

          if (action === "upload") {
            const targetRef = lookupTargetRef(listed._id, selectedLocale);
            if (!targetRef) {
              skipped += 1;
              continue;
            }
            if (segments.length === 0) {
              throw new Error(`No translatable text found on ${documentListLabel(listed)}.`);
            }
            await uploadTargetLocaleFromSanity({
              appUrl,
              auth,
              client,
              projectId: settings.projectId,
              sanityProjectId,
              dataset,
              documentId: listed._id,
              documentType,
              documentTitle,
              locale: selectedLocale,
              i18nMode: "document-level",
              sourceDocument: document,
              sourceStatus: hl.source,
              sourceSegments: segments,
              customBlockTypes: config.customBlockTypes,
              targetRef,
            });
            processed += 1;
            setBulkProgress({ action, current: processed, total });
            continue;
          }

          if (action === "translate") {
            if (segments.length === 0) {
              throw new Error(`No translatable text found on ${documentListLabel(listed)}.`);
            }
            const sourceCollected = hl.source === "succeeded";
            await createSanityJob({
              appUrl,
              auth,
              projectId: settings.projectId,
              sanityProjectId,
              dataset,
              documentId: listed._id,
              documentType,
              documentTitle,
              sourceLocale: project.sourceLocale,
              targetLocales: [selectedLocale],
              segments: sourceCollected ? undefined : segments,
              generate: true,
            });
            processed += 1;
            setBulkProgress({ action, current: processed, total });
            continue;
          }

          if (!hasHlTranslationForLocale(lookupLocaleStatus(hl.byLocale, selectedLocale))) {
            skipped += 1;
            continue;
          }
          const sourcePath = buildSanityDocumentSourcePath({
            sanityProjectId,
            dataset,
            documentType,
            documentId: listed._id,
            documentTitle,
          });
          const plan = await fetchSanityApplyPlan({
            appUrl,
            auth,
            projectId: settings.projectId,
            sourcePath,
            document,
            i18nMode: "document",
            sourceSanityLocale: project.sourceLocale,
            targetSanityLocale: selectedLocale,
          });
          if (plan.missingKeys.length > 0) {
            skipped += 1;
            continue;
          }
          await createDocumentLevelTranslation({
            client,
            sourceDocumentId: listed._id,
            sourceLocale: project.sourceLocale,
            targetLocale: selectedLocale,
            documentType,
            translatedDocument: plan.document,
          });
          processed += 1;
          setBulkProgress({ action, current: processed, total });
        }
        await refreshDocuments();
        const verb =
          action === "upload"
            ? "Imported"
            : action === "translate"
              ? "Started translation for"
              : "Created";
        const skippedNote =
          skipped > 0 ? ` Skipped ${skipped} document${skipped === 1 ? "" : "s"}.` : "";
        setStatus(`${verb} ${processed} document${processed === 1 ? "" : "s"}.${skippedNote}`);
      } catch (runError) {
        setError(runError instanceof Error ? runError.message : "Bulk action failed.");
      } finally {
        setBusy(null);
        setBulkProgress(null);
      }
    },
    [
      appUrl,
      applyEligibleCount,
      auth,
      client,
      config.customBlockTypes,
      dataset,
      documentHlById,
      lookupLocaleStatus,
      lookupTargetRef,
      project,
      refreshDocuments,
      sanityProjectId,
      selectedDocuments,
      selectedLocale,
      settings.projectId,
      uploadEligibleCount,
    ],
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
              config.supportedLanguages,
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

  const bulkProgressLabel =
    bulkProgress?.action === "upload"
      ? "Uploading documents"
      : bulkProgress?.action === "translate"
        ? "Starting translations"
        : bulkProgress?.action === "apply"
          ? "Creating locale versions"
          : "Working";

  return (
    <WorkflowPanel>
      <WorkflowHeader
        title="Bulk translation"
        subtitle={
          sessionOrg
            ? `${sessionOrg.name} · document-level`
            : "Document-level"
        }
      />
      <WorkflowProjectLine
        projectName={workflowProjectLabel}
        disabled={busy !== null}
        onChangeProject={() => {
          setChoosingProject(true);
          setScreen("project");
        }}
        onSwitchAccount={switchAccount}
      />

      <WorkflowSection title="Translate to">
        <Select
          value={selectedLocale}
          onChange={(event) => setSelectedLocale(event.currentTarget.value)}
        >
          <option value="">Select locale</option>
          {localeOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      </WorkflowSection>

      <WorkflowSection title="Source documents">
        <Flex align="center" justify="space-between">
          <Text muted size={1}>
            {documents.length} document{documents.length === 1 ? "" : "s"}
          </Text>
          <Button
            mode="bleed"
            text={selectedDocumentIds.length === documents.length ? "Clear" : "Select all"}
            onClick={() => {
              setSelectedDocumentIds((current) =>
                current.length === documents.length
                  ? []
                  : documents.map((document) => document._id),
              );
            }}
          />
        </Flex>
        {documents.length === 0 ? (
          <Text muted size={1}>
            No source-language documents found for {config.schemaTypes.join(", ")}.
          </Text>
        ) : (
          <Stack gap={3}>
            {documents.map((document) => {
              const hl = documentHlById[document._id] ?? { source: "missing", byLocale: {} };
              const syncStatus = selectedLocale
                ? (lookupLocaleStatus(hl.byLocale, selectedLocale) ?? "missing")
                : hl.source;
              return (
                <Card key={document._id} padding={3} radius={2}>
                  <Flex align="flex-start" gap={3}>
                    <Checkbox
                      checked={selectedDocumentIds.includes(document._id)}
                      onChange={() => {
                        setSelectedDocumentIds((current) =>
                          current.includes(document._id)
                            ? current.filter((id) => id !== document._id)
                            : [...current, document._id],
                        );
                      }}
                    />
                    <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
                      <Stack gap={1}>
                        <Text size={1} weight="semibold">
                          {documentListLabel(document)}
                        </Text>
                        <Text muted size={1}>
                          {document._type}
                        </Text>
                      </Stack>
                      <TranslationProgressBar status={syncStatus} compact />
                      {selectedLocale ? (
                        <Text muted size={0}>
                          {selectedLocale}
                          {hl.source === "succeeded" ? " · source uploaded" : " · source not uploaded"}
                        </Text>
                      ) : null}
                    </Stack>
                  </Flex>
                </Card>
              );
            })}
          </Stack>
        )}
      </WorkflowSection>

      {bulkProgress ? (
        <BulkActionProgress
          label={bulkProgressLabel}
          current={bulkProgress.current}
          total={bulkProgress.total}
        />
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
                disabled={busy !== null || uploadEligibleCount === 0}
                loading={busy === "upload"}
                onClick={() => void runForSelected("upload")}
              />
            </Box>
            <Box flex={1} style={{ minWidth: 0 }}>
              <Button
                width="fill"
                text={createLocaleVersionLabel(localeTags)}
                disabled={busy !== null || applyEligibleCount === 0}
                loading={busy === "apply"}
                onClick={() => void runForSelected("apply")}
              />
            </Box>
          </Flex>
          <Button
            width="fill"
            text={actionLabel("Translate", localeTags)}
            icon={SparklesIcon}
            tone="primary"
            disabled={busy !== null || selectedDocuments.length === 0 || !selectedLocale}
            loading={busy === "translate"}
            onClick={() => void runForSelected("translate")}
          />
        </Stack>
      </Card>
    </WorkflowPanel>
  );
}

export function hyperlocaliseTool(config: HyperlocaliseBulkConfig | unknown) {
  const parsed = parseBulkConfig(config);
  return {
    name: "hyperlocalise",
    title: "Hyperlocalise",
    icon: HyperlocaliseIcon,
    component: parsed.ok
      ? function HyperlocaliseBulkTool() {
          return <HyperlocaliseBulkWorkflow config={parsed.data} />;
        }
      : function HyperlocaliseBulkConfigError() {
          return <ConfigErrorCard message={parsed.error} />;
        },
  };
}
