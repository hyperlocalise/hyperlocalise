"use client";

import { useState } from "react";
import Link from "next/link";

import { RepositoryAutomationSettingsPanel } from "./repository-automation-settings-panel";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

type RepositoryAutomationSettingsActionProps = {
  organizationSlug: string;
  githubRepositoryId: string;
  repositoryFullName: string;
  enabled: boolean;
  archived: boolean;
  userCanManage: boolean;
};

export function RepositoryAutomationSettingsAction({
  organizationSlug,
  githubRepositoryId,
  repositoryFullName,
  enabled,
  archived,
  userCanManage,
}: RepositoryAutomationSettingsActionProps) {
  const [open, setOpen] = useState(false);
  const automationPath = `/org/${organizationSlug}/integrations/github/repositories/${githubRepositoryId}/automation`;

  if (!userCanManage || !enabled || archived) {
    return null;
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={<Button type="button" variant="outline" size="sm" className="whitespace-nowrap" />}
      >
        Automation
      </SheetTrigger>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>Repository automation</SheetTitle>
          <SheetDescription>
            Push source, pull translations, and publish localization checks for this repository.
          </SheetDescription>
        </SheetHeader>
        <div className="px-6 pb-6">
          <RepositoryAutomationSettingsPanel
            organizationSlug={organizationSlug}
            githubRepositoryId={githubRepositoryId}
            repositoryFullName={repositoryFullName}
            repositoryEnabled={enabled}
            repositoryArchived={archived}
            userCanManage={userCanManage}
            showFullPageLink
            onSaved={() => setOpen(false)}
          />
          <div className="mt-4 border-t border-border pt-4">
            <Link
              href={automationPath}
              className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              Open dedicated settings page
            </Link>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
