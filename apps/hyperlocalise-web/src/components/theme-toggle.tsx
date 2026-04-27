"use client";

import * as React from "react";
import { ComputerIcon, Moon02Icon, Sun01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useTheme } from "next-themes";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type ThemeOption = "light" | "dark" | "system";

function ThemeToggleIcon({ theme }: { theme: ThemeOption }) {
  if (theme === "dark") {
    return <HugeiconsIcon icon={Moon02Icon} strokeWidth={2} className="size-4" />;
  }

  if (theme === "system") {
    return <HugeiconsIcon icon={ComputerIcon} strokeWidth={2} className="size-4" />;
  }

  return <HugeiconsIcon icon={Sun01Icon} strokeWidth={2} className="size-4" />;
}

export function ThemeToggle() {
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

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="outline" size="icon-sm" className="rounded-full" />}
      >
        <ThemeToggleIcon theme={triggerTheme} />
        <span className="sr-only">Change theme</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuRadioGroup
          aria-label="Color theme"
          value={activeTheme}
          onValueChange={(value) => setTheme(value as ThemeOption)}
        >
          <DropdownMenuRadioItem value="light">
            <HugeiconsIcon icon={Sun01Icon} strokeWidth={2} className="size-4" />
            Light
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark">
            <HugeiconsIcon icon={Moon02Icon} strokeWidth={2} className="size-4" />
            Dark
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="system">
            <HugeiconsIcon icon={ComputerIcon} strokeWidth={2} className="size-4" />
            System
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default ThemeToggle;
