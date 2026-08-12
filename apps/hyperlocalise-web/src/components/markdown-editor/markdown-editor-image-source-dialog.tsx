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
import { useEffect, useId, useRef, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { IntlShape } from "react-intl";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { isValidMarkdownEditorImageSrc } from "./markdown-editor-image";
import { markdownEditorMessages } from "./markdown-editor.messages";

export type MarkdownEditorImageSourceResult = { kind: "upload" } | { kind: "url"; src: string };

export type MarkdownEditorImageSourceLabels = {
  title: string;
  upload: string;
  enterUrl: string;
  urlLabel: string;
  urlPlaceholder: string;
  insert: string;
  cancel: string;
};

type DialogStep = "choose" | "url";

export function getMarkdownEditorImageSourceLabels(
  intl: IntlShape,
): MarkdownEditorImageSourceLabels {
  return {
    title: intl.formatMessage(markdownEditorMessages.imageSourceDialogTitle),
    upload: intl.formatMessage(markdownEditorMessages.imageSourceUpload),
    enterUrl: intl.formatMessage(markdownEditorMessages.imageSourceEnterUrl),
    urlLabel: intl.formatMessage(markdownEditorMessages.imagePrompt),
    urlPlaceholder: intl.formatMessage(markdownEditorMessages.imageSourceUrlPlaceholder),
    insert: intl.formatMessage(markdownEditorMessages.imageSourceInsert),
    cancel: intl.formatMessage(markdownEditorMessages.imageSourceCancel),
  };
}

function MarkdownEditorImageSourceDialog({
  open,
  allowUpload,
  labels,
  onResolve,
}: {
  open: boolean;
  allowUpload: boolean;
  labels: MarkdownEditorImageSourceLabels;
  onResolve: (result: MarkdownEditorImageSourceResult | null) => void;
}) {
  const [step, setStep] = useState<DialogStep>(allowUpload ? "choose" : "url");
  const [url, setUrl] = useState("https://");
  const urlInputId = useId();
  const urlInputRef = useRef<HTMLInputElement>(null);
  const urlIsValid = isValidMarkdownEditorImageSrc(url);

  useEffect(() => {
    if (!open || step !== "url") {
      return;
    }
    const frame = window.requestAnimationFrame(() => {
      const input = urlInputRef.current;
      if (!input) {
        return;
      }
      input.focus();
      input.select();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [open, step]);

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          onResolve(null);
        }
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="gap-4 sm:max-w-sm"
        data-markdown-image-source-dialog=""
      >
        <DialogHeader>
          <DialogTitle>{labels.title}</DialogTitle>
        </DialogHeader>

        {step === "choose" ? (
          <div className="flex flex-col gap-2">
            <Button type="button" onClick={() => onResolve({ kind: "upload" })}>
              {labels.upload}
            </Button>
            <Button type="button" variant="outline" onClick={() => setStep("url")}>
              {labels.enterUrl}
            </Button>
            <Button type="button" variant="ghost" onClick={() => onResolve(null)}>
              {labels.cancel}
            </Button>
          </div>
        ) : (
          <form
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (!urlIsValid) {
                return;
              }
              onResolve({ kind: "url", src: url.trim() });
            }}
          >
            <div className="flex flex-col gap-2">
              <Label htmlFor={urlInputId}>{labels.urlLabel}</Label>
              <Input
                ref={urlInputRef}
                id={urlInputId}
                type="text"
                inputMode="url"
                value={url}
                placeholder={labels.urlPlaceholder}
                autoComplete="off"
                spellCheck={false}
                onChange={(event) => setUrl(event.target.value)}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onResolve(null)}>
                {labels.cancel}
              </Button>
              <Button type="submit" disabled={!urlIsValid}>
                {labels.insert}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function promptMarkdownEditorImageSource(
  labels: MarkdownEditorImageSourceLabels,
  options: { allowUpload: boolean },
): Promise<MarkdownEditorImageSourceResult | null> {
  return new Promise((resolve) => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root: Root = createRoot(container);
    let settled = false;

    const finish = (result: MarkdownEditorImageSourceResult | null) => {
      if (settled) {
        return;
      }
      settled = true;
      root.render(
        <MarkdownEditorImageSourceDialog
          open={false}
          allowUpload={options.allowUpload}
          labels={labels}
          onResolve={() => undefined}
        />,
      );
      queueMicrotask(() => {
        root.unmount();
        container.remove();
        resolve(result);
      });
    };

    root.render(
      <MarkdownEditorImageSourceDialog
        open
        allowUpload={options.allowUpload}
        labels={labels}
        onResolve={finish}
      />,
    );
  });
}
