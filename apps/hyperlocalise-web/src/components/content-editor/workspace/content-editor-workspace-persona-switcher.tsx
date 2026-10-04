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
import {
  AiPaintbrushIcon,
  AiTranslateIcon,
  CheckmarkSquare02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useIntl, FormattedMessage } from "react-intl";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/primitives/cn";

import type { ContentEditorWorkspacePersona } from "./content-editor-workspace-persona";
import { isCatWorkspacePersona } from "./content-editor-workspace-persona";
import { contentEditorWorkspacePersonaMessages } from "./content-editor-workspace-persona.messages";

const ALL_PERSONAS = [
  "translator",
  "designer",
  "reviewer",
] as const satisfies readonly ContentEditorWorkspacePersona[];

function personaIcon(persona: ContentEditorWorkspacePersona) {
  if (persona === "designer") return AiPaintbrushIcon;
  if (persona === "reviewer") return CheckmarkSquare02Icon;
  return AiTranslateIcon;
}

export function personaLabel(persona: ContentEditorWorkspacePersona) {
  if (persona === "designer") return contentEditorWorkspacePersonaMessages.designerPersona;
  if (persona === "reviewer") return contentEditorWorkspacePersonaMessages.reviewerPersona;
  return contentEditorWorkspacePersonaMessages.translatorPersona;
}

export function ContentEditorWorkspacePersonaSwitcher({
  value,
  onChange,
  availablePersonas = ALL_PERSONAS,
  className,
  size = "sm",
  variant = "outline",
}: {
  value: ContentEditorWorkspacePersona;
  onChange: (persona: ContentEditorWorkspacePersona) => void;
  availablePersonas?: readonly ContentEditorWorkspacePersona[];
  className?: string;
  size?: "sm" | "xs";
  variant?: "outline" | "ghost";
}) {
  const intl = useIntl();
  const personas = availablePersonas.length > 0 ? availablePersonas : ALL_PERSONAS;
  const compact = size === "xs";

  // Only render when more than one persona is available — no point switching
  // if the current file type only supports one layout (e.g. image files only
  // support "designer").
  if (personas.length <= 1) {
    return null;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant={variant}
            size={compact ? "icon-xs" : "sm"}
            className={cn(compact ? "shrink-0" : "size-8 shrink-0 px-0", "font-normal", className)}
            aria-label={intl.formatMessage(
              contentEditorWorkspacePersonaMessages.personaSwitcherAria,
            )}
          />
        }
      >
        <HugeiconsIcon icon={personaIcon(value)} className={compact ? "size-3" : "size-4"} />
        <span className="sr-only">
          <FormattedMessage {...personaLabel(value)} />
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-44">
        <DropdownMenuRadioGroup
          value={value}
          onValueChange={(nextValue) => {
            if (isCatWorkspacePersona(nextValue) && personas.includes(nextValue)) {
              onChange(nextValue);
            }
          }}
        >
          {personas.map((persona) => (
            <DropdownMenuRadioItem key={persona} value={persona}>
              <FormattedMessage {...personaLabel(persona)} />
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
