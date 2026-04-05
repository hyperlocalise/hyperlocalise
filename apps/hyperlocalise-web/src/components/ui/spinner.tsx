import { cn } from "@/lib/utils";
import { HugeiconsIcon } from "@hugeicons/react";
import type { HugeiconsProps } from "@hugeicons/react";
import { Loading03Icon } from "@hugeicons/core-free-icons";

type SpinnerProps = Omit<HugeiconsProps, "icon">;

function Spinner({ className, ...props }: SpinnerProps) {
  return (
    <HugeiconsIcon
      icon={Loading03Icon}
      strokeWidth={2}
      role="status"
      aria-label="Loading"
      className={cn("size-4 animate-spin", className)}
      {...props}
    />
  );
}

export { Spinner };
