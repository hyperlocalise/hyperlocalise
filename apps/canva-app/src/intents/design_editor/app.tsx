import {
  Alert,
  Badge,
  Box,
  Button,
  FormField,
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
import { applyTranslationsToCurrentPage, extractCurrentPageContent } from "./design-content";
import { HyperlocaliseClientError, localizeDesign } from "./hyperlocalise-client";
import { loadSettings, parseTargetLocales, saveSettings } from "./settings";
import type { AppSettings, WorkflowStep } from "./types";

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

export const App = () => {
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings());
  const [workflowStep, setWorkflowStep] = useState<WorkflowStep>("idle");
  const [segmentCount, setSegmentCount] = useState(0);
  const [selectedLocale, setSelectedLocale] = useState("");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState(false);

  const targetLocales = useMemo(
    () => parseTargetLocales(settings.targetLocales),
    [settings.targetLocales],
  );
  const isBusy = workflowStep !== "idle" && workflowStep !== "done";
  const canLocalize =
    settings.projectId.trim().length > 0 &&
    settings.sourceLocale.trim().length > 0 &&
    targetLocales.length > 0 &&
    !isBusy;

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

  const localizeDesignFlow = async () => {
    setErrorMessage(null);
    setStatusMessage(null);
    setPreviewMode(false);

    try {
      setWorkflowStep("extracting");
      const extracted = await extractCurrentPageContent(settings.preserveFormatting);
      setSegmentCount(extracted.segments.length);

      if (extracted.segments.length === 0) {
        throw new Error("Add text to the current page before localizing.");
      }

      const { token } = await getDesignToken();

      setWorkflowStep("uploading");
      setWorkflowStep("translating");

      const response = await localizeDesign({
        projectId: settings.projectId.trim(),
        sourceLocale: settings.sourceLocale.trim(),
        targetLocales,
        designToken: token,
        segments: extracted.segments,
        preserveFormatting: settings.preserveFormatting,
      });

      setPreviewMode(response.mode === "preview");

      const localeToApply = selectedLocale || targetLocales[0] || "";
      const translations = localeToApply ? response.translationsByLocale[localeToApply] : undefined;
      if (!translations) {
        throw new Error(`No translated content returned for ${localeToApply}.`);
      }

      setWorkflowStep("applying");
      await applyTranslationsToCurrentPage(translations, settings.preserveFormatting);

      setWorkflowStep("done");
      setStatusMessage(
        response.mode === "preview"
          ? `Preview applied for ${localeToApply}. Configure HYPERLOCALISE_API_KEY on the backend to use live translation.`
          : `Localized ${extracted.segments.length} text segments and synced ${localeToApply} back to your design.`,
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
            Upload the current page as a JSON translation file, run localization in Hyperlocalise,
            then sync the translated text back into your design.
          </Text>
        </Rows>

        {previewMode ? (
          <Alert tone="info" title="Preview mode">
            <Text>
              The backend is running without a Hyperlocalise API key, so translations are simulated
              locally.
            </Text>
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
              <Title size="xsmall">Project settings</Title>
              <Text size="small" tone="secondary">
                Use a Hyperlocalise project ID and locales for this design.
              </Text>
            </Rows>

            <FormField
              label="Project ID"
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
                Extract text, upload a source file, translate, then write results back to Canva.
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
                </Text>
              </Rows>
            ) : (
              <Text size="small" tone="secondary">
                {segmentCount > 0
                  ? `${segmentCount} text segments ready on the current page.`
                  : "Text segments will be detected from the current page."}
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
