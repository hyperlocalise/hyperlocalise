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
import dynamic from "next/dynamic";
import { Cancel01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { FormattedMessage, useIntl } from "react-intl";

import { HeroFrameLoadingShell } from "@/components/marketing/hero-frame-mesh-stage";
import { cn } from "@/lib/primitives/cn";

import {
  CONTENT_OPS_EDITOR_WORKSPACE_CLASSNAME,
  CONTENT_OPS_MOCK_INNER_CLASSNAME,
} from "./content-ops-mock-stage.constants";
import { contentOpsMockStageMessages } from "./content-ops-mock-stage.messages";

const ClientHeroFrame = dynamic(
  () => import("@/components/marketing/hero-frame").then((module) => module.HeroFrame),
  {
    loading: HeroFrameLoadingShell,
    ssr: false,
  },
);

type EditorSceneId = "file-content" | "glossary" | "issues" | "intelligence";

const EDITOR_SCENE_ORDER: EditorSceneId[] = ["file-content", "glossary", "issues", "intelligence"];

const SCENE_SEGMENT: Record<EditorSceneId, string> = {
  "file-content": "hero-title",
  glossary: "qa-warning",
  issues: "hero-cta",
  intelligence: "hero-title",
};

const SCENE_HOLD_MS = 3400;

function EditorIssuesOverlay() {
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
    <section
      aria-label={intl.formatMessage(contentOpsMockStageMessages.editorIssuesPanelTitle)}
      className="absolute inset-x-4 bottom-4 z-20 flex max-h-[16rem] flex-col overflow-hidden rounded-xl border border-border bg-background shadow-2xl shadow-black/15 sm:inset-x-auto sm:right-4 sm:w-[24rem]"
    >
      <header className="flex h-10 shrink-0 items-center gap-2 border-b border-border px-3">
        <h3 className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
          <FormattedMessage {...contentOpsMockStageMessages.editorIssuesPanelTitle} />
        </h3>
        <button
          type="button"
          className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground"
          aria-hidden
          tabIndex={-1}
        >
          <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} className="size-3.5" />
        </button>
      </header>
      <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2">
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
    </section>
  );
}

export function ContentOpsEditorPanel({ pauseAutoplay = false }: { pauseAutoplay?: boolean }) {
  const [scene, setScene] = useState<EditorSceneId>("file-content");

  useEffect(() => {
    if (pauseAutoplay) {
      return;
    }

    const timer = window.setTimeout(() => {
      setScene((current) => {
        const index = EDITOR_SCENE_ORDER.indexOf(current);
        return EDITOR_SCENE_ORDER[(index + 1) % EDITOR_SCENE_ORDER.length]!;
      });
    }, SCENE_HOLD_MS);

    return () => window.clearTimeout(timer);
  }, [pauseAutoplay, scene]);

  return (
    <div className={cn(CONTENT_OPS_MOCK_INNER_CLASSNAME, "relative")}>
      <ClientHeroFrame
        key={scene}
        layout="contained"
        className="rounded-none border-0 shadow-none"
        initialSelectedSegmentId={SCENE_SEGMENT[scene]}
        workspaceClassName={CONTENT_OPS_EDITOR_WORKSPACE_CLASSNAME}
      />
      {scene === "issues" ? <EditorIssuesOverlay /> : null}
    </div>
  );
}
