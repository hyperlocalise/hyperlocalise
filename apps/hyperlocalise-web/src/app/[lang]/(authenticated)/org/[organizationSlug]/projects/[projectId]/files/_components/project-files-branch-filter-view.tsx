"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TypographyP } from "@/components/ui/typography";

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
  if (isLoading) {
    return <TypographyP className="text-xs text-muted-foreground">Loading branches…</TypographyP>;
  }

  if (branches.length === 0) {
    return null;
  }

  return (
    <div className="flex items-center gap-2">
      <TypographyP className="shrink-0 text-xs text-muted-foreground">Branch</TypographyP>
      <Select
        value={selectedBranch ?? "__all__"}
        onValueChange={(value) => {
          onSelectedBranchChange(value === "__all__" ? null : value);
        }}
      >
        <SelectTrigger size="sm" className="h-8 w-36 max-w-full">
          <SelectValue placeholder="All branches" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__all__">All branches</SelectItem>
          {branches.map((branch) => (
            <SelectItem key={branch.name} value={branch.name}>
              {branch.title?.trim() ? `${branch.title} (${branch.name})` : branch.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
