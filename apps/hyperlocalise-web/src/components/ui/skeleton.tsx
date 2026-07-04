import { cn } from "@/lib/primitives/cn";

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("animate-pulse rounded-xl bg-skeleton", className)}
      {...props}
    />
  );
}

export { Skeleton };
