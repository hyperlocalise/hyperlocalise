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
import { CaretDownIcon, ColumnsIcon } from "@phosphor-icons/react";
import { observer } from "mobx-react-lite";
import { Fragment, type ReactNode } from "react";
import { FormattedMessage, useIntl } from "react-intl";

import { useContentEditorGrouping } from "@/components/content-editor/groups/content-editor-grouping-context";
import { groupMessages } from "@/components/content-editor/groups/content-editor-groups.messages";
import { contentEditorViewMenuMessages as messages } from "@/components/content-editor/shared/content-editor-chrome.messages";
import { resolveCatFileViewCapabilities } from "@/components/content-editor/workspace/content-editor-file-view-capabilities";
import { useOptionalCatWorkspace } from "@/components/content-editor/workspace/content-editor-workspace-context";
import { isCatWorkspacePersona } from "@/components/content-editor/workspace/content-editor-workspace-persona";
import { personaLabel } from "@/components/content-editor/workspace/content-editor-workspace-persona-switcher";
import {
  applyWorkspacePersona,
  availablePersonasForFamily,
} from "@/components/content-editor/workspace/content-editor-workspace-persona-switcher-connected";
import { isCatWorkspaceViewMode } from "@/components/content-editor/workspace/content-editor-workspace-view-mode";
import { viewModeLabel } from "@/components/content-editor/workspace/content-editor-workspace-view-switcher";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/primitives/cn";

import type { ContentEditorQueueSort } from "./content-editor-queue-filter";
import { queueSortMessageByValue } from "./content-editor-queue-filter-messages";

type ViewMenuSection = { id: string; className?: string; content: ReactNode };

export const ContentEditorViewMenu = observer(function ContentEditorViewMenu({
  showPersona = false,
  queueSort = "file_order",
  onQueueSortChange,
  availableQueueSorts = [],
}: {
  showPersona?: boolean;
  queueSort?: ContentEditorQueueSort;
  onQueueSortChange?: (sort: ContentEditorQueueSort) => void;
  availableQueueSorts?: readonly ContentEditorQueueSort[];
}) {
  const intl = useIntl();
  const store = useOptionalCatWorkspace();
  const grouping = useContentEditorGrouping();
  const selectedSegment = store?.selectedSegmentView ?? null;
  const capabilities = resolveCatFileViewCapabilities({
    sourcePath: selectedSegment?.sourcePath ?? store?.fileContext.sourcePath,
    contentKind: selectedSegment?.contentKind,
    providerKind: store?.fileContext.providerKind,
    multilingualViewAvailable: store?.ui.multilingualViewAvailable,
  });
  const sections: ViewMenuSection[] = [];

  if (store && capabilities.availableViews.length > 1) {
    sections.push({
      id: "layout",
      content: (
        <DropdownMenuGroup>
          <DropdownMenuLabel>
            <FormattedMessage {...messages.layoutLabel} />
          </DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={store.ui.viewMode}
            onValueChange={(value) => {
              if (isCatWorkspaceViewMode(value) && capabilities.availableViews.includes(value)) {
                store.ui.setViewMode(value);
              }
            }}
          >
            {capabilities.availableViews.map((mode) => (
              <DropdownMenuRadioItem key={mode} value={mode}>
                <FormattedMessage {...viewModeLabel(mode)} />
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
      ),
    });
  }

  const personas = availablePersonasForFamily(capabilities.family, capabilities.availableViews);
  if (store && showPersona && personas.length > 1) {
    sections.push({
      id: "persona",
      content: (
        <DropdownMenuGroup>
          <DropdownMenuLabel>
            <FormattedMessage {...messages.modeLabel} />
          </DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={store.ui.resolvedPersona}
            onValueChange={(value) => {
              if (isCatWorkspacePersona(value) && personas.includes(value)) {
                applyWorkspacePersona(store, value, capabilities.family);
              }
            }}
          >
            {personas.map((persona) => (
              <DropdownMenuRadioItem key={persona} value={persona}>
                <FormattedMessage {...personaLabel(persona)} />
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
      ),
    });
  }

  if (onQueueSortChange && availableQueueSorts.includes("untranslated_first")) {
    sections.push({
      id: "sort",
      content: (
        <DropdownMenuGroup>
          <DropdownMenuLabel>
            <FormattedMessage {...messages.sortLabel} />
          </DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={queueSort}
            onValueChange={(value) => onQueueSortChange(value as ContentEditorQueueSort)}
          >
            {availableQueueSorts.map((sortValue) => (
              <DropdownMenuRadioItem key={sortValue} value={sortValue}>
                <FormattedMessage {...queueSortMessageByValue[sortValue]} />
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
      ),
    });
  }

  if (grouping) {
    sections.push({
      id: "grouping",
      content: (
        <DropdownMenuGroup>
          <DropdownMenuLabel>
            <FormattedMessage {...messages.groupingLabel} />
          </DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={grouping.view}
            onValueChange={(value) => {
              if (value === "individual" || value === "grouped") {
                grouping.changeView(value);
              }
            }}
          >
            <DropdownMenuRadioItem value="individual">
              <FormattedMessage {...groupMessages.individual} />
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="grouped">
              <FormattedMessage {...groupMessages.grouped} />
            </DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
          {grouping.preference ? (
            <DropdownMenuItem onClick={() => grouping.changeView(null)}>
              <FormattedMessage {...groupMessages.projectDefault} />
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuGroup>
      ),
    });
  }

  const showFilesToggle = Boolean(store?.page.showFileSidebar);
  const showDetailsToggle =
    store?.ui.viewMode === "comfortable" || store?.ui.viewMode === "side-by-side";
  if (store && (showFilesToggle || showDetailsToggle)) {
    sections.push({
      id: "panels",
      // Panel collapse only applies to the desktop split layout.
      className: "hidden lg:block",
      content: (
        <DropdownMenuGroup>
          <DropdownMenuLabel>
            <FormattedMessage {...messages.panelsLabel} />
          </DropdownMenuLabel>
          {showFilesToggle ? (
            <DropdownMenuCheckboxItem
              checked={!store.ui.filesPanelCollapsed}
              onCheckedChange={(checked) => store.ui.setFilesPanelCollapsed(!checked)}
            >
              <FormattedMessage {...messages.filesPanel} />
            </DropdownMenuCheckboxItem>
          ) : null}
          {showDetailsToggle ? (
            <DropdownMenuCheckboxItem
              checked={!store.ui.detailsPanelCollapsed}
              onCheckedChange={(checked) => store.ui.setDetailsPanelCollapsed(!checked)}
            >
              <FormattedMessage {...messages.detailsPanel} />
            </DropdownMenuCheckboxItem>
          ) : null}
        </DropdownMenuGroup>
      ),
    });
  }

  if (sections.length === 0) {
    return null;
  }

  const hasNonDefaultSort = queueSort !== "file_order";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={cn("h-8 gap-1.5 font-normal", hasNonDefaultSort && "border-grove-400/40")}
            aria-label={intl.formatMessage(messages.triggerAria)}
          />
        }
      >
        <ColumnsIcon className="size-3.5" aria-hidden />
        <span className="text-xs">
          <FormattedMessage {...messages.trigger} />
        </span>
        <CaretDownIcon className="size-3 text-muted-foreground" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        {sections.map((section, index) => (
          <Fragment key={section.id}>
            {index > 0 ? <DropdownMenuSeparator className={section.className} /> : null}
            <div className={section.className}>{section.content}</div>
          </Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
});
