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
import { flushSync } from "react-dom";
import { Menu as MenuPrimitive } from "@base-ui/react/menu";
import { DesktopIcon, MoonIcon, SunIcon } from "@phosphor-icons/react";
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

import { themeToggleMessages } from "./theme-toggle.messages";

type ThemeOption = "light" | "dark" | "system";

function ThemeToggleIcon({ theme }: { theme: ThemeOption }) {
  if (theme === "dark") {
    return <MoonIcon className="size-4" />;
  }

  if (theme === "system") {
    return <DesktopIcon className="size-4" />;
  }

  return <SunIcon className="size-4" />;
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

  const changeTheme = React.useCallback(
    (nextTheme: ThemeOption) => {
      if (typeof document.startViewTransition !== "function") {
        setTheme(nextTheme);
        return;
      }

      // Crossfade one snapshot of the page so every surface changes together,
      // instead of only the elements that happen to have color transitions.
      const root = document.documentElement;
      root.dataset.themeTransition = "";
      const transition = document.startViewTransition(() => {
        flushSync(() => setTheme(nextTheme));
      });
      void transition.finished.finally(() => {
        delete root.dataset.themeTransition;
      });
    },
    [setTheme],
  );

  return { activeTheme, mounted, changeTheme, triggerTheme };
}

const THEME_SEGMENTS = [
  { value: "light", icon: SunIcon, label: themeToggleMessages.light },
  { value: "dark", icon: MoonIcon, label: themeToggleMessages.dark },
  { value: "system", icon: DesktopIcon, label: themeToggleMessages.system },
] as const;

/** Icon-only segmented control. Must be rendered inside a `DropdownMenuContent`. */
function ThemeMenuSegmentedControl() {
  const intl = useIntl();
  const { activeTheme, changeTheme } = useThemeToggleState();

  return (
    <MenuPrimitive.RadioGroup
      aria-label={intl.formatMessage(themeToggleMessages.colorThemeAria)}
      value={activeTheme}
      onValueChange={(value) => changeTheme(value as ThemeOption)}
      className="mx-1 my-1 grid grid-cols-3 gap-1 rounded-xl bg-muted p-1"
    >
      {THEME_SEGMENTS.map(({ value, icon: Icon, label }) => (
        <MenuPrimitive.RadioItem
          key={value}
          value={value}
          aria-label={intl.formatMessage(label)}
          title={intl.formatMessage(label)}
          className="flex h-8 cursor-default items-center justify-center rounded-lg text-muted-foreground outline-hidden transition-[background-color,color,box-shadow] duration-150 select-none data-checked:bg-background data-checked:text-foreground data-checked:shadow-sm data-highlighted:text-foreground data-highlighted:ring-2 data-highlighted:ring-ring/40 data-checked:dark:bg-accent"
        >
          <Icon className="size-4" />
        </MenuPrimitive.RadioItem>
      ))}
    </MenuPrimitive.RadioGroup>
  );
}

type ThemeToggleProps = {
  variant?: "dropdown" | "segmented";
};

export function ThemeToggle({ variant = "dropdown" }: ThemeToggleProps) {
  const intl = useIntl();
  const { activeTheme, changeTheme, triggerTheme } = useThemeToggleState();

  if (variant === "segmented") {
    return <ThemeMenuSegmentedControl />;
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
          onValueChange={(value) => changeTheme(value as ThemeOption)}
        >
          <DropdownMenuRadioItem value="light">
            <SunIcon className="size-4" />
            <FormattedMessage {...themeToggleMessages.light} />
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark">
            <MoonIcon className="size-4" />
            <FormattedMessage {...themeToggleMessages.dark} />
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="system">
            <DesktopIcon className="size-4" />
            <FormattedMessage {...themeToggleMessages.system} />
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default ThemeToggle;
