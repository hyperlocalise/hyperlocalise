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
  Box,
  Button,
  CheckboxGroup,
  FormField,
  LinkButton,
  ProgressBar,
  Rows,
  Select,
  Switch,
  Text,
  TextInput,
  Title,
} from "@canva/app-ui-kit";
import { getDesignMetadata, getDesignToken } from "@canva/design";
import { useEffect, useMemo, useState } from "react";

import * as styles from "../../../styles/components.css";
import { applyTranslationsToDesign, extractDesignContent, listDesignPages } from "./design-content";
import {
  CANVA_JOB_POLL_INTERVAL_MS,
  type CanvaResourceAuth,
  collectCanvaDesign,
  deauthorizeHyperlocalise,
  fetchCanvaLocaleStatuses,
  fetchCanvaSession,
  generateCanvaLocaleJob,
  getHyperlocaliseAccessToken,
  HyperlocaliseClientError,
  pullCanvaLocalePages,
  requestHyperlocaliseAuthorization,
} from "./hyperlocalise-client";
import {
  loadSettings,
  parseSelectedPageValues,
  parseTargetLocales,
  projectLocalesToSettings,
  saveSettings,
  selectedPageValues,
} from "./settings";
import type {
  AppSettings,
  CanvaLocaleStatus,
  CanvaSession,
  CollectedCanvaPage,
  DesignPageInfo,
  DesignSegment,
} from "./types";

type BusyAction = "connect" | "collect" | "generate" | "apply" | null;

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

function pageDescription(page: DesignPageInfo): string {
  if (!page.editable) {
    return page.locked ? "Locked page" : "Unsupported page type";
  }

  return "Editable page";
}

function localeWordCountLabel(entry: Pick<CanvaLocaleStatus, "translatedWords" | "wordCount">) {
  const wordCount = entry.wordCount ?? 0;
  const translatedWords = entry.translatedWords ?? 0;
  if (wordCount <= 0) {
    return "No collected words";
  }
  return `${translatedWords} of ${wordCount} words`;
}

function localeProgressValue(entry: CanvaLocaleStatus): number | "indeterminate" {
  if (entry.status === "queued" || entry.status === "running") {
    return "indeterminate";
  }
  return entry.percent;
}

function jobStatusLabel(status: CanvaLocaleStatus["status"]) {
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
    case "idle":
      return "Not started";
  }
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
  const [localeStatuses, setLocaleStatuses] = useState<CanvaLocaleStatus[]>([]);
  const [collectedPages, setCollectedPages] = useState<CollectedCanvaPage[]>([]);
  const [applyLocale, setApplyLocale] = useState<string | null>(null);
  const [applySourcePage, setApplySourcePage] = useState("");
  const [applyDestinationPage, setApplyDestinationPage] = useState("");
  const [busy, setBusy] = useState<BusyAction>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [oauthReady, setOauthReady] = useState(false);
  const [projectTargetOptions, setProjectTargetOptions] = useState<string[]>(() =>
    parseTargetLocales(settings.targetLocales),
  );

  const localeRows = useMemo(() => {
    if (localeStatuses.length > 0) {
      return localeStatuses;
    }
    return projectTargetOptions.map((locale) => ({
      locale,
      status: "idle" as const,
      translated: 0,
      total: 0,
      translatedWords: 0,
      wordCount: 0,
      percent: 0,
      canAdd: false,
      pages: [],
    }));
  }, [localeStatuses, projectTargetOptions]);
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
  const canCollect = connected && selectedPageIndices.length > 0 && busy == null;
  const applyLocaleStatus = localeStatuses.find((entry) => entry.locale === applyLocale);
  const readyApplyPages = (applyLocaleStatus?.pages ?? []).filter(
    (page) => page.status === "succeeded" || page.status === "waiting_for_review",
  );

  const persistSettings = (next: AppSettings) => {
    setSettings(next);
    saveSettings(next);
  };

  const applySessionProject = (session: CanvaSession, next: AppSettings): AppSettings => {
    const locales = projectLocalesToSettings(session.project);
    setProjectTargetOptions(session.project.targetLocales);
    return {
      ...next,
      organizationSlug: session.organization.slug ?? "",
      organizationName: session.organization.name,
      projectName: session.project.name,
      ...locales,
    };
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
    setLocaleStatuses([]);
    setCollectedPages([]);
    setApplyLocale(null);
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

        persistSettings(applySessionProject(session, settings));

        const { token } = await getDesignToken();
        const statuses = await fetchCanvaLocaleStatuses({
          auth: await resolveAuth(),
          designToken: token,
        });
        if (!cancelled) {
          setLocaleStatuses(statuses.locales);
          setCollectedPages(statuses.pages);
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
    const inFlight = localeStatuses.some(
      (entry) => entry.status === "queued" || entry.status === "running",
    );
    if (!inFlight || !connected) {
      return;
    }

    let cancelled = false;

    async function refreshLocales() {
      try {
        const { token } = await getDesignToken();
        const statuses = await fetchCanvaLocaleStatuses({
          auth: await resolveAuth(),
          designToken: token,
        });
        if (cancelled) {
          return;
        }
        setLocaleStatuses(statuses.locales);
        setCollectedPages(statuses.pages);
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(error instanceof Error ? error.message : "Unable to check job status.");
        }
      }
    }

    const interval = window.setInterval(() => {
      void refreshLocales();
    }, CANVA_JOB_POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [connected, localeStatuses, oauthReady, legacyConnectionToken]);

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
      persistSettings(
        applySessionProject(session, {
          ...settings,
          connectionToken: "",
        }),
      );
      setStatusMessage("Connected.");
    });

  const handleConnectToken = () =>
    runAction("connect", async () => {
      const connectionToken = tokenDraft.trim();
      if (!connectionToken) {
        throw new Error("Paste a connection token from Hyperlocalise.");
      }
      const session = await fetchCanvaSession(connectionToken);
      persistSettings(
        applySessionProject(session, {
          ...settings,
          connectionToken,
        }),
      );
      setTokenDraft("");
      setStatusMessage("Connected.");
    });

  const refreshLocaleStatuses = async () => {
    const { token } = await getDesignToken();
    const statuses = await fetchCanvaLocaleStatuses({
      auth: await resolveAuth(),
      designToken: token,
    });
    setLocaleStatuses(statuses.locales);
    setCollectedPages(statuses.pages);
    return statuses;
  };

  const collectPages = (pageIndices: number[]) =>
    runAction("collect", async () => {
      if (pageIndices.length === 0) {
        throw new Error("Select at least one editable page.");
      }
      const extracted = await extractDesignContent(pageIndices, settings.preserveFormatting);
      setSegments(extracted.segments);
      if (extracted.segments.length === 0) {
        throw new Error("Add text to the selected pages before collecting.");
      }
      const [{ token }, metadata] = await Promise.all([getDesignToken(), getDesignMetadata()]);
      const collected = await collectCanvaDesign({
        auth: await resolveAuth(),
        designToken: token,
        designTitle: metadata.title,
        segments: extracted.segments,
      });
      setCollectedPages(collected.pages);
      await refreshLocaleStatuses();
      setStatusMessage(
        `Collected ${collected.pages.length} page file${collected.pages.length === 1 ? "" : "s"} in Hyperlocalise.`,
      );
    });

  const handleCollect = () => collectPages(selectedPageIndices);

  const handleGenerateLocale = (locale: string) =>
    runAction("generate", async () => {
      const { token } = await getDesignToken();
      await generateCanvaLocaleJob({
        auth: await resolveAuth(),
        designToken: token,
        locale,
      });
      await refreshLocaleStatuses();
      setStatusMessage(`Generating ${localeLabel(locale)}…`);
    });

  const openApplySheet = (locale: string) => {
    const status = localeStatuses.find((entry) => entry.locale === locale);
    const readyPages = (status?.pages ?? []).filter(
      (page) => page.status === "succeeded" || page.status === "waiting_for_review",
    );
    setApplyLocale(locale);
    setApplySourcePage(String(readyPages[0]?.pageIndex ?? ""));
    setApplyDestinationPage(String(selectedPageIndices[0] ?? editablePages[0]?.index ?? ""));
  };

  const handleApplyOne = () =>
    runAction("apply", async () => {
      if (!applyLocale) {
        throw new Error("Choose a language to add.");
      }
      const sourcePageIndex = Number.parseInt(applySourcePage, 10);
      const destinationPageIndex = Number.parseInt(applyDestinationPage, 10);
      if (!Number.isInteger(sourcePageIndex) || !Number.isInteger(destinationPageIndex)) {
        throw new Error("Choose a translated page and a Canva page.");
      }
      const { token } = await getDesignToken();
      const pulled = await pullCanvaLocalePages({
        auth: await resolveAuth(),
        designToken: token,
        locale: applyLocale,
        pageIndex: sourcePageIndex,
      });
      const page = pulled.pages[0];
      if (!page) {
        throw new Error("No translations for that page.");
      }
      await applyTranslationsToDesign(
        page.translations,
        [destinationPageIndex],
        settings.preserveFormatting,
      );
      setApplyLocale(null);
      setStatusMessage(
        `Applied ${Object.keys(page.translations).length} segments (${localeLabel(applyLocale)}) to page ${destinationPageIndex + 1}.`,
      );
    });

  const handleApplyAll = () =>
    runAction("apply", async () => {
      if (!applyLocale) {
        throw new Error("Choose a language to add.");
      }
      const { token } = await getDesignToken();
      const pulled = await pullCanvaLocalePages({
        auth: await resolveAuth(),
        designToken: token,
        locale: applyLocale,
      });
      if (pulled.pages.length === 0) {
        throw new Error("No translations to apply.");
      }
      for (const page of pulled.pages) {
        await applyTranslationsToDesign(
          page.translations,
          [page.pageIndex],
          settings.preserveFormatting,
        );
      }
      setApplyLocale(null);
      setStatusMessage(`Applied ${localeLabel(applyLocale)} to ${pulled.pages.length} pages.`);
    });

  return (
    <div className={styles.scrollContainer}>
      <Rows spacing="2u">
        <Rows spacing="1u">
          <Title size="small">Hyperlocalise for Canva</Title>
          <Text>
            Connect your workspace, collect page text into Hyperlocalise, generate each language,
            then add translations to this design.
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
                  <Title size="xsmall">Collect texts</Title>
                  <Text size="small" tone="secondary">
                    Select pages to upload as JSON files. Source language is{" "}
                    {settings.sourceLocale
                      ? localeLabel(settings.sourceLocale)
                      : "the project source"}
                    .
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
                <Button
                  variant="primary"
                  stretch
                  onClick={handleCollect}
                  disabled={!canCollect}
                  loading={busy === "collect"}
                >
                  Collect texts
                </Button>
                <Text size="small" tone="secondary">
                  {collectedPages.length > 0
                    ? `${collectedPages.length} page file${collectedPages.length === 1 ? "" : "s"} in Hyperlocalise.`
                    : segments.length > 0
                      ? `${segments.length} extracted segment${segments.length === 1 ? "" : "s"}.`
                      : "Collect the selected pages into Hyperlocalise."}
                </Text>
              </Rows>
            </Box>

            <Box padding="2u" className={styles.panel}>
              <Rows spacing="1.5u">
                <Rows spacing="0.5u">
                  <Title size="xsmall">Add translations to design</Title>
                  <Text size="small" tone="secondary">
                    Languages come from the Hyperlocalise project.
                  </Text>
                </Rows>
                {projectTargetOptions.length === 0 ? (
                  <Text size="small" tone="secondary">
                    Connect to load project languages.
                  </Text>
                ) : (
                  localeRows.map((entry) => (
                    <Rows key={entry.locale} spacing="0.5u">
                      <Text>{localeLabel(entry.locale)}</Text>
                      <ProgressBar
                        value={localeProgressValue(entry)}
                        ariaLabel={`${localeLabel(entry.locale)} progress`}
                      />
                      <Text size="small" tone="secondary">
                        {entry.percent}% · {localeWordCountLabel(entry)} ·{" "}
                        {jobStatusLabel(entry.status)}
                      </Text>
                      {entry.status === "queued" || entry.status === "running" ? null : entry.canAdd ? (
                        <Button
                          variant="secondary"
                          stretch
                          onClick={() => openApplySheet(entry.locale)}
                          disabled={busy != null}
                        >
                          Add to design
                        </Button>
                      ) : (
                        <Button
                          variant="secondary"
                          stretch
                          onClick={() => handleGenerateLocale(entry.locale)}
                          disabled={busy != null || collectedPages.length === 0}
                          loading={busy === "generate"}
                        >
                          Generate translation
                        </Button>
                      )}
                    </Rows>
                  ))
                )}
              </Rows>
            </Box>

            {applyLocale ? (
              <Box padding="2u" className={styles.panel}>
                <Rows spacing="1.5u">
                  <Title size="xsmall">{localeLabel(applyLocale)}</Title>
                  <Text size="small" tone="secondary">
                    Select the translated page to apply, and the Canva page that should receive it.
                  </Text>
                  <FormField
                    label="Translated page"
                    value={applySourcePage}
                    control={(props) => (
                      <Select
                        {...props}
                        stretch
                        options={readyApplyPages.map((page) => ({
                          value: String(page.pageIndex),
                          label:
                            designPages.find((designPage) => designPage.index === page.pageIndex)
                              ?.label ?? `Page ${page.pageIndex + 1}`,
                        }))}
                        onChange={setApplySourcePage}
                      />
                    )}
                  />
                  <FormField
                    label="Current page"
                    value={applyDestinationPage}
                    control={(props) => (
                      <Select
                        {...props}
                        stretch
                        options={editablePages.map((page) => ({
                          value: String(page.index),
                          label: page.label,
                        }))}
                        onChange={setApplyDestinationPage}
                      />
                    )}
                  />
                  <Button
                    variant="primary"
                    stretch
                    onClick={handleApplyOne}
                    disabled={busy != null || readyApplyPages.length === 0}
                    loading={busy === "apply"}
                  >
                    Apply to this page
                  </Button>
                  <Button
                    variant="secondary"
                    stretch
                    onClick={handleApplyAll}
                    disabled={busy != null || readyApplyPages.length === 0}
                  >
                    Apply all
                  </Button>
                  <Button variant="secondary" stretch onClick={() => setApplyLocale(null)}>
                    Cancel
                  </Button>
                </Rows>
              </Box>
            ) : null}
          </>
        ) : null}
      </Rows>
    </div>
  );
};
