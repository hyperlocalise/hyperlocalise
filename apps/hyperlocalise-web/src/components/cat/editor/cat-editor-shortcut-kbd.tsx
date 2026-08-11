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
import { Kbd, KbdGroup } from "@/components/ui/kbd";

import { getCatShortcutKeys, type CatEditorShortcut } from "./cat-keyboard-shortcuts";

export function CatEditorShortcutKbd({
  shortcut,
  isMac,
  className,
}: {
  shortcut: CatEditorShortcut;
  isMac: boolean;
  className?: string;
}) {
  const keys = getCatShortcutKeys(isMac, shortcut);

  return (
    <KbdGroup aria-hidden="true" className="ms-2 hidden items-center gap-1 lg:inline-flex">
      {keys.map((key) => (
        <Kbd key={key} className={className}>
          {key}
        </Kbd>
      ))}
    </KbdGroup>
  );
}
