"use client";

import { useState } from "react";
import { FormattedMessage } from "react-intl";

import { RepositoryAutomationSettingsPanel } from "./repository-automation-settings-panel";
import { repositoryAutomationSettingsActionMessages } from "./repository-automation-settings-action.messages";
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

  if (!userCanManage || !enabled || archived) {
    return null;
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={<Button type="button" variant="outline" size="sm" className="whitespace-nowrap" />}
      >
        <FormattedMessage {...repositoryAutomationSettingsActionMessages.automationButton} />
      </SheetTrigger>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>
            <FormattedMessage {...repositoryAutomationSettingsActionMessages.sheetTitle} />
          </SheetTitle>
          <SheetDescription>
            <FormattedMessage {...repositoryAutomationSettingsActionMessages.sheetDescription} />
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
        </div>
      </SheetContent>
    </Sheet>
  );
}
