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
import { useEffect, useState } from "react";
import { FormattedMessage, useIntl } from "react-intl";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";

import type { ContentEditorFileViewerId } from "@/components/content-editor/workspace/content-editor-file-view-capabilities";

import {
  contentEditorFileGeneratePromptPlaceholderMessage,
  contentEditorFileViewMessages,
} from "./content-editor-file-view.messages";

export function ContentEditorFileGenerateDialog({
  open,
  onOpenChange,
  mode,
  viewerId,
  isSubmitting = false,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "generate" | "regenerate";
  viewerId: ContentEditorFileViewerId | null;
  isSubmitting?: boolean;
  onSubmit: (instructions: string) => void | Promise<void>;
}) {
  const intl = useIntl();
  const [instructions, setInstructions] = useState("");

  useEffect(() => {
    if (!open) {
      setInstructions("");
    }
  }, [open]);

  const titleMessage =
    mode === "generate"
      ? contentEditorFileViewMessages.generateDialogTitle
      : contentEditorFileViewMessages.regenerateDialogTitle;
  const submitMessage =
    mode === "generate"
      ? contentEditorFileViewMessages.generate
      : contentEditorFileViewMessages.regenerate;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            <FormattedMessage {...titleMessage} />
          </DialogTitle>
          <DialogDescription>
            <FormattedMessage {...contentEditorFileViewMessages.generateDialogDescription} />
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <label
            htmlFor="content-editor-file-generate-instructions"
            className="text-sm font-medium text-foreground"
          >
            <FormattedMessage {...contentEditorFileViewMessages.generatePromptLabel} />
          </label>
          <Textarea
            id="content-editor-file-generate-instructions"
            value={instructions}
            onChange={(event) => setInstructions(event.currentTarget.value)}
            placeholder={intl.formatMessage(
              contentEditorFileGeneratePromptPlaceholderMessage(viewerId),
            )}
            rows={5}
            disabled={isSubmitting}
            className="resize-y"
          />
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            disabled={isSubmitting}
            onClick={() => onOpenChange(false)}
          >
            <FormattedMessage {...contentEditorFileViewMessages.generateDialogCancel} />
          </Button>
          <Button
            type="button"
            disabled={isSubmitting}
            onClick={() => void onSubmit(instructions.trim())}
          >
            {isSubmitting ? <Spinner className="size-4" /> : null}
            <FormattedMessage {...submitMessage} />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
