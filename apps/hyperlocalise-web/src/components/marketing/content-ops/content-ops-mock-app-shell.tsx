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
import type { ReactNode } from "react";
import { useState } from "react";
import Image from "next/image";
import {
  BookOpenTextIcon,
  Bookmark01Icon,
  Cancel01Icon,
  Chat01Icon,
  CheckmarkCircle02Icon,
  Copy01Icon,
  CreditCardIcon,
  CubeIcon,
  CustomerSupportIcon,
  DashboardSquare01Icon,
  File01Icon,
  FlashIcon,
  InboxIcon,
  Menu01Icon,
  MinusSignCircleIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { FormattedMessage, useIntl } from "react-intl";

import { appShellClientMessages } from "@/components/app-shell/app-shell-client.messages";
import { appShellFooterMessages } from "@/components/app-shell/app-shell-footer.messages";
import { chatDockMessages } from "@/components/app-shell/chat-dock/chat-dock.messages";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/primitives/cn";

import {
  CONTENT_OPS_MOCK_SHELL_DEFAULT_HEIGHT_CLASSNAME,
  CONTENT_OPS_MOCK_SHELL_SURFACE_CLASSNAME,
  CONTENT_OPS_MOCK_SHELL_VIEWPORT_HEIGHT_CLASSNAME,
} from "./content-ops-mock-stage.constants";
import {
  contentOpsMockStageMessages,
  type ContentOpsMockTabId,
} from "./content-ops-mock-stage.messages";

type MockNavId = "dashboard" | "inbox" | "issues" | "projects" | "automations" | "knowledge";

type MockNavItem = {
  id: MockNavId;
  labelKey: keyof typeof contentOpsMockStageMessages;
  icon: React.ComponentProps<typeof HugeiconsIcon>["icon"];
};

const NAV_ITEMS: MockNavItem[] = [
  { id: "inbox", labelKey: "mockNavInbox", icon: InboxIcon },
  { id: "issues", labelKey: "mockNavIssues", icon: Copy01Icon },
  { id: "dashboard", labelKey: "mockNavDashboard", icon: DashboardSquare01Icon },
  { id: "projects", labelKey: "mockNavProjects", icon: CubeIcon },
  { id: "automations", labelKey: "mockNavAutomations", icon: FlashIcon },
  { id: "knowledge", labelKey: "mockNavKnowledge", icon: Bookmark01Icon },
];

const ACTIVE_NAV_BY_TAB: Record<ContentOpsMockTabId, MockNavId> = {
  triage: "inbox",
  campaign: "automations",
  "seo-blog": "automations",
  brand: "knowledge",
  editor: "projects",
};

const BREADCRUMB_KEY_BY_TAB: Record<ContentOpsMockTabId, keyof typeof contentOpsMockStageMessages> =
  {
    triage: "mockBreadcrumbInbox",
    campaign: "mockBreadcrumbCampaign",
    "seo-blog": "mockBreadcrumbSeo",
    brand: "mockBreadcrumbBrand",
    editor: "mockBreadcrumbEditor",
  };

function MockNavButton({ item, active }: { item: MockNavItem; active: boolean }) {
  const intl = useIntl();
  const label = intl.formatMessage(contentOpsMockStageMessages[item.labelKey]);

  return (
    <div
      className={cn(
        "flex size-8 items-center justify-center overflow-hidden rounded-lg p-2 text-sm transition-colors",
        active
          ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
          : "text-sidebar-foreground/75",
      )}
      aria-current={active ? "page" : undefined}
      title={label}
    >
      <HugeiconsIcon icon={item.icon} strokeWidth={1.8} className="size-4 shrink-0" />
      <span className="sr-only">{label}</span>
    </div>
  );
}

const FLUSH_CONTENT_TABS = new Set<ContentOpsMockTabId>(["triage", "seo-blog", "brand", "editor"]);

const MOCK_EDITOR_GLOSSARY_PREFERRED = 1;
const MOCK_EDITOR_GLOSSARY_NOT_RECOMMENDED = 1;
const MOCK_EDITOR_OPEN_ISSUES = 2;

type MockEditorFooterPanel = "glossary" | "issues" | "chat";

function MockFloatingFooterPanel({
  title,
  onClose,
  children,
  closeLabel,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  closeLabel: string;
}) {
  return (
    <section className="absolute right-2 bottom-11 z-30 flex max-h-[min(16rem,42vh)] w-[min(24rem,calc(100%-1rem))] flex-col overflow-hidden rounded-xl border border-border bg-background shadow-2xl shadow-black/20">
      <header className="flex h-10 shrink-0 items-center gap-2 border-b border-border px-3">
        <h3 className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{title}</h3>
        <button
          type="button"
          className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label={closeLabel}
          onClick={onClose}
        >
          <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} className="size-3.5" />
        </button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
    </section>
  );
}

function MockEditorGlossaryPanel({
  onClose,
  closeLabel,
}: {
  onClose: () => void;
  closeLabel: string;
}) {
  const intl = useIntl();

  const terms = [
    {
      term: intl.formatMessage(contentOpsMockStageMessages.editorGlossaryPreferredTerm),
      note: intl.formatMessage(contentOpsMockStageMessages.editorGlossaryPreferredNote),
      tone: "preferred" as const,
    },
    {
      term: intl.formatMessage(contentOpsMockStageMessages.editorGlossaryNotRecommendedTerm),
      note: intl.formatMessage(contentOpsMockStageMessages.editorGlossaryNotRecommendedNote),
      tone: "not-recommended" as const,
    },
  ];

  return (
    <MockFloatingFooterPanel
      title={intl.formatMessage(contentOpsMockStageMessages.editorGlossaryPanelTitle)}
      onClose={onClose}
      closeLabel={closeLabel}
    >
      <ul className="space-y-2 p-2">
        {terms.map((entry) => (
          <li
            key={entry.term}
            className="rounded-lg border border-border/70 bg-muted/20 px-3 py-2.5"
          >
            <div className="flex items-start justify-between gap-2">
              <span className="text-sm font-medium text-foreground">{entry.term}</span>
              {entry.tone === "preferred" ? (
                <HugeiconsIcon
                  icon={CheckmarkCircle02Icon}
                  className="size-4 shrink-0 text-emerald-500"
                  aria-hidden
                />
              ) : (
                <HugeiconsIcon
                  icon={MinusSignCircleIcon}
                  className="size-4 shrink-0 text-rose-500"
                  aria-hidden
                />
              )}
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">{entry.note}</p>
          </li>
        ))}
      </ul>
    </MockFloatingFooterPanel>
  );
}

function MockEditorIssuesPanel({
  onClose,
  closeLabel,
}: {
  onClose: () => void;
  closeLabel: string;
}) {
  const intl = useIntl();

  const issues = [
    {
      id: "web-2",
      identifier: "WEB-2",
      title: intl.formatMessage(contentOpsMockStageMessages.issueWeb2Title),
      detail: intl.formatMessage(contentOpsMockStageMessages.issueWeb2Detail),
      status: intl.formatMessage(contentOpsMockStageMessages.statusInProgress),
    },
    {
      id: "mob-1",
      identifier: "MOB-1",
      title: intl.formatMessage(contentOpsMockStageMessages.issueMob1Title),
      detail: intl.formatMessage(contentOpsMockStageMessages.issueMob1Detail),
      status: intl.formatMessage(contentOpsMockStageMessages.statusOpen),
    },
  ];

  return (
    <MockFloatingFooterPanel
      title={intl.formatMessage(contentOpsMockStageMessages.editorIssuesPanelTitle)}
      onClose={onClose}
      closeLabel={closeLabel}
    >
      <ul className="space-y-2 p-2">
        {issues.map((issue) => (
          <li key={issue.id} className="rounded-lg border border-border/70 bg-muted/20 px-3 py-2.5">
            <div className="flex items-start justify-between gap-2">
              <span className="font-mono text-[10px] font-medium text-muted-foreground">
                {issue.identifier}
              </span>
              <span className="shrink-0 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-800 dark:text-amber-200">
                {issue.status}
              </span>
            </div>
            <p className="mt-1 text-xs font-medium text-foreground">{issue.title}</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">{issue.detail}</p>
          </li>
        ))}
      </ul>
    </MockFloatingFooterPanel>
  );
}

function MockEditorChatPanel({ onClose, closeLabel }: { onClose: () => void; closeLabel: string }) {
  const intl = useIntl();
  const [started, setStarted] = useState(false);
  const suggestion = intl.formatMessage(contentOpsMockStageMessages.editorChatSuggestion);
  const answer = intl.formatMessage(contentOpsMockStageMessages.editorChatAnswer);

  return (
    <MockFloatingFooterPanel
      title={intl.formatMessage(chatDockMessages.newChat)}
      onClose={onClose}
      closeLabel={closeLabel}
    >
      {started ? (
        <div className="flex flex-col gap-3 p-3">
          <div className="ms-auto max-w-[92%] rounded-2xl bg-muted px-3 py-2 text-pretty text-xs leading-5 text-foreground">
            {suggestion}
          </div>
          <p className="text-pretty text-xs leading-5 text-foreground">{answer}</p>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3 px-4 py-6 text-center">
          <div className="flex size-9 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <HugeiconsIcon icon={Chat01Icon} strokeWidth={1.8} className="size-4" />
          </div>
          <div className="max-w-xs space-y-1">
            <p className="text-sm font-medium text-foreground">
              <FormattedMessage {...chatDockMessages.emptyTitle} />
            </p>
            <p className="text-pretty text-xs leading-5 text-muted-foreground">
              <FormattedMessage {...chatDockMessages.emptySubtitle} />
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 max-w-full text-pretty text-xs"
            onClick={() => setStarted(true)}
          >
            {suggestion}
          </Button>
        </div>
      )}
    </MockFloatingFooterPanel>
  );
}

function MockEditorFooter() {
  const intl = useIntl();
  const [openPanel, setOpenPanel] = useState<MockEditorFooterPanel | null>(null);
  const closeLabel = intl.formatMessage(contentOpsMockStageMessages.editorFooterPanelClose);

  const togglePanel = (panel: MockEditorFooterPanel) => {
    setOpenPanel((current) => (current === panel ? null : panel));
  };

  return (
    <>
      {openPanel === "glossary" ? (
        <MockEditorGlossaryPanel onClose={() => setOpenPanel(null)} closeLabel={closeLabel} />
      ) : null}
      {openPanel === "issues" ? (
        <MockEditorIssuesPanel onClose={() => setOpenPanel(null)} closeLabel={closeLabel} />
      ) : null}
      {openPanel === "chat" ? (
        <MockEditorChatPanel onClose={() => setOpenPanel(null)} closeLabel={closeLabel} />
      ) : null}

      <footer className="flex h-10 shrink-0 items-stretch border-t border-border px-2">
        <div className="flex h-10 w-full min-w-0 items-center gap-2">
          <Button type="button" variant="outline" size="xs" tabIndex={-1} className="shrink-0">
            <HugeiconsIcon icon={CreditCardIcon} strokeWidth={2} data-icon="inline-start" />
            <span className="max-w-40 truncate">
              <FormattedMessage {...contentOpsMockStageMessages.mockShellPlanButton} />
            </span>
          </Button>

          <div className="ms-auto flex min-w-0 items-center gap-2 overflow-x-auto">
            <Button
              type="button"
              variant="ghost"
              size="xs"
              className="shrink-0 gap-1.5 px-2"
              aria-expanded={openPanel === "glossary"}
              onClick={() => togglePanel("glossary")}
            >
              <HugeiconsIcon icon={BookOpenTextIcon} strokeWidth={2} className="size-3.5" />
              <FormattedMessage {...appShellFooterMessages.glossaryGuidanceLabel} />
              <span className="inline-flex items-center gap-0.5 text-xs font-medium text-emerald-500">
                <HugeiconsIcon
                  icon={CheckmarkCircle02Icon}
                  strokeWidth={2}
                  className="size-4"
                  aria-hidden="true"
                />
                <span className="tabular-nums">{MOCK_EDITOR_GLOSSARY_PREFERRED}</span>
              </span>
              <span className="inline-flex items-center gap-0.5 text-xs font-medium text-rose-500">
                <HugeiconsIcon
                  icon={MinusSignCircleIcon}
                  strokeWidth={2}
                  className="size-4"
                  aria-hidden="true"
                />
                <span className="tabular-nums">{MOCK_EDITOR_GLOSSARY_NOT_RECOMMENDED}</span>
              </span>
            </Button>

            <Button
              type="button"
              variant="ghost"
              size="xs"
              className="shrink-0 gap-1.5 px-2"
              aria-expanded={openPanel === "issues"}
              onClick={() => togglePanel("issues")}
            >
              <HugeiconsIcon icon={Copy01Icon} strokeWidth={2} className="size-3.5" />
              <FormattedMessage {...appShellFooterMessages.issueGuidanceLabel} />
              <span className="tabular-nums text-xs font-medium text-flame-900 dark:text-flame-100">
                {MOCK_EDITOR_OPEN_ISSUES}
              </span>
            </Button>

            <Button
              type="button"
              variant="ghost"
              size="xs"
              className="shrink-0 gap-1.5 px-2"
              aria-expanded={openPanel === "chat"}
              onClick={() => togglePanel("chat")}
            >
              <HugeiconsIcon icon={Chat01Icon} strokeWidth={2} className="size-3.5" />
              <FormattedMessage {...chatDockMessages.newChat} />
            </Button>

            <Button
              type="button"
              variant="ghost"
              size="xs"
              tabIndex={-1}
              className="shrink-0 gap-1.5 px-2"
            >
              <HugeiconsIcon icon={CustomerSupportIcon} strokeWidth={2} className="size-3.5" />
              <FormattedMessage {...appShellFooterMessages.supportLabel} />
            </Button>
          </div>
        </div>
      </footer>
    </>
  );
}

function MockDefaultFooter() {
  return (
    <footer className="flex h-10 shrink-0 items-center justify-between border-t border-border px-4 text-[11px] text-muted-foreground sm:px-5">
      <span>
        <FormattedMessage {...contentOpsMockStageMessages.mockShellPlan} />
      </span>
      <span className="hidden sm:inline">
        <FormattedMessage {...contentOpsMockStageMessages.mockShellSupport} />
      </span>
    </footer>
  );
}

export function ContentOpsMockAppShell({
  activeTab,
  children,
  className,
  size = "default",
}: {
  activeTab: ContentOpsMockTabId;
  children: ReactNode;
  className?: string;
  /** `viewport` fills up to 80% of the screen — used on the Multilingual Content Studio page. */
  size?: "default" | "viewport";
}) {
  const intl = useIntl();
  const activeNavId = ACTIVE_NAV_BY_TAB[activeTab];
  const breadcrumb = intl.formatMessage(
    contentOpsMockStageMessages[BREADCRUMB_KEY_BY_TAB[activeTab]],
  );

  const heightClassName =
    size === "viewport"
      ? CONTENT_OPS_MOCK_SHELL_VIEWPORT_HEIGHT_CLASSNAME
      : CONTENT_OPS_MOCK_SHELL_DEFAULT_HEIGHT_CLASSNAME;

  return (
    <div
      className={cn(CONTENT_OPS_MOCK_SHELL_SURFACE_CLASSNAME, heightClassName, className)}
      aria-hidden
    >
      <div className="flex h-full min-h-0">
        <aside
          className="hidden w-12 shrink-0 flex-col overflow-hidden border-r border-sidebar-border bg-sidebar sm:flex"
          data-state="collapsed"
          data-collapsible="icon"
        >
          <div className="flex items-center justify-center border-b border-sidebar-border px-0 py-3">
            <Image
              src="/images/logo.png"
              width={28}
              height={28}
              sizes="28px"
              alt={intl.formatMessage(appShellClientMessages.logoAlt)}
              className="size-7 shrink-0 rounded-lg"
            />
          </div>

          <nav className="flex flex-1 flex-col items-center gap-1 px-2 py-3">
            {NAV_ITEMS.map((item) => (
              <MockNavButton key={item.id} item={item} active={item.id === activeNavId} />
            ))}
          </nav>

          <div className="flex justify-center border-t border-sidebar-border px-0 py-3">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-muted-foreground">
              AC
            </span>
          </div>
        </aside>

        <div className="relative flex min-w-0 flex-1 flex-col bg-background">
          <header className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-border px-4 sm:px-5">
            <div className="flex min-w-0 items-center gap-2">
              <span className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground sm:hidden">
                <HugeiconsIcon icon={Menu01Icon} strokeWidth={1.8} className="size-4" />
              </span>
              <Separator orientation="vertical" className="hidden h-4 sm:block" />
              <p className="truncate text-sm text-muted-foreground">{breadcrumb}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {activeTab === "editor" ? (
                <span className="hidden items-center gap-1.5 rounded-md border border-border/70 bg-muted/30 px-2 py-1 text-[10px] font-medium text-muted-foreground sm:inline-flex">
                  <HugeiconsIcon icon={File01Icon} strokeWidth={1.8} className="size-3" />
                  hero-section.tsx
                </span>
              ) : null}
              <span className="flex size-8 items-center justify-center rounded-full bg-muted text-[11px] font-medium text-muted-foreground">
                MC
              </span>
            </div>
          </header>

          <main
            className={cn(
              "flex min-h-0 flex-1 flex-col overflow-hidden",
              FLUSH_CONTENT_TABS.has(activeTab) ? "p-0" : "p-4 sm:p-5",
            )}
          >
            {children}
          </main>

          {activeTab === "editor" ? <MockEditorFooter /> : <MockDefaultFooter />}
        </div>
      </div>
    </div>
  );
}
