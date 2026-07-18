"use client";

import { useIntl } from "react-intl";

import { cn } from "@/lib/primitives/cn";
import { HugeiconsIcon } from "@hugeicons/react";
import type { HugeiconsProps } from "@hugeicons/react";
import { Loading03Icon } from "@hugeicons/core-free-icons";
import { spinnerMessages } from "@/components/ui/spinner.messages";

type SpinnerProps = Omit<HugeiconsProps, "icon">;

function Spinner({ className, ...props }: SpinnerProps) {
  const intl = useIntl();

  return (
    <HugeiconsIcon
      icon={Loading03Icon}
      strokeWidth={2}
      role="status"
      aria-label={intl.formatMessage(spinnerMessages.loading)}
      className={cn("size-4 animate-spin", className)}
      {...props}
    />
  );
}

export { Spinner };
