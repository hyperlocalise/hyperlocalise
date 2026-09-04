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
import * as React from "react";
import { ComputerIcon, Moon02Icon, Sun01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useTheme } from "next-themes";
import { FormattedMessage, useIntl } from "react-intl";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

import { cn } from "@/lib/primitives/cn";

import { themeToggleMessages } from "./theme-toggle.messages";

type ThemeOption = "light" | "dark" | "system";

const THEME_OPTIONS: ThemeOption[] = ["light", "dark", "system"];

function ThemeToggleIcon({ theme }: { theme: ThemeOption }) {
  if (theme === "dark") {
    return <HugeiconsIcon icon={Moon02Icon} strokeWidth={2} className="size-4" />;
  }

  if (theme === "system") {
    return <HugeiconsIcon icon={ComputerIcon} strokeWidth={2} className="size-4" />;
  }

  return <HugeiconsIcon icon={Sun01Icon} strokeWidth={2} className="size-4" />;
}

function useThemeToggleState() {
  const { resolvedTheme, setTheme, theme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  const activeTheme: ThemeOption = mounted
    ? ((theme as ThemeOption | undefined) ?? "system")
    : "system";
  const triggerTheme: ThemeOption = mounted
    ? activeTheme === "system"
      ? ((resolvedTheme as "light" | "dark" | undefined) ?? "light")
      : activeTheme
    : "system";

  return { activeTheme, mounted, setTheme, triggerTheme };
}

function ThemeMenuControl() {
  const intl = useIntl();
  const { activeTheme, mounted, setTheme } = useThemeToggleState();

  return (
    <div
      role="radiogroup"
      aria-label={intl.formatMessage(themeToggleMessages.colorThemeAria)}
      className="flex gap-1"
    >
      {THEME_OPTIONS.map((option) => {
        const isActive = mounted && activeTheme === option;
        const label = intl.formatMessage(
          option === "light"
            ? themeToggleMessages.light
            : option === "dark"
              ? themeToggleMessages.dark
              : themeToggleMessages.system,
        );

        return (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={isActive}
            aria-label={label}
            disabled={!mounted}
            onClick={() => setTheme(option)}
            className={cn(
              "flex flex-1 items-center justify-center rounded-md p-2 transition-colors",
              isActive
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <ThemeToggleIcon theme={option} />
          </button>
        );
      })}
    </div>
  );
}

type ThemeToggleProps = {
  variant?: "dropdown" | "menu";
};

export function ThemeToggle({ variant = "dropdown" }: ThemeToggleProps) {
  const intl = useIntl();
  const { activeTheme, setTheme, triggerTheme } = useThemeToggleState();

  if (variant === "menu") {
    return <ThemeMenuControl />;
  }

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger
          render={
            <DropdownMenuTrigger
              render={
                <Button variant="outline" size="icon-sm" className="rounded-full">
                  <ThemeToggleIcon theme={triggerTheme} />
                  <span className="sr-only">
                    <FormattedMessage {...themeToggleMessages.changeTheme} />
                  </span>
                </Button>
              }
            />
          }
        />
        <TooltipContent side="bottom" align="center">
          <FormattedMessage {...themeToggleMessages.changeTheme} />
        </TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end">
        <DropdownMenuRadioGroup
          aria-label={intl.formatMessage(themeToggleMessages.colorThemeAria)}
          value={activeTheme}
          onValueChange={(value) => setTheme(value as ThemeOption)}
        >
          <DropdownMenuRadioItem value="light">
            <HugeiconsIcon icon={Sun01Icon} strokeWidth={2} className="size-4" />
            <FormattedMessage {...themeToggleMessages.light} />
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark">
            <HugeiconsIcon icon={Moon02Icon} strokeWidth={2} className="size-4" />
            <FormattedMessage {...themeToggleMessages.dark} />
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="system">
            <HugeiconsIcon icon={ComputerIcon} strokeWidth={2} className="size-4" />
            <FormattedMessage {...themeToggleMessages.system} />
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default ThemeToggle;
