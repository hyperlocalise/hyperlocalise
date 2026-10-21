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
import { useEffectEvent, useState } from "react";
import { useHotkeys } from "react-hotkeys-hook";

import { hasOpenShortcutModal, isEditableShortcutTarget } from "./automation-shortcut-keys";
import { useAutomationAssistant } from "./automation-assistant-session-provider";

function ignoreWhenModal(): boolean {
  return hasOpenShortcutModal();
}

function ignoreWhenTypingOrModal(event: KeyboardEvent): boolean {
  return isEditableShortcutTarget(event.target) || ignoreWhenModal();
}

/**
 * Binds the shared automation shortcuts and owns the shortcuts dialog. Save and
 * the primary action (run, create, or test) work in fields. Unmodified keys do not.
 */
export function useAutomationPowerShortcuts({
  enabled = true,
  onSave,
  onPrimary,
  onAddNode,
  onFitView,
}: {
  enabled?: boolean;
  onSave?: () => void;
  onPrimary?: () => void;
  onAddNode?: () => void;
  onFitView?: () => void;
}): {
  shortcutsOpen: boolean;
  setShortcutsOpen: (open: boolean) => void;
} {
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const save = useEffectEvent(() => onSave?.());
  const primary = useEffectEvent(() => onPrimary?.());
  const addNode = useEffectEvent(() => onAddNode?.());
  const fitView = useEffectEvent(() => onFitView?.());

  useHotkeys(
    "mod+s",
    () => save(),
    {
      enabled: enabled && Boolean(onSave),
      enableOnFormTags: true,
      enableOnContentEditable: true,
      preventDefault: true,
      ignoreEventWhen: ignoreWhenModal,
    },
    [enabled, onSave],
  );

  useHotkeys(
    "mod+enter",
    () => primary(),
    {
      enabled: enabled && Boolean(onPrimary),
      enableOnFormTags: true,
      enableOnContentEditable: true,
      preventDefault: true,
      ignoreEventWhen: ignoreWhenModal,
    },
    [enabled, onPrimary],
  );

  useHotkeys(
    "n",
    () => addNode(),
    {
      enabled: enabled && Boolean(onAddNode),
      enableOnFormTags: false,
      preventDefault: true,
      useKey: true,
      ignoreEventWhen: ignoreWhenTypingOrModal,
    },
    [enabled, onAddNode],
  );

  useHotkeys(
    "f",
    () => fitView(),
    {
      enabled: enabled && Boolean(onFitView),
      enableOnFormTags: false,
      preventDefault: true,
      useKey: true,
      ignoreEventWhen: ignoreWhenTypingOrModal,
    },
    [enabled, onFitView],
  );

  useHotkeys(
    "?",
    () => setShortcutsOpen((open) => !open),
    {
      enabled,
      enableOnFormTags: false,
      preventDefault: true,
      useKey: true,
      ignoreEventWhen: (event) => isEditableShortcutTarget(event.target),
    },
    [enabled],
  );

  return { shortcutsOpen, setShortcutsOpen };
}

export function useAutomationAssistantShortcut(enabled = true) {
  const assistant = useAutomationAssistant();
  const toggle = useEffectEvent(() => {
    if (!assistant) {
      return;
    }
    assistant.setOpen(!assistant.open);
  });

  useHotkeys(
    "mod+/",
    () => toggle(),
    {
      enabled: enabled && Boolean(assistant),
      enableOnFormTags: true,
      preventDefault: true,
      ignoreEventWhen: ignoreWhenModal,
    },
    [enabled, assistant],
  );
}
