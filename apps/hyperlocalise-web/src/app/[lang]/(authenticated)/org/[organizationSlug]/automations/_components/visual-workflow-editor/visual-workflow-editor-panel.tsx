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
import { Cancel01Icon, PlusSignIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { ReactNode } from "react";
import { FormattedMessage, useIntl } from "react-intl";

import { Button } from "@/components/ui/button";
import { sheetMessages } from "@/components/ui/sheet.messages";
import { cn } from "@/lib/primitives/cn";

import { visualWorkflowEditorMessages as messages } from "./visual-workflow-editor.messages";

export function VisualWorkflowEditorPanel({
  open,
  onClose,
  onOpenPicker,
  children,
}: {
  open: boolean;
  onClose: () => void;
  onOpenPicker: () => void;
  children: ReactNode;
}) {
  const intl = useIntl();
  const closeLabel = intl.formatMessage(sheetMessages.close);

  return (
    <>
      {open ? (
        <button
          type="button"
          className="absolute inset-0 z-20 bg-black/40 md:hidden"
          aria-label={closeLabel}
          onClick={onClose}
        />
      ) : (
        <Button
          type="button"
          size="sm"
          className="absolute end-3 bottom-16 z-10 md:hidden"
          onClick={onOpenPicker}
        >
          <HugeiconsIcon icon={PlusSignIcon} className="size-4" strokeWidth={2} />
          <FormattedMessage {...messages.addNode} />
        </Button>
      )}
      <aside
        className={cn(
          "flex min-h-0 flex-col border-border bg-background",
          "md:relative md:z-auto md:flex md:w-[360px] md:max-h-none md:shrink-0 md:rounded-none md:border-l md:shadow-none",
          open
            ? "absolute inset-x-0 bottom-0 z-30 max-h-[min(28rem,80%)] rounded-t-xl border-t shadow-2xl md:static"
            : "hidden md:flex",
        )}
      >
        <div className="flex items-center justify-end border-b border-border px-3 py-2 md:hidden">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={closeLabel}
            onClick={onClose}
          >
            <HugeiconsIcon icon={Cancel01Icon} className="size-4" strokeWidth={2} />
          </Button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
      </aside>
    </>
  );
}
