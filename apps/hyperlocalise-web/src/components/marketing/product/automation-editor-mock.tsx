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
import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowRightIcon, CheckCircle2Icon, GitBranchIcon } from "lucide-react";
import { RefreshIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { FormattedMessage } from "react-intl";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/primitives/cn";

import { EDITOR_STEPS, MOCK_AUTOMATION } from "./automation-editor-mock.data";
import { automationEditorMockMessages } from "./automation-editor-mock.messages";

function StepIndicator({ current }: { current: number }) {
  return (
    <div className="flex w-full items-center">
      {EDITOR_STEPS.map((step, i) => {
        const isDone = i < current;
        const isActive = i === current;
        return (
          <div key={step.id} className="flex flex-1 items-center">
            <div className="flex flex-col items-center gap-1.5">
              <div
                className={cn(
                  "flex size-6 items-center justify-center rounded-full border text-[11px] font-semibold transition-all duration-300",
                  isDone && "border-primary bg-primary text-white",
                  isActive && "border-primary bg-primary text-white",
                  !isDone && !isActive && "border-border text-muted-foreground/40",
                )}
              >
                {i + 1}
              </div>
              <span
                className={cn(
                  "hidden text-[10px] font-medium sm:block transition-colors duration-300",
                  isActive && "text-primary",
                  isDone && "text-primary",
                  !isDone && !isActive && "text-muted-foreground/40",
                )}
              >
                {step.label}
              </span>
            </div>
            {i < EDITOR_STEPS.length - 1 && (
              <div
                className={cn(
                  "mx-1 h-px flex-1 transition-colors duration-500 sm:mx-2",
                  i < current ? "bg-primary/40" : "bg-border/50",
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function StepName() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <div className="flex-1">
          <div className="rounded-lg border border-border bg-background px-4 py-2.5">
            <p className="text-sm font-medium text-foreground">{MOCK_AUTOMATION.name}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1.5">
          <div className="size-2 rounded-full bg-primary" />
          <span className="text-xs font-medium text-primary">
            <FormattedMessage {...automationEditorMockMessages.statusActive} />
          </span>
        </div>
      </div>
      <p className="text-sm text-muted-foreground">
        Give your automation a clear name so your team knows what it does at a glance.
      </p>
    </div>
  );
}

function StepTrigger() {
  return (
    <div className="space-y-4">
      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        <FormattedMessage {...automationEditorMockMessages.triggersLabel} />
      </p>
      <div className="overflow-hidden rounded-lg border border-border">
        <div className="flex flex-wrap items-center gap-2 bg-muted/30 px-4 py-3">
          <GitBranchIcon className="size-4 text-muted-foreground" />
          <span className="flex-1 text-sm font-medium">{MOCK_AUTOMATION.trigger}</span>
          <div className="flex flex-wrap items-center gap-2">
            <div className="rounded-md border border-border bg-background px-3 py-1.5 text-xs text-muted-foreground">
              <FormattedMessage {...automationEditorMockMessages.repositoryPlaceholder} />
              <span className="ml-1 opacity-50">▾</span>
            </div>
            <div className="rounded-md border border-border bg-background px-3 py-1.5 text-xs text-muted-foreground">
              {MOCK_AUTOMATION.branch}
              <span className="ml-1 opacity-50">▾</span>
            </div>
          </div>
        </div>
        <div className="border-t border-border/50 px-4 py-2.5 text-xs text-muted-foreground">
          <FormattedMessage {...automationEditorMockMessages.addTrigger} />
        </div>
      </div>
      <p className="text-sm text-muted-foreground">
        This automation runs every time code is pushed to main — no manual intervention needed.
      </p>
    </div>
  );
}

function StepInstructions() {
  return (
    <div className="space-y-4">
      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        <FormattedMessage {...automationEditorMockMessages.instructionsLabel} />
      </p>
      <div className="h-40 overflow-y-scroll rounded-lg border border-border bg-muted/20 p-4">
        <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-foreground/80">
          {MOCK_AUTOMATION.instructions}
        </pre>
      </div>
      <p className="text-sm text-muted-foreground">
        Instructions tell the agent exactly what to check, flag, and ignore on every run.
      </p>
    </div>
  );
}

function StepTools() {
  return (
    <div className="space-y-4">
      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        <FormattedMessage {...automationEditorMockMessages.toolsLabel} />
      </p>
      <div className="space-y-2">
        {MOCK_AUTOMATION.tools.map((tool) => (
          <div key={tool.id} className="overflow-hidden rounded-lg border border-border">
            <div className="flex items-start gap-3 px-4 py-3">
              <div className="mt-0.5 size-7 rounded-md border border-border bg-muted/40 p-1.5">
                <GitBranchIcon className="size-full text-muted-foreground" />
              </div>
              <div className="min-w-0 flex-1 overflow-hidden">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium">{tool.name}</p>
                  {tool.connectFirst && (
                    <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400">
                      <FormattedMessage {...automationEditorMockMessages.connectFirst} />
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">{tool.description}</p>
              </div>
            </div>
            {tool.toggles.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 border-t border-border/50 px-4 py-2.5 text-xs">
                {tool.toggles.map((toggle) => (
                  <div key={toggle.label} className="flex items-center gap-1.5">
                    <div
                      className={cn(
                        "relative h-4 w-7 rounded-full transition-colors",
                        toggle.enabled ? "bg-primary" : "bg-muted-foreground/30",
                      )}
                    >
                      <div
                        className={cn(
                          "absolute top-0.5 size-3 rounded-full shadow-sm transition-transform",
                          toggle.enabled
                            ? "translate-x-3.5 bg-white"
                            : "translate-x-0.5 bg-muted-foreground/60",
                        )}
                      />
                    </div>
                    <span className="text-xs text-muted-foreground">{toggle.label}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function StepDone({ onReplay }: { onReplay: () => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
      <div className="flex size-14 items-center justify-center rounded-full bg-emerald-500/10">
        <CheckCircle2Icon className="size-7" />
      </div>
      <div className="space-y-2">
        <h4 className="text-base font-semibold text-foreground">
          <FormattedMessage {...automationEditorMockMessages.doneHeadline} />
        </h4>
        <p className="max-w-sm text-sm text-muted-foreground">
          <FormattedMessage {...automationEditorMockMessages.doneDescription} />
        </p>
      </div>
      <button
        type="button"
        onClick={onReplay}
        className="flex items-center gap-1.5 cursor-pointer rounded-lg px-3 py-1.5 text-[0.72rem] text-muted-foreground transition-colors hover:bg-muted/40"
      >
        <HugeiconsIcon icon={RefreshIcon} strokeWidth={1.8} className="size-3.5" />
        <FormattedMessage {...automationEditorMockMessages.replay} />
      </button>
    </div>
  );
}

export function AutomationEditorMock() {
  const [currentStep, setCurrentStep] = useState(0);
  const isFirst = currentStep === 0;
  const isLast = currentStep === EDITOR_STEPS.length - 1;

  function handleReplay() {
    setCurrentStep(0);
  }

  const STEP_CONTENT = [
    <StepName key="name" />,
    <StepTrigger key="trigger" />,
    <StepInstructions key="instructions" />,
    <StepTools key="tools" />,
    <StepDone key="done" onReplay={handleReplay} />,
  ];

  return (
    <div className="grid gap-12 lg:grid-cols-[0.82fr_1.18fr] lg:items-start">
      <div className="max-w-xl lg:sticky lg:top-24">
        <p className="mb-2 text-xs font-semibold tracking-[0.18em] text-primary uppercase">
          <FormattedMessage {...automationEditorMockMessages.sectionEyebrow} />
        </p>
        <h3 className="mt-5 font-heading text-3xl font-semibold leading-tight tracking-normal text-balance sm:text-4xl">
          <FormattedMessage {...automationEditorMockMessages.sectionHeadline} />
        </h3>
        <p className="mt-6 text-lg leading-8 text-muted-foreground">
          <FormattedMessage {...automationEditorMockMessages.sectionDescription} />
        </p>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-2xl shadow-gray-alpha-100">
        <div className="border-b border-border/60 px-4 py-4">
          <StepIndicator current={currentStep} />
        </div>

        <div className="h-80 overflow-y-auto p-6 flex flex-col">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentStep}
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -12 }}
              transition={{ duration: 0.2 }}
            >
              {STEP_CONTENT[currentStep]}
            </motion.div>
          </AnimatePresence>
        </div>

        {!isLast && (
          <div className="flex items-center justify-between border-t border-border/60 px-6 py-4">
            <Button
              variant="outline"
              size="sm"
              className="rounded-full"
              nativeButton={false}
              render={<button onClick={() => setCurrentStep((s) => s - 1)} disabled={isFirst} />}
            >
              <FormattedMessage {...automationEditorMockMessages.back} />
            </Button>
            <Button
              size="sm"
              className="rounded-full"
              nativeButton={false}
              render={<button onClick={() => setCurrentStep((s) => s + 1)} />}
            >
              <FormattedMessage {...automationEditorMockMessages.next} />
              <ArrowRightIcon data-icon="inline-end" className="size-3.5" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
