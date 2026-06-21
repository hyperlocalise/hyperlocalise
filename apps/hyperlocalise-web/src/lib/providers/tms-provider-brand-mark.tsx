"use client";

import Image from "next/image";

import { SimpleBrandIcon } from "@/app/[lang]/(authenticated)/org/[organizationSlug]/integrations/_components/simple-brand-icon";
import { cn } from "@/lib/primitives/cn";
import { getTmsProviderBranding } from "@/lib/providers/tms-provider-branding";

type TmsProviderBrandMarkProps = {
  providerKind: string | null | undefined;
  compact?: boolean;
  colored?: boolean;
  className?: string;
};

export function TmsProviderBrandMark({
  providerKind,
  compact = false,
  colored = true,
  className,
}: TmsProviderBrandMarkProps) {
  const branding = getTmsProviderBranding(providerKind);

  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-lg border border-border bg-muted p-1.5 text-foreground",
        compact ? "size-7" : "size-8",
        className,
      )}
    >
      {branding.icon ? (
        <SimpleBrandIcon
          icon={branding.icon}
          colored={colored}
          className={compact ? "size-4" : "size-5"}
        />
      ) : (
        <Image
          src={branding.logo}
          alt=""
          width={compact ? 18 : 20}
          height={compact ? 18 : 20}
          className="max-h-5 w-auto object-contain"
        />
      )}
    </span>
  );
}
