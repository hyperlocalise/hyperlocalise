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
import { useIntl } from "react-intl";
import { toast } from "sonner";

import { Textarea } from "@/components/ui/textarea";
import { TypographyH1 } from "@/components/ui/typography";
import { cn } from "@/lib/primitives/cn";

import { jobDetailEditableTitleMessages as messages } from "./job-detail-editable-title.messages";

export function JobDetailEditableTitle({
  title,
  editable,
  disabled = false,
  onSave,
}: {
  title: string;
  editable: boolean;
  disabled?: boolean;
  onSave?: (nextTitle: string) => Promise<void>;
}) {
  const intl = useIntl();
  const [draft, setDraft] = useState(title);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setDraft(title);
  }, [title]);

  if (!editable || !onSave) {
    return <TypographyH1>{title}</TypographyH1>;
  }

  const commit = async () => {
    const next = draft.trim();
    if (!next) {
      setDraft(title);
      toast.error(intl.formatMessage(messages.titleRequired));
      return;
    }
    if (next === title) {
      setDraft(title);
      return;
    }

    setIsSaving(true);
    try {
      await onSave(next);
    } catch (error) {
      setDraft(title);
      toast.error(error instanceof Error ? error.message : intl.formatMessage(messages.saveFailed));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Textarea
      value={draft}
      onChange={(event) => setDraft(event.currentTarget.value)}
      onBlur={() => {
        void commit();
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" && !event.shiftKey) {
          event.preventDefault();
          event.currentTarget.blur();
        }
        if (event.key === "Escape") {
          event.preventDefault();
          setDraft(title);
          event.currentTarget.blur();
        }
      }}
      disabled={disabled || isSaving}
      aria-label={intl.formatMessage(messages.titleAriaLabel)}
      rows={1}
      className={cn(
        "font-heading min-h-10 shrink-0 overflow-hidden rounded-none border-transparent bg-transparent px-0 py-1 text-3xl font-semibold tracking-[-0.04em] text-balance text-foreground shadow-none md:min-h-14 md:text-6xl",
        "focus-visible:border-transparent focus-visible:ring-0",
      )}
    />
  );
}
