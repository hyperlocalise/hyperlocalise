"use client";

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
import { observer } from "mobx-react-lite";
import { useIntl } from "react-intl";

import { useAppShellStore } from "@/components/app-shell/store/app-shell-store-context";
import { QaSegmentedControl } from "@/components/qa/qa-filter";
import { qaCheckLabel } from "@/components/qa/qa-findings-table";
import { QaNotice } from "@/components/qa/qa-status";
import { qaMessages as m } from "@/components/qa/qa.messages";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldContent, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { DEFAULT_QA_POLICY, resolveQaPolicy, type QaCheckPolicy } from "@/lib/qa/qa-policy";
import type { ProjectQaSettingsUpdate } from "@/lib/qa/qa-report-client";
import {
  defaultMqmSeverity,
  QA_SCORE_THRESHOLD_MAX,
  QA_SCORE_THRESHOLD_MIN,
  resolveQaScoringPolicy,
  type MqmSeverity,
  type QaScoringPolicy,
} from "@/lib/qa/qa-scoring";
import { translationQaCheckTypes } from "@/lib/qa/types";

import { qaProjectMessages as messages } from "../qa-project.messages";
import { useQaProjectUiStore } from "../store/qa-project-store-context";
import type { QaCadence } from "../store/qa-project-ui-store";

const CHECK_LEVEL_OFF = "off";

export type QaProjectSettings = {
  cadence: QaCadence;
  checks: QaCheckPolicy;
  /** Missing until go-svc returns scoring; read as scoring off. */
  scoring?: QaScoringPolicy;
  canManageSchedule: boolean;
};

/** Schedule, per-check rules and quality scoring, saved together so nothing applies half-way. */
export const QaProjectSettingsDialog = observer(function QaProjectSettingsDialog({
  settings,
  isSaving,
  isError,
  onSave,
}: {
  settings: QaProjectSettings | undefined;
  isSaving: boolean;
  isError: boolean;
  onSave: (json: ProjectQaSettingsUpdate) => void;
}) {
  const intl = useIntl();
  const store = useQaProjectUiStore();
  const { workspaceFeatureFlags } = useAppShellStore();
  const knowledgeEnabled = workspaceFeatureFlags.knowledge;
  const savedPolicy = settings?.checks ?? DEFAULT_QA_POLICY;
  const policy = resolveQaPolicy(store.draftPolicy ?? savedPolicy);
  const cadence = store.draftCadence ?? settings?.cadence ?? "off";
  const scoring = resolveQaScoringPolicy(store.draftScoring ?? settings?.scoring);
  const canManage = Boolean(settings?.canManageSchedule);
  const disabled = !canManage || isSaving;
  const visibleCheckTypes = knowledgeEnabled
    ? translationQaCheckTypes
    : translationQaCheckTypes.filter((check) => check !== "guideline");
  const levelOptions = [
    { value: CHECK_LEVEL_OFF, label: intl.formatMessage(m.checkOff) },
    { value: "warning", label: intl.formatMessage(m.warning) },
    { value: "error", label: intl.formatMessage(m.error) },
  ];
  const penaltyOptions: { value: MqmSeverity; label: string }[] = [
    { value: "minor", label: intl.formatMessage(messages.penaltyMinor) },
    { value: "major", label: intl.formatMessage(messages.penaltyMajor) },
    { value: "critical", label: intl.formatMessage(messages.penaltyCritical) },
  ];

  return (
    <Dialog
      open={store.settingsOpen}
      onOpenChange={(open) => (open ? store.openSettings() : store.closeSettings())}
    >
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{intl.formatMessage(m.settings)}</DialogTitle>
          <DialogDescription>{intl.formatMessage(messages.settingsDescription)}</DialogDescription>
        </DialogHeader>
        <div className="-mx-6 flex max-h-[60vh] flex-col gap-5 overflow-y-auto px-6">
          {!canManage ? (
            <p className="text-sm text-muted-foreground">
              {intl.formatMessage(messages.settingsReadOnly)}
            </p>
          ) : null}
          <Field orientation="horizontal">
            <FieldContent>
              <FieldLabel htmlFor="qa-daily">{intl.formatMessage(messages.schedule)}</FieldLabel>
              <FieldDescription>{intl.formatMessage(messages.scheduleHelp)}</FieldDescription>
            </FieldContent>
            <Switch
              id="qa-daily"
              checked={cadence === "daily"}
              disabled={disabled}
              onCheckedChange={(checked) => store.setDraftCadence(checked ? "daily" : "off")}
            />
          </Field>
          <div className="flex flex-col gap-3">
            <Field orientation="horizontal">
              <FieldContent>
                <FieldLabel htmlFor="qa-scoring">
                  {intl.formatMessage(messages.qualityScore)}
                </FieldLabel>
                <FieldDescription>{intl.formatMessage(messages.qualityScoreHelp)}</FieldDescription>
              </FieldContent>
              <Switch
                id="qa-scoring"
                checked={scoring.enabled}
                disabled={disabled}
                onCheckedChange={(checked) => store.updateScoring(scoring, { enabled: checked })}
              />
            </Field>
            {scoring.enabled ? (
              <Field orientation="horizontal">
                <FieldContent>
                  <FieldLabel htmlFor="qa-pass-threshold">
                    {intl.formatMessage(messages.passThreshold)}
                  </FieldLabel>
                  <FieldDescription>
                    {intl.formatMessage(messages.passThresholdHelp)}
                  </FieldDescription>
                </FieldContent>
                <Input
                  id="qa-pass-threshold"
                  type="number"
                  inputMode="decimal"
                  className="w-24"
                  min={QA_SCORE_THRESHOLD_MIN}
                  max={QA_SCORE_THRESHOLD_MAX}
                  step={0.5}
                  disabled={disabled}
                  value={scoring.passThreshold}
                  onChange={(event) => {
                    const value = Number(event.target.value);
                    if (!Number.isFinite(value)) return;
                    store.updateScoring(scoring, {
                      passThreshold: Math.min(
                        QA_SCORE_THRESHOLD_MAX,
                        Math.max(QA_SCORE_THRESHOLD_MIN, value),
                      ),
                    });
                  }}
                />
              </Field>
            ) : null}
          </div>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <h3 className="text-sm font-medium">{intl.formatMessage(m.coverage)}</h3>
              <p className="text-xs text-muted-foreground">{intl.formatMessage(m.coverageHelp)}</p>
              <p className="text-xs text-muted-foreground">
                {intl.formatMessage(m.warningBehavior)}
              </p>
              <p className="text-xs text-muted-foreground">{intl.formatMessage(m.errorBehavior)}</p>
            </div>
            <div className="flex flex-col divide-y divide-border">
              {visibleCheckTypes.map((check) => {
                const label = qaCheckLabel(check, intl);
                const defaultPenalty = defaultMqmSeverity(policy[check].severity);
                const penalty = scoring.penalties[check] ?? defaultPenalty;
                return (
                  <div
                    key={check}
                    className="flex flex-wrap items-center justify-between gap-3 py-3"
                  >
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <p className="text-sm font-medium">{label}</p>
                      {check === "guideline" ? (
                        <p className="text-xs text-muted-foreground">
                          {intl.formatMessage(m.guidelineCheckHelp)}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <QaSegmentedControl
                        label={label}
                        hideLabel
                        disabled={disabled}
                        value={policy[check].enabled ? policy[check].severity : CHECK_LEVEL_OFF}
                        options={levelOptions}
                        onChange={(level) =>
                          store.updateRule(
                            policy,
                            check,
                            level === CHECK_LEVEL_OFF
                              ? { enabled: false }
                              : { enabled: true, severity: level as "error" | "warning" },
                          )
                        }
                      />
                      {scoring.enabled && policy[check].enabled ? (
                        <QaSegmentedControl
                          label={intl.formatMessage(messages.penaltyLabel, { check: label })}
                          hideLabel
                          disabled={disabled}
                          value={penalty}
                          options={penaltyOptions}
                          onChange={(value) =>
                            store.updatePenalty(
                              scoring,
                              check,
                              value === defaultPenalty ? null : (value as MqmSeverity),
                            )
                          }
                        />
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          {isError ? <QaNotice message={intl.formatMessage(m.policyError)} /> : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => store.closeSettings()}>
            {intl.formatMessage(m.cancel)}
          </Button>
          {canManage ? (
            <Button
              disabled={!store.hasSettingsDraft || isSaving}
              onClick={() =>
                onSave({
                  cadence: store.draftCadence ?? undefined,
                  checks: store.draftPolicy ? policy : undefined,
                  scoring: store.draftScoring ? scoring : undefined,
                })
              }
            >
              {intl.formatMessage(messages.saveSettings)}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
});
