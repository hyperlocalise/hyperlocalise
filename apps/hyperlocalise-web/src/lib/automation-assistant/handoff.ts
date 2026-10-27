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
const STORAGE_KEY = "hyperlocalise.automation-assistant.handoff";
/** A request older than this was typed for a page the person never reached. */
const HANDOFF_TTL_MS = 5 * 60 * 1000;

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

/** Keeps a request typed on the automations page for the setup page that opens next. */
export function stashAutomationAssistantHandoff(text: string): void {
  storage()?.setItem(STORAGE_KEY, JSON.stringify({ text, at: Date.now() }));
}

/** Takes the request the automations page left, once, or null when there is none. */
export function takeAutomationAssistantHandoff(): string | null {
  const store = storage();
  if (!store) {
    return null;
  }
  const raw = store.getItem(STORAGE_KEY);
  store.removeItem(STORAGE_KEY);
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as { text?: unknown; at?: unknown };
    if (typeof parsed.text !== "string" || typeof parsed.at !== "number") {
      return null;
    }
    return Date.now() - parsed.at <= HANDOFF_TTL_MS && parsed.text.trim() ? parsed.text : null;
  } catch {
    return null;
  }
}
