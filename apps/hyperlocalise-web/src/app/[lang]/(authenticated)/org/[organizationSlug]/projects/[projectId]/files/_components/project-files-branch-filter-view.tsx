"use client";

/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file and at https://mariadb.com/bsl11/.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { FormattedMessage, useIntl } from "react-intl";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TypographyP } from "@/components/ui/typography";

import { projectFilesBranchFilterViewMessages as messages } from "./project-files-branch-filter-view.messages";

export type ProviderProjectBranchOption = {
  name: string;
  title?: string | null;
};

export function ProjectFilesBranchFilterView({
  branches,
  selectedBranch,
  onSelectedBranchChange,
  isLoading = false,
}: {
  branches: ProviderProjectBranchOption[];
  selectedBranch: string | null;
  onSelectedBranchChange: (branch: string | null) => void;
  isLoading?: boolean;
}) {
  const intl = useIntl();

  if (isLoading) {
    return (
      <TypographyP className="text-xs text-muted-foreground">
        <FormattedMessage {...messages.loadingBranches} />
      </TypographyP>
    );
  }

  if (branches.length === 0) {
    return null;
  }

  return (
    <div className="flex items-center gap-2">
      <TypographyP className="shrink-0 text-xs text-muted-foreground">
        <FormattedMessage {...messages.branchLabel} />
      </TypographyP>
      <Select
        value={selectedBranch ?? "__all__"}
        onValueChange={(value) => {
          onSelectedBranchChange(value === "__all__" ? null : value);
        }}
      >
        <SelectTrigger size="sm" className="h-8 w-36 max-w-full">
          <SelectValue placeholder={intl.formatMessage(messages.allBranches)} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__all__">
            <FormattedMessage {...messages.allBranches} />
          </SelectItem>
          {branches.map((branch) => (
            <SelectItem key={branch.name} value={branch.name}>
              {branch.title?.trim()
                ? intl.formatMessage(messages.branchWithTitle, {
                    title: branch.title,
                    name: branch.name,
                  })
                : branch.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
