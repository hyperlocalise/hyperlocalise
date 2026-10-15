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
import { LightningIcon } from "@phosphor-icons/react";
import { FormattedMessage, useIntl } from "react-intl";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

import { visualWorkflowEditorMessages as messages } from "./visual-workflow-editor.messages";

/** A step a test run is about to run for real, and the mocked steps whose test data it reads. */
export type RealTestStep = { nodeId: string; title: string; fedBy: string[] };

/** Asks before a test run in which some steps call out for real. */
export function VisualWorkflowRealTestDialog({
  steps,
  onOpenChange,
  onConfirm,
}: {
  /** The steps that run for real; the dialog is open while there are any. */
  steps: readonly RealTestStep[];
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  const intl = useIntl();

  return (
    <AlertDialog open={steps.length > 0} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            <FormattedMessage {...messages.confirmRealTestTitle} values={{ count: steps.length }} />
          </AlertDialogTitle>
          <AlertDialogDescription>
            <FormattedMessage {...messages.confirmRealTestDescription} />
          </AlertDialogDescription>
        </AlertDialogHeader>
        <ul className="grid gap-2 text-sm" data-slot="real-test-steps">
          {steps.map((step) => (
            <li key={step.nodeId} className="flex items-start gap-2">
              <LightningIcon weight="fill" className="mt-0.5 size-3.5 shrink-0 text-warning" />
              <span className="grid gap-0.5">
                <span>
                  <span className="font-medium">{step.title}</span>{" "}
                  <span className="font-mono text-xs text-muted-foreground">{step.nodeId}</span>
                </span>
                {step.fedBy.length > 0 ? (
                  <span className="text-warning">
                    {intl.formatMessage(messages.confirmRealTestFedBy, {
                      steps: intl.formatList(step.fedBy, { type: "conjunction" }),
                    })}
                  </span>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
        <AlertDialogFooter>
          <AlertDialogCancel>
            <FormattedMessage {...messages.confirmRealTestCancel} />
          </AlertDialogCancel>
          <Button onClick={onConfirm}>
            <FormattedMessage {...messages.confirmRealTestRun} />
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
