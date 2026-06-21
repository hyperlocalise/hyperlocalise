import {
  Alert,
  Badge,
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
import { getDesignToken } from "@canva/design";
import { useEffect, useMemo, useState } from "react";

import * as styles from "../../../styles/components.css";
import { applyTranslationsToDesign, extractDesignContent, listDesignPages } from "./design-content";
import { HyperlocaliseClientError, localizeDesign } from "./hyperlocalise-client";
import {
  loadSettings,
  parseSelectedPageValues,
  parseTargetLocales,
  saveSettings,
  selectedPageValues,
} from "./settings";
import type { AppSettings, DesignPageInfo, WorkflowStep } from "./types";

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

const WORKFLOW_STEPS: Array<{ id: WorkflowStep; label: string }> = [
  { id: "extracting", label: "Extract text" },
  { id: "uploading", label: "Upload file" },
  { id: "translating", label: "Translate" },
  { id: "applying", label: "Sync to design" },
];

function workflowProgress(step: WorkflowStep): number {
  switch (step) {
    case "extracting":
      return 0.2;
    case "uploading":
      return 0.45;
    case "translating":
      return 0.7;
    case "applying":
      return 0.9;
    case "done":
      return 1;
    default:
      return 0;
  }
}

function activeStepLabel(step: WorkflowStep): string {
  return WORKFLOW_STEPS.find((workflowStep) => workflowStep.id === step)?.label ?? "Ready";
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

export const App = () => {
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings());
  const [designPages, setDesignPages] = useState<DesignPageInfo[]>([]);
  const [pagesLoading, setPagesLoading] = useState(true);
  const [pagesError, setPagesError] = useState<string | null>(null);
  const [workflowStep, setWorkflowStep] = useState<WorkflowStep>("idle");
  const [segmentCount, setSegmentCount] = useState(0);
  const [selectedLocale, setSelectedLocale] = useState("");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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
  const isBusy = workflowStep !== "idle" && workflowStep !== "done";
  const canLocalize =
    settings.connectionToken.trim().length > 0 &&
    settings.sourceLocale.trim().length > 0 &&
    targetLocales.length > 0 &&
    selectedPageIndices.length > 0 &&
    !pagesLoading &&
    !isBusy;

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

  const updateSettings = (patch: Partial<AppSettings>) => {
    setSettings((current) => {
      const next = { ...current, ...patch };
      saveSettings(next);
      return next;
    });
  };

  const selectAllEditablePages = () => {
    updateSettings({ selectedPageIndices: defaultSelectedPages(designPages) });
  };

  const clearPageSelection = () => {
    updateSettings({ selectedPageIndices: [] });
  };

  const localizeDesignFlow = async () => {
    setErrorMessage(null);
    setStatusMessage(null);

    try {
      setWorkflowStep("extracting");
      const extracted = await extractDesignContent(
        selectedPageIndices,
        settings.preserveFormatting,
      );
      setSegmentCount(extracted.segments.length);

      if (extracted.segments.length === 0) {
        throw new Error("Add text to the selected pages before localizing.");
      }

      const { token } = await getDesignToken();

      setWorkflowStep("uploading");
      setWorkflowStep("translating");

      const response = await localizeDesign({
        connectionToken: settings.connectionToken.trim(),
        projectId: settings.projectId.trim() || undefined,
        sourceLocale: settings.sourceLocale.trim(),
        targetLocales,
        designToken: token,
        segments: extracted.segments,
        preserveFormatting: settings.preserveFormatting,
      });

      const localeToApply = selectedLocale || targetLocales[0] || "";
      const translations = localeToApply ? response.translationsByLocale[localeToApply] : undefined;
      if (!translations) {
        throw new Error(`No translated content returned for ${localeToApply}.`);
      }

      setWorkflowStep("applying");
      await applyTranslationsToDesign(
        translations,
        selectedPageIndices,
        settings.preserveFormatting,
      );

      setWorkflowStep("done");
      setStatusMessage(
        `Localized ${extracted.segments.length} text segments across ${selectedPageIndices.length} page(s) and synced ${localeToApply} back to your design.`,
      );
    } catch (error) {
      setWorkflowStep("idle");
      if (error instanceof HyperlocaliseClientError) {
        setErrorMessage(error.message);
        return;
      }

      setErrorMessage(error instanceof Error ? error.message : "Localization failed.");
    }
  };

  return (
    <div className={styles.scrollContainer}>
      <Rows spacing="2u">
        <Rows spacing="1u">
          <Title size="small">Hyperlocalise for Canva</Title>
          <Text>
            Upload selected pages from your design as a JSON translation file, run localization in
            Hyperlocalise, then sync the translated text back into Canva.
          </Text>
        </Rows>

        {pagesError ? (
          <Alert tone="warn" title="Pages unavailable">
            <Text>{pagesError}</Text>
          </Alert>
        ) : null}

        {errorMessage ? (
          <Alert tone="critical" title="Localization failed">
            <Text>{errorMessage}</Text>
          </Alert>
        ) : null}

        {statusMessage ? (
          <Alert tone="positive" title="Design updated">
            <Text>{statusMessage}</Text>
          </Alert>
        ) : null}

        <Box padding="2u" className={styles.panel}>
          <Rows spacing="1.5u">
            <Rows spacing="0.5u">
              <Title size="xsmall">Pages to localize</Title>
              <Text size="small" tone="secondary">
                Choose which pages to include in the upload and sync workflow.
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
                    {selectedPageIndices.length} of {editablePages.length} editable pages selected
                  </Text>
                  <div className={styles.pageActions}>
                    <LinkButton onClick={selectAllEditablePages}>Select all</LinkButton>
                    <LinkButton onClick={clearPageSelection}>Clear</LinkButton>
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
              <Title size="xsmall">Connection settings</Title>
              <Text size="small" tone="secondary">
                Paste the connection token from your Hyperlocalise workspace Canva integration.
              </Text>
            </Rows>

            <FormField
              label="Connection token"
              value={settings.connectionToken}
              control={(props) => (
                <TextInput
                  {...props}
                  placeholder="hl_canva_..."
                  onChange={(value) => updateSettings({ connectionToken: value })}
                />
              )}
            />

            <FormField
              label="Project ID override"
              description="Optional. Leave blank to use the project configured on the connection."
              value={settings.projectId}
              control={(props) => (
                <TextInput
                  {...props}
                  placeholder="project_..."
                  onChange={(value) => updateSettings({ projectId: value })}
                />
              )}
            />

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
              <Title size="xsmall">Workflow</Title>
              <Text size="small" tone="secondary">
                Extract text from selected pages, upload a source file, translate, then write
                results back to Canva.
              </Text>
            </Rows>

            <Rows spacing="1u">
              {WORKFLOW_STEPS.map((step) => {
                const isComplete =
                  workflowStep === "done" ||
                  WORKFLOW_STEPS.findIndex((item) => item.id === workflowStep) >
                    WORKFLOW_STEPS.findIndex((item) => item.id === step.id);
                const isActive = workflowStep === step.id;

                return (
                  <div key={step.id} className={styles.workflowStep}>
                    <Badge
                      text={isComplete ? "Done" : isActive ? "Active" : "Pending"}
                      tone={isComplete ? "positive" : isActive ? "info" : "contrast"}
                    />
                    <Text size="small">{step.label}</Text>
                  </div>
                );
              })}
            </Rows>

            {isBusy ? (
              <Rows spacing="1u">
                <ProgressBar value={workflowProgress(workflowStep)} />
                <Text size="small" tone="secondary">
                  {activeStepLabel(workflowStep)}
                  {segmentCount > 0 ? ` · ${segmentCount} segments` : ""}
                  {selectedPageIndices.length > 0 ? ` · ${selectedPageIndices.length} pages` : ""}
                </Text>
              </Rows>
            ) : (
              <Text size="small" tone="secondary">
                {selectedPageIndices.length > 0
                  ? `${selectedPageIndices.length} page(s) selected for localization.`
                  : "Select at least one editable page to continue."}
              </Text>
            )}

            <Button
              variant="primary"
              stretch
              onClick={localizeDesignFlow}
              disabled={!canLocalize}
              loading={isBusy}
            >
              Localize and sync design
            </Button>
          </Rows>
        </Box>
      </Rows>
    </div>
  );
};
