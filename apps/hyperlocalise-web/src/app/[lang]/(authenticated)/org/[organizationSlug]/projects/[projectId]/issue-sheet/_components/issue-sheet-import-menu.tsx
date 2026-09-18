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
import { ArrowDown01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { FormattedMessage } from "react-intl";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { IssueSheetImportFormat } from "@/lib/projects/issue-sheet/issue-sheet-import-format";

import { issueSheetImportMenuMessages as messages } from "./issue-sheet-import-menu.messages";

const importFormats: { format: IssueSheetImportFormat; message: typeof messages.importCsv }[] = [
  { format: "csv", message: messages.importCsv },
  { format: "xls", message: messages.importXls },
  { format: "xlsx", message: messages.importXlsx },
];

export function IssueSheetImportMenu({
  onSelectFormat,
  disabled,
  variant = "outline",
  size,
}: {
  onSelectFormat: (format: IssueSheetImportFormat) => void;
  disabled?: boolean;
  variant?: "outline" | "ghost";
  size?: "sm" | "default";
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button type="button" variant={variant} size={size} disabled={disabled} />
        }
      >
        <FormattedMessage {...messages.import} />
        <HugeiconsIcon icon={ArrowDown01Icon} className="size-3.5" strokeWidth={2} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-36">
        {importFormats.map((item) => (
          <DropdownMenuItem key={item.format} onClick={() => onSelectFormat(item.format)}>
            <FormattedMessage {...item.message} />
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
