"use client";

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
