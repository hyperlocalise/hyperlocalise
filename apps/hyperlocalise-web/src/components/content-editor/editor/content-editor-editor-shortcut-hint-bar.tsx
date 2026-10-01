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
import { useIntl } from "react-intl";

import { Kbd, KbdGroup } from "@/components/ui/kbd";

import { getCatShortcutKeys } from "./content-editor-keyboard-shortcuts";

/**
 * A compact, always-visible strip of keyboard shortcut hints shown in the
 * editor panel when the Translator persona is active. The hints are purely
 * presentational — they do not register hotkeys; those are handled by
 * useContentEditorEditorHotkeys.
 */
export function ContentEditorEditorShortcutHintBar({ isMac }: { isMac: boolean }) {
  const intl = useIntl();

  const hints: Array<{ keys: string[]; label: string }> = [
    {
      keys: getCatShortcutKeys(isMac, "approve"),
      label: intl.formatMessage({
        defaultMessage: "Approve",
        id: "AmCydzLSkw",
        description: "Shortcut hint label for the approve action in the editor shortcut hint bar",
      }),
    },
    {
      keys: getCatShortcutKeys(isMac, "previous"),
      label: intl.formatMessage({
        defaultMessage: "Previous",
        id: "lyL9yBwPWL",
        description:
          "Shortcut hint label for the previous segment action in the editor shortcut hint bar",
      }),
    },
    {
      keys: getCatShortcutKeys(isMac, "next"),
      label: intl.formatMessage({
        defaultMessage: "Next",
        id: "6s5sthCaHn",
        description:
          "Shortcut hint label for the next segment action in the editor shortcut hint bar",
      }),
    },
    {
      keys: getCatShortcutKeys(isMac, "findContext"),
      label: intl.formatMessage({
        defaultMessage: "Find context",
        id: "SajN+OLrLq",
        description:
          "Shortcut hint label for the find-context action in the editor shortcut hint bar",
      }),
    },
  ];

  return (
    <div
      role="note"
      aria-label={intl.formatMessage({
        defaultMessage: "Keyboard shortcuts",
        id: "RsfV0dXgEF",
        description: "Accessible label for the translator keyboard shortcut hint bar",
      })}
      className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-border px-4 py-2.5"
    >
      {hints.map(({ keys, label }) => (
        <span key={label} className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <KbdGroup aria-hidden="true" className="inline-flex items-center gap-1">
            {keys.map((key, index) => (
              <Kbd key={`${key}-${index}`}>{key}</Kbd>
            ))}
          </KbdGroup>
          <span>{label}</span>
          <span className="sr-only">({keys.join(" + ")})</span>
        </span>
      ))}
    </div>
  );
}
