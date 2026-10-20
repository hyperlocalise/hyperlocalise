import { TranslateIcon } from "@sanity/icons/Translate";
import { Box, Button, Card, Checkbox, Flex, Stack, Text } from "@sanity/ui";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useClient, useDataset, useProjectId } from "sanity";

import { createDocumentLevelTranslation } from "./apply-studio-document";
import { ConnectScreen, ProjectScreen } from "./connect-screens";
import { parseBulkConfig, type HyperlocaliseBulkConfig } from "./config";
import { ConfigErrorCard } from "./config-error";
import { extractDocumentSegments, readDocumentTitle } from "./extract-document-segments";
import {
  collectSanityDocument,
  createSanityJob,
  fetchSanityApplyPlan,
  fetchSanityLocaleStatusesFromApi,
  fetchSanitySession,
  resourceAuthFromSettings,
  type SanitySessionProject,
} from "./hyperlocalise-client";
import { isRecord, readString } from "./json";
import { defaultSelectedLocale, translateToOptionsForProject } from "./locale-label";
import { fetchSanityIntegrationHealth, runSanityOAuthHandoff } from "./sanity-oauth";
import { buildSanityDocumentSourcePath } from "./source-path";
import { loadSettings, saveSettings, type PluginSettings } from "./settings";

type Screen = "connect" | "project" | "workflow";
type BusyAction = "connect" | "upload" | "translate" | "apply" | null;

type ListedDocument = {
  _id: string;
  _type: string;
  title?: string;
  language?: string;
};

function publishedDocumentId(documentId: string): string {
  return documentId.replace(/^drafts\./, "");
}

function documentLabel(document: ListedDocument): string {
  return document.title?.trim() || publishedDocumentId(document._id);
}

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
  const [selectedLocales, setSelectedLocales] = useState<string[]>([]);
  const [documentStatus, setDocumentStatus] = useState<Record<string, string>>({});

  const appUrl = settings.appUrl;
  const auth = useMemo(() => resourceAuthFromSettings(settings), [settings]);
  const project = useMemo(
    () => sessionProjects.find((entry) => entry.id === settings.projectId) ?? null,
    [sessionProjects, settings.projectId],
  );
  const localeOptions = translateToOptionsForProject(project, config.supportedLanguages);

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
        const selectedProject =
          session.projects.find((entry) => entry.id === settings.projectId) ?? null;
        setSelectedLocales((current) => {
          if (current.length > 0) {
            return current;
          }
          const fallback = defaultSelectedLocale(selectedProject, "", config.supportedLanguages);
          return fallback ? [fallback] : [];
        });
        setScreen(settings.projectId ? "workflow" : "project");
      } catch {
        setScreen("connect");
      }
    })();
  }, [appUrl, auth, config.supportedLanguages, settings.projectId]);

  const refreshDocuments = useCallback(async () => {
    if (!project) {
      setDocuments([]);
      return;
    }
    const rows = await client.fetch<ListedDocument[]>(
      `*[_type in $types && (language == $source || !defined(language))]{_id, _type, title, language} | order(_updatedAt desc)[0...200]`,
      { types: config.schemaTypes, source: project.sourceLocale },
    );
    const listed = rows.map((row) => ({
      ...row,
      _id: publishedDocumentId(row._id),
      title: typeof row.title === "string" ? row.title : undefined,
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
        const next: Record<string, string> = {};
        for (const locale of locales) {
          for (const entry of locale.documents) {
            next[entry.documentId] = entry.status;
          }
        }
        setDocumentStatus(next);
      } catch {
        setDocumentStatus({});
      }
    }
  }, [
    appUrl,
    auth,
    client,
    config.schemaTypes,
    dataset,
    project,
    sanityProjectId,
    settings.projectId,
  ]);

  useEffect(() => {
    if (screen !== "workflow") {
      return;
    }
    void refreshDocuments().catch(() => {
      setError("Unable to list documents.");
    });
  }, [refreshDocuments, screen]);

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
      setError(connectError instanceof Error ? connectError.message : "Connect failed.");
    } finally {
      setBusy(null);
    }
  }, [appUrl, dataset, sanityProjectId, settings]);

  const selectedDocuments = documents.filter((document) =>
    selectedDocumentIds.includes(document._id),
  );

  const runForSelected = useCallback(
    async (action: "upload" | "translate" | "apply") => {
      if (!auth || !settings.projectId || !project) {
        return;
      }
      if (selectedDocuments.length === 0) {
        setError("Select at least one document.");
        return;
      }
      if ((action === "translate" || action === "apply") && selectedLocales.length === 0) {
        setError("Select at least one target locale.");
        return;
      }
      setBusy(action);
      setError(null);
      setStatus(null);
      try {
        let processed = 0;
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
          const documentTitle = readDocumentTitle(document);
          const segments = extractDocumentSegments({
            document,
            documentId: listed._id,
            documentType,
            i18nMode: "document-level",
            sourceLocale: project.sourceLocale,
            customBlockTypes: config.customBlockTypes,
          });
          if (action === "upload" || action === "translate") {
            if (segments.length === 0) {
              throw new Error(`No translatable text found on ${documentLabel(listed)}.`);
            }
          }
          if (action === "upload") {
            await collectSanityDocument({
              appUrl,
              auth,
              projectId: settings.projectId,
              sanityProjectId,
              dataset,
              documentId: listed._id,
              documentType,
              documentTitle,
              segments,
            });
          }
          if (action === "translate") {
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
              targetLocales: selectedLocales,
              segments,
              generate: true,
            });
          }
          if (action === "apply") {
            const sourcePath = buildSanityDocumentSourcePath({
              sanityProjectId,
              dataset,
              documentType,
              documentId: listed._id,
              documentTitle,
            });
            for (const locale of selectedLocales) {
              const plan = await fetchSanityApplyPlan({
                appUrl,
                auth,
                projectId: settings.projectId,
                sourcePath,
                document,
                i18nMode: "document",
                sourceSanityLocale: project.sourceLocale,
                targetSanityLocale: locale,
              });
              if (plan.missingKeys.length > 0) {
                throw new Error(
                  `${plan.missingKeys.length} missing translations for ${documentLabel(listed)} (${locale}).`,
                );
              }
              await createDocumentLevelTranslation({
                client,
                sourceDocumentId: listed._id,
                sourceLocale: project.sourceLocale,
                targetLocale: locale,
                documentType,
                translatedDocument: plan.document,
              });
            }
          }
          processed += 1;
        }
        await refreshDocuments();
        const verb =
          action === "upload"
            ? "Uploaded"
            : action === "translate"
              ? "Started translation for"
              : "Applied";
        setStatus(`${verb} ${processed} document${processed === 1 ? "" : "s"}.`);
      } catch (runError) {
        setError(runError instanceof Error ? runError.message : "Bulk action failed.");
      } finally {
        setBusy(null);
      }
    },
    [
      appUrl,
      auth,
      client,
      config.customBlockTypes,
      dataset,
      project,
      refreshDocuments,
      sanityProjectId,
      selectedDocuments,
      selectedLocales,
      settings.projectId,
    ],
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
          if (projectId) {
            setScreen("workflow");
          }
        }}
      />
    );
  }

  return (
    <Box padding={4}>
      <Stack gap={4}>
        <Flex align="center" justify="space-between">
          <Stack gap={2}>
            <Text size={2} weight="semibold">
              Hyperlocalise bulk translation
            </Text>
            {sessionOrg ? (
              <Text muted size={1}>
                {sessionOrg.name} · document-level only
              </Text>
            ) : (
              <Text muted size={1}>
                Document-level only
              </Text>
            )}
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

        <Stack gap={2}>
          <Text size={1} weight="semibold">
            Target locales
          </Text>
          {localeOptions.map((option) => (
            <Flex key={option.value} align="center" gap={2}>
              <Checkbox
                checked={selectedLocales.includes(option.value)}
                onChange={() => {
                  setSelectedLocales((current) =>
                    current.includes(option.value)
                      ? current.filter((locale) => locale !== option.value)
                      : [...current, option.value],
                  );
                }}
              />
              <Text size={1}>{option.label}</Text>
            </Flex>
          ))}
        </Stack>

        <Stack gap={2}>
          <Flex align="center" justify="space-between">
            <Text size={1} weight="semibold">
              Source documents
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
            documents.map((document) => (
              <Flex key={document._id} align="center" gap={3}>
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
                <Stack gap={1}>
                  <Text size={1}>{documentLabel(document)}</Text>
                  <Text muted size={1}>
                    {document._type} · {document._id}
                    {documentStatus[document._id] ? ` · ${documentStatus[document._id]}` : ""}
                  </Text>
                </Stack>
              </Flex>
            ))
          )}
        </Stack>

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

        <Flex gap={3} wrap="wrap">
          <Button
            text="Upload"
            tone="primary"
            disabled={busy !== null}
            loading={busy === "upload"}
            onClick={() => void runForSelected("upload")}
          />
          <Button
            text="Translate"
            disabled={busy !== null}
            loading={busy === "translate"}
            onClick={() => void runForSelected("translate")}
          />
          <Button
            text="Apply"
            disabled={busy !== null}
            loading={busy === "apply"}
            onClick={() => void runForSelected("apply")}
          />
        </Flex>
      </Stack>
    </Box>
  );
}

export function hyperlocaliseTool(config: HyperlocaliseBulkConfig | unknown) {
  const parsed = parseBulkConfig(config);
  return {
    name: "hyperlocalise",
    title: "Hyperlocalise",
    icon: TranslateIcon,
    component: parsed.ok
      ? function HyperlocaliseBulkTool() {
          return <HyperlocaliseBulkWorkflow config={parsed.data} />;
        }
      : function HyperlocaliseBulkConfigError() {
          return <ConfigErrorCard message={parsed.error} />;
        },
  };
}
