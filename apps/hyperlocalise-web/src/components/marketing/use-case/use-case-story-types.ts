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
import type { MessageDescriptor } from "react-intl";

import type { UseCaseIntegrationId } from "./use-case-integrations";

type M = MessageDescriptor;

export type MockStatus = "done" | "running" | "warn" | "error" | "todo";

/**
 * A small product mock, described as data so every page draws from the same kit.
 * Code, commands, locale codes, and sample translations are literal; UI copy is a message.
 */
export type UseCaseMockVisual =
  | {
      kind: "chat";
      title: M;
      client: "claude" | "cursor" | "codex" | "slack";
      messages: { from: "user" | "agent"; text: M }[];
      tools?: { name: string; detail: M; status: MockStatus }[];
    }
  | {
      kind: "terminal";
      title: string;
      lines: { kind: "cmd" | "out" | "ok" | "warn" | "dim"; text: string }[];
    }
  | {
      kind: "checklist";
      title: M;
      subtitle?: M;
      items: { label: M; meta?: M; status: MockStatus }[];
    }
  | {
      kind: "locales";
      title: M;
      subtitle?: M;
      locales: { code: string; progress: number; status: MockStatus; note?: M }[];
    }
  | {
      kind: "strings";
      title: M;
      subtitle?: M;
      rows: {
        key: string;
        source: string;
        target: string;
        locale: string;
        status: MockStatus;
        note?: M;
      }[];
    }
  | {
      kind: "pull-request";
      repo: string;
      branch: string;
      title: string;
      number: number;
      summary: M;
      rows: { locale: string; label: M; status: MockStatus }[];
    }
  | {
      kind: "metrics";
      title: M;
      subtitle?: M;
      metrics: { label: M; value: string; delta?: string; tone: "good" | "watch" | "neutral" }[];
      bars?: { label: string; value: number }[];
    }
  | {
      kind: "creative";
      title: M;
      variants: { locale: string; headline: string; body: string; status: MockStatus; note?: M }[];
    };

/** Hero product window: an existing product panel, or a composition from the mock kit. */
export type UseCaseHeroVisual =
  | { kind: "domains" }
  | { kind: "hyperlab" }
  | { kind: "guidelines" }
  | { kind: "composition"; primary: UseCaseMockVisual; floating: UseCaseMockVisual };

export type UseCaseStory = {
  slug: string;
  hero: {
    headline: M;
    body: M;
    visual: UseCaseHeroVisual;
  };
  shift: {
    title: M;
    before: M[];
    after: M[];
  };
  guide: {
    title: M;
    body: M;
    steps: { title: M; body: M; visual: UseCaseMockVisual }[];
  };
  integrations: {
    title: M;
    ids: UseCaseIntegrationId[];
  };
  capabilities: {
    title: M;
    items: { title: M; body: M }[];
  };
  scenario: {
    title: M;
    body: M;
    events: { time: M; title: M; body: M }[];
  };
  cta: {
    headline: M;
    body: M;
  };
};
