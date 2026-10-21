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
import { CaretDownIcon, MagnifyingGlassIcon, TextAaIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { FormattedMessage, useIntl } from "react-intl";

import { insertTextIntoActiveContentEditorTarget } from "@/components/content-editor/editor/content-editor-target-insert";
import { contentEditorUnicodePanelMessages } from "@/components/content-editor/shared/content-editor.messages";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/primitives/cn";

import {
  COMMONLY_USED_UNICODE_CHARACTERS,
  filterUnicodeCharacters,
  formatUnicodeCodePoint,
  type ContentEditorUnicodeCharacter,
} from "./content-editor-unicode-characters";

function UnicodeGlyph({ character }: { character: ContentEditorUnicodeCharacter }) {
  if (character.invisible) {
    return (
      <span className="rounded border border-dashed border-border px-1 font-mono text-[10px] leading-none text-muted-foreground">
        {character.shortLabel}
      </span>
    );
  }

  return <span className="text-xl leading-none text-foreground">{character.char}</span>;
}

function UnicodeCharacterButton({
  character,
  disabled,
  onInsert,
}: {
  character: ContentEditorUnicodeCharacter;
  disabled: boolean;
  onInsert: (character: string) => void;
}) {
  const intl = useIntl();
  const code = formatUnicodeCodePoint(character.codePoint);
  const label = intl.formatMessage(contentEditorUnicodePanelMessages.insertAria, {
    name: character.name,
    code,
  });

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            disabled={disabled}
            aria-label={label}
            onClick={() => onInsert(character.char)}
            className={cn(
              "flex min-h-16 flex-col items-center justify-center gap-1 rounded-lg px-1 py-1.5 text-center transition-colors",
              "hover:bg-muted focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
              "disabled:pointer-events-none disabled:opacity-50",
            )}
          />
        }
      >
        <UnicodeGlyph character={character} />
        <span className="font-mono text-[10px] leading-none text-muted-foreground">{code}</span>
      </TooltipTrigger>
      <TooltipContent>
        {character.name} · {code}
      </TooltipContent>
    </Tooltip>
  );
}

export function ContentEditorUnicodePanel({
  canInsert = true,
  defaultOpen = false,
  onInsertCharacter,
}: {
  canInsert?: boolean;
  defaultOpen?: boolean;
  onInsertCharacter?: (character: string) => void;
}) {
  const intl = useIntl();
  const [open, setOpen] = useState(defaultOpen);
  const [query, setQuery] = useState("");
  const characters = filterUnicodeCharacters(COMMONLY_USED_UNICODE_CHARACTERS, query);

  function handleInsert(character: string) {
    if (!canInsert) {
      return;
    }
    if (insertTextIntoActiveContentEditorTarget(character)) {
      return;
    }
    onInsertCharacter?.(character);
  }

  return (
    <TooltipProvider>
      <Collapsible open={open} onOpenChange={setOpen}>
        <section className="overflow-hidden rounded-xl border border-border bg-background">
          <CollapsibleTrigger
            className="flex w-full items-center gap-2 px-3.5 py-2.5 text-left outline-hidden transition-colors hover:bg-muted/40 focus-visible:bg-muted/40"
            aria-label={intl.formatMessage(
              open
                ? contentEditorUnicodePanelMessages.collapseAria
                : contentEditorUnicodePanelMessages.expandAria,
            )}
          >
            <TextAaIcon className="size-3.5 shrink-0 text-muted-foreground" />
            <h3 className="min-w-0 flex-1 text-sm font-medium text-foreground">
              <FormattedMessage {...contentEditorUnicodePanelMessages.title} />
            </h3>
            {open ? null : (
              <span className="truncate text-xs text-muted-foreground">
                <FormattedMessage {...contentEditorUnicodePanelMessages.category} />
              </span>
            )}
            <CaretDownIcon
              className={cn(
                "size-3.5 shrink-0 text-muted-foreground transition-transform",
                open && "rotate-180",
              )}
            />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="space-y-3 border-t border-border px-3.5 py-3">
              <p className="text-xs font-medium text-muted-foreground">
                <FormattedMessage {...contentEditorUnicodePanelMessages.category} />
              </p>
              <div className="relative">
                <MagnifyingGlassIcon className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={intl.formatMessage(
                    contentEditorUnicodePanelMessages.searchPlaceholder,
                  )}
                  aria-label={intl.formatMessage(contentEditorUnicodePanelMessages.searchAria)}
                  className="h-8 pl-8 text-xs"
                />
              </div>
              {characters.length > 0 ? (
                <div className="grid grid-cols-4 gap-0.5 sm:grid-cols-5">
                  {characters.map((character) => (
                    <UnicodeCharacterButton
                      key={character.codePoint}
                      character={character}
                      disabled={!canInsert}
                      onInsert={handleInsert}
                    />
                  ))}
                </div>
              ) : (
                <p className="py-2 text-sm text-muted-foreground">
                  <FormattedMessage
                    {...contentEditorUnicodePanelMessages.emptySearch}
                    values={{ query }}
                  />
                </p>
              )}
            </div>
          </CollapsibleContent>
        </section>
      </Collapsible>
    </TooltipProvider>
  );
}
