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
import type { IntlShape } from "@formatjs/intl";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TypographyH1, TypographyP } from "@/components/ui/typography";
import { getIntlShape } from "@/lib/app-i18n/intl";
import { getAppLocale } from "@/lib/app-i18n/server-locale";
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
  openLabel: string;
};

type SettingsRowConfig = {
  description: string;
  href: string;
  icon: ComponentProps<typeof HugeiconsIcon>["icon"];
  label: string;
  requiredCapability?: OrganizationCapability;
};

function buildSettingsRows(intl: IntlShape): readonly SettingsRowConfig[] {
  return [
    {
      label: intl.formatMessage({
        defaultMessage: "Account",
        id: "318/PLILOK",
        description: "Settings hub row label for account settings",
      }),
      description: intl.formatMessage({
        defaultMessage: "Profile details and workspace identity.",
        id: "PnVI3u5zSd",
        description: "Settings hub row description for account settings",
      }),
      href: "account",
      icon: AiUserIcon,
    },
    {
      label: intl.formatMessage({
        defaultMessage: "API Keys",
        id: "Wzlq8Ew/Ii",
        description: "Settings hub row label for API keys",
      }),
      description: intl.formatMessage({
        defaultMessage:
          "Manage API keys for programmatic access to translation jobs and workspace data.",
        id: "5qiaSV4RG8",
        description: "Settings hub row description for API keys",
      }),
      href: "api-keys",
      icon: Key01Icon,
      requiredCapability: "api_keys:read",
    },
    {
      label: intl.formatMessage({
        defaultMessage: "Billing",
        id: "OmGkdjrtzD",
        description: "Settings hub row label for billing",
      }),
      description: intl.formatMessage({
        defaultMessage: "Plan usage, payment method, invoices, and billing contacts.",
        id: "K0I+hdjpXe",
        description: "Settings hub row description for billing",
      }),
      href: "billing",
      icon: CreditCardIcon,
      requiredCapability: "billing:read",
    },
  ];
}

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
        "rounded-lg border border-border bg-muted py-0 text-foreground ring-0",
        className,
      )}
    >
      {children}
    </Card>
  );
}

function SettingsRow({ description, href, icon, isLast, label, openLabel }: SettingsRowProps) {
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
          {openLabel}
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
        className="h-10 rounded-lg border-border bg-muted text-foreground"
      />
    </div>
  );
}

export async function SettingsPageContent({ organizationSlug, capabilities }: SettingsPageProps) {
  const intl = getIntlShape(await getAppLocale());
  const baseHref = `/org/${organizationSlug}/settings`;
  const settingsRows = buildSettingsRows(intl);
  const visibleRows = settingsRows.filter(
    (row) => !row.requiredCapability || capabilities.includes(row.requiredCapability),
  );
  const openLabel = intl.formatMessage({
    defaultMessage: "Open",
    id: "PEy6fPw+25",
    description: "Button to open a settings section from the settings hub",
  });

  return (
    <main className="space-y-5">
      <SettingsHeader
        eyebrow={intl.formatMessage({
          defaultMessage: "Settings",
          id: "UbpdTjGg1W",
          description: "Eyebrow label above the workspace settings hub title",
        })}
        icon={Settings01Icon}
        title={intl.formatMessage({
          defaultMessage: "Settings",
          id: "vE3/OjUVJq",
          description: "Workspace settings hub page heading",
        })}
        description={intl.formatMessage({
          defaultMessage:
            "Review the core controls for this workspace and jump into the area you need to update.",
          id: "JmbIxnhLVK",
          description: "Workspace settings hub page description",
        })}
      />

      <section>
        <SurfaceCard className="gap-0 overflow-hidden">
          {visibleRows.map((row, index) => (
            <SettingsRow
              key={row.href}
              description={row.description}
              href={`${baseHref}/${row.href}`}
              icon={row.icon}
              isLast={index === visibleRows.length - 1}
              label={row.label}
              openLabel={openLabel}
            />
          ))}
        </SurfaceCard>
      </section>
    </main>
  );
}

export async function AccountSettingsPageContent({
  canUpdateWorkspace,
  organizationName,
  organizationSlug,
  userEmail,
  userName,
}: AccountPageProps) {
  const intl = getIntlShape(await getAppLocale());

  return (
    <main className="mx-auto w-full max-w-3xl space-y-8">
      <SettingsHeader
        eyebrow={intl.formatMessage({
          defaultMessage: "Account settings",
          id: "K2pfDUwhXq",
          description: "Eyebrow label above the account settings page title",
        })}
        icon={AiUserIcon}
        title={intl.formatMessage({
          defaultMessage: "Account",
          id: "LRlVY40lAz",
          description: "Account settings page heading",
        })}
        description={intl.formatMessage({
          defaultMessage:
            "Keep the signed-in user and workspace identity easy to verify before agents act on releases.",
          id: "6qCT8hQ6y+",
          description: "Account settings page description",
        })}
      />

      <section className="space-y-4">
        <div>
          <TypographyP className="text-sm font-medium text-foreground">
            {intl.formatMessage({
              defaultMessage: "Profile",
              id: "dwrrquikgT",
              description: "Section heading for the signed-in user profile on account settings",
            })}
          </TypographyP>
          <TypographyP className="mt-1 text-sm text-muted-foreground">
            {intl.formatMessage({
              defaultMessage: "These details come from your WorkOS session.",
              id: "nYeBrRESbk",
              description: "Helper text under the profile section on account settings",
            })}
          </TypographyP>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <ReadonlyField
            label={intl.formatMessage({
              defaultMessage: "Name",
              id: "AfaXCvPHA0",
              description: "Label for the readonly user name field on account settings",
            })}
            value={userName}
          />
          <ReadonlyField
            label={intl.formatMessage({
              defaultMessage: "Email",
              id: "2ynzQ185js",
              description: "Label for the readonly user email field on account settings",
            })}
            value={userEmail}
          />
        </div>
      </section>

      <section className="space-y-4 border-t border-border pt-8">
        <div>
          <TypographyP className="text-sm font-medium text-foreground">
            {intl.formatMessage({
              defaultMessage: "Workspace",
              id: "P8r9mJcX86",
              description: "Section heading for workspace identity on account settings",
            })}
          </TypographyP>
          <TypographyP className="mt-1 text-sm text-muted-foreground">
            {intl.formatMessage({
              defaultMessage: "Public workspace identifiers used in app navigation.",
              id: "Gb58W+mbDk",
              description: "Helper text under the workspace section on account settings",
            })}
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
