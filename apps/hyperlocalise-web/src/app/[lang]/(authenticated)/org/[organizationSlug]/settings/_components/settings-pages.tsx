import type { ComponentProps, ReactNode } from "react";
import Link from "next/link";
import {
  AiUserIcon,
  ArrowRight01Icon,
  Key01Icon,
  CreditCardIcon,
  Settings01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TypographyH1, TypographyP } from "@/components/ui/typography";
import { cn } from "@/lib/primitives/cn";

import type { OrganizationCapability } from "@/api/auth/policy";
import { WorkspaceSettingsForm } from "./workspace-settings-form";

type SettingsPageProps = {
  organizationSlug: string;
  capabilities: OrganizationCapability[];
};

type AccountPageProps = {
  canUpdateWorkspace: boolean;
  organizationName: string;
  organizationSlug: string;
  userEmail: string;
  userName: string;
};

type SettingsRowProps = {
  description: string;
  href: string;
  icon: ComponentProps<typeof HugeiconsIcon>["icon"];
  isLast: boolean;
  label: string;
};

const settingsRows = [
  {
    label: "Account",
    description: "Profile details and workspace identity.",
    href: "account",
    icon: AiUserIcon,
  },
  {
    label: "API Keys",
    description: "Manage API keys for programmatic access to translation jobs and workspace data.",
    href: "api-keys",
    icon: Key01Icon,
    requiredCapability: "api_keys:read" as const,
  },
  {
    label: "Billing",
    description: "Plan usage, payment method, invoices, and billing contacts.",
    href: "billing",
    icon: CreditCardIcon,
    requiredCapability: "billing:read" as const,
  },
] as const;

function SettingsHeader({
  description,
  eyebrow,
  icon,
  title,
}: {
  description: string;
  eyebrow: string;
  icon: ComponentProps<typeof HugeiconsIcon>["icon"];
  title: string;
}) {
  return (
    <section className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div className="max-w-2xl">
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground antialiased">
          <HugeiconsIcon icon={icon} strokeWidth={1.8} className="size-4 shrink-0" />
          <span>{eyebrow}</span>
        </div>
        <TypographyH1 className="mt-2 font-heading text-2xl font-medium text-foreground md:text-2xl">
          {title}
        </TypographyH1>
        <TypographyP className="mt-2 text-pretty text-sm leading-6 text-muted-foreground">
          {description}
        </TypographyP>
      </div>
    </section>
  );
}

function SurfaceCard({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <Card
      className={cn(
        "rounded-lg border border-foreground/8 bg-foreground/2.5 py-0 text-foreground ring-0",
        className,
      )}
    >
      {children}
    </Card>
  );
}

function SettingsRow({ description, href, icon, isLast, label }: SettingsRowProps) {
  return (
    <div className={cn("flex items-center gap-4 px-5 py-4", !isLast && "border-b border-border")}>
      <div className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-border bg-muted/50 p-2 text-muted-foreground">
        <HugeiconsIcon icon={icon} strokeWidth={1.8} className="size-5" />
      </div>

      <div className="min-w-0 flex-1">
        <p className="text-base font-medium text-foreground">{label}</p>
        <p className="mt-0.5 text-sm leading-6 text-muted-foreground">{description}</p>
      </div>

      <div className="shrink-0">
        <Button variant="outline" size="sm" nativeButton={false} render={<Link href={href} />}>
          Open
          <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={1.7} className="size-4" />
        </Button>
      </div>
    </div>
  );
}

function ReadonlyField({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-2">
      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
      <Input
        readOnly
        value={value}
        className="h-10 rounded-lg border-foreground/10 bg-foreground/4 text-foreground"
      />
    </div>
  );
}

export function SettingsPageContent({ organizationSlug, capabilities }: SettingsPageProps) {
  const baseHref = `/org/${organizationSlug}/settings`;
  const visibleRows = settingsRows.filter(
    (row) => !("requiredCapability" in row) || capabilities.includes(row.requiredCapability),
  );

  return (
    <main className="space-y-5">
      <SettingsHeader
        eyebrow="Settings"
        icon={Settings01Icon}
        title="Settings"
        description="Review the core controls for this workspace and jump into the area you need to update."
      />

      <section>
        <SurfaceCard className="gap-0 overflow-hidden">
          {visibleRows.map((row, index) => (
            <SettingsRow
              key={row.label}
              {...row}
              href={`${baseHref}/${row.href}`}
              isLast={index === visibleRows.length - 1}
            />
          ))}
        </SurfaceCard>
      </section>
    </main>
  );
}

export function AccountSettingsPageContent({
  canUpdateWorkspace,
  organizationName,
  organizationSlug,
  userEmail,
  userName,
}: AccountPageProps) {
  return (
    <main className="mx-auto w-full max-w-3xl space-y-8">
      <SettingsHeader
        eyebrow="Account settings"
        icon={AiUserIcon}
        title="Account"
        description="Keep the signed-in user and workspace identity easy to verify before agents act on releases."
      />

      <section className="space-y-4">
        <div>
          <TypographyP className="text-sm font-medium text-foreground">Profile</TypographyP>
          <TypographyP className="mt-1 text-sm text-muted-foreground">
            These details come from your WorkOS session.
          </TypographyP>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <ReadonlyField label="Name" value={userName} />
          <ReadonlyField label="Email" value={userEmail} />
        </div>
      </section>

      <section className="space-y-4 border-t border-border pt-8">
        <div>
          <TypographyP className="text-sm font-medium text-foreground">Workspace</TypographyP>
          <TypographyP className="mt-1 text-sm text-muted-foreground">
            Public workspace identifiers used in app navigation.
          </TypographyP>
        </div>
        <WorkspaceSettingsForm
          canUpdateWorkspace={canUpdateWorkspace}
          organizationName={organizationName}
          organizationSlug={organizationSlug}
        />
      </section>
    </main>
  );
}
