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
import {
  ComputerIcon,
  ReloadIcon,
  SmartPhone01Icon,
  Tablet01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { FormattedMessage, useIntl } from "react-intl";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/primitives/cn";

import type { CatVisualEditorDevice, CatVisualEditorSegment } from "./cat-visual-editor.fixture";
import { catVisualEditorMessages } from "./cat-visual-editor.messages";
import { CatVisualEditorPreview } from "./cat-visual-editor-preview";

const DEVICE_WIDTH: Record<CatVisualEditorDevice, string> = {
  desktop: "w-full max-w-none",
  tablet: "w-full max-w-[768px]",
  mobile: "w-full max-w-[390px]",
};

export function CatVisualEditorCanvas({
  previewUrl,
  fileLabel,
  locale,
  device,
  onDeviceChange,
  highlightTranslatable,
  onHighlightTranslatableChange,
  onRefresh,
  segments,
  selectedSegmentId,
  onSelectSegment,
  className,
}: {
  previewUrl: string;
  fileLabel: string;
  locale: string;
  device: CatVisualEditorDevice;
  onDeviceChange: (device: CatVisualEditorDevice) => void;
  highlightTranslatable: boolean;
  onHighlightTranslatableChange: (value: boolean) => void;
  onRefresh?: () => void;
  segments: CatVisualEditorSegment[];
  selectedSegmentId: string | null;
  onSelectSegment: (segmentId: string) => void;
  className?: string;
}) {
  const intl = useIntl();

  return (
    <section
      className={cn("flex h-full min-h-0 flex-col bg-muted/40", className)}
      aria-label={intl.formatMessage(catVisualEditorMessages.previewAria)}
    >
      <div className="flex flex-wrap items-center gap-3 border-b border-border bg-background px-3 py-2.5">
        <div className="flex items-center gap-1 rounded-lg border border-border p-0.5">
          {(
            [
              ["desktop", ComputerIcon, catVisualEditorMessages.deviceDesktop],
              ["tablet", Tablet01Icon, catVisualEditorMessages.deviceTablet],
              ["mobile", SmartPhone01Icon, catVisualEditorMessages.deviceMobile],
            ] as const
          ).map(([value, icon, message]) => (
            <Button
              key={value}
              size="icon-sm"
              variant={device === value ? "secondary" : "ghost"}
              aria-label={intl.formatMessage(message)}
              aria-pressed={device === value}
              onClick={() => onDeviceChange(value)}
            >
              <HugeiconsIcon icon={icon} className="size-4" />
            </Button>
          ))}
        </div>

        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          <Input
            readOnly
            value={previewUrl}
            className="h-8 min-w-0 flex-1 bg-muted/50 font-mono text-xs"
          />
          <Button
            size="icon-sm"
            variant="ghost"
            onClick={onRefresh}
            aria-label={intl.formatMessage(catVisualEditorMessages.refreshPreview)}
          >
            <HugeiconsIcon icon={ReloadIcon} className="size-4" />
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <Switch
            id="visual-editor-highlight"
            checked={highlightTranslatable}
            onCheckedChange={onHighlightTranslatableChange}
            size="sm"
          />
          <Label htmlFor="visual-editor-highlight" className="text-xs text-muted-foreground">
            <FormattedMessage {...catVisualEditorMessages.highlightToggle} />
          </Label>
        </div>

        <p className="hidden text-xs text-muted-foreground lg:block">
          <FormattedMessage
            {...catVisualEditorMessages.editingStatus}
            values={{ file: fileLabel, locale }}
          />
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-4 sm:p-6">
        <div className={cn("mx-auto transition-[max-width]", DEVICE_WIDTH[device])}>
          <CatVisualEditorPreview
            segments={segments}
            selectedSegmentId={selectedSegmentId}
            highlightTranslatable={highlightTranslatable}
            onSelectSegment={onSelectSegment}
          />
        </div>
      </div>
    </section>
  );
}
