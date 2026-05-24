import type { ComponentProps, ReactNode } from "react";
import Link from "next/link";
import {
  AiSecurity01Icon,
  AiUserIcon,
  ArrowRight01Icon,
  BellDotIcon,
  Building02Icon,
  Calendar03Icon,
  CheckmarkCircle01Icon,
  CreditCardIcon,
  Invoice03Icon,
  Key01Icon,
  Mail01Icon,
  Notification01Icon,
  Settings01Icon,
  Wallet03Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { TypographyH1, TypographyP } from "@/components/ui/typography";

import type { OrganizationCapability } from "@/api/auth/policy";

type SettingsPageProps = {
  organizationSlug: string;
  capabilities: OrganizationCapability[];
};

type AccountPageProps = {
  organizationName: string;
  organizationSlug: string;
  userEmail: string;
  userName: string;
};

type SettingsCardProps = {
  description: string;
  href: string;
  icon: ComponentProps<typeof HugeiconsIcon>["icon"];
  label: string;
  status: string;
};

const settingsCards = [
  {
    label: "Account",
    description: "Profile details, workspace identity, and access posture.",
    href: "account",
    icon: AiUserIcon,
    status: "Configured",
  },
  {
    label: "API Keys",
    description: "Manage API keys for programmatic access to translation jobs and workspace data.",
    href: "api-keys",
    icon: Key01Icon,
    status: "Manage",
    requiredCapability: "api_keys:read" as const,
  },
  {
    label: "Billing",
    description: "Plan usage, payment method, invoices, and billing contacts.",
    href: "billing",
    icon: CreditCardIcon,
    status: "Enterprise",
    requiredCapability: "billing:read" as const,
  },
  {
    label: "Notifications",
    description: "Release alerts, agent updates, and weekly localization digests.",
    href: "notifications",
    icon: Notification01Icon,
    status: "4 active",
  },
] as const;

const notificationRows = [
  {
    label: "Release risk alerts",
    description: "Send an immediate alert when source changes may block a locale release.",
    checked: true,
  },
  {
    label: "Agent action summaries",
    description: "Collect review comments, opened pull requests, and failed fixes into one update.",
    checked: true,
  },
  {
    label: "Weekly localization digest",
    description: "Share throughput, review aging, and language coverage every Monday.",
    checked: true,
  },
  {
    label: "Billing and usage notices",
    description: "Notify workspace owners before plan thresholds or renewal events.",
    checked: false,
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
        <div className="flex items-center gap-2 text-sm text-foreground/48">
          <HugeiconsIcon icon={icon} strokeWidth={1.8} className="size-4" />
          <span>{eyebrow}</span>
        </div>
        <TypographyH1 className="mt-2 font-heading text-2xl font-medium text-foreground md:text-2xl">
          {title}
        </TypographyH1>
        <TypographyP className="mt-2 text-sm leading-6 text-foreground/52">
          {description}
        </TypographyP>
      </div>
    </section>
  );
}

function SurfaceCard({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <Card
      className={`rounded-lg border border-foreground/8 bg-foreground/2.5 py-0 text-foreground ring-0 ${className}`}
    >
      {children}
    </Card>
  );
}

function SettingsCard({ description, href, icon, label, status }: SettingsCardProps) {
  return (
    <SurfaceCard>
      <CardHeader className="gap-4 px-5 py-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-foreground/10 bg-foreground/5">
            <HugeiconsIcon icon={icon} strokeWidth={1.8} className="size-5" />
          </div>
          <Badge
            variant="outline"
            className="rounded-full border-foreground/10 bg-foreground/4 text-foreground/52"
          >
            {status}
          </Badge>
        </div>
        <div>
          <CardTitle className="text-base font-medium text-foreground">{label}</CardTitle>
          <CardDescription className="mt-2 text-sm leading-6 text-foreground/52">
            {description}
          </CardDescription>
        </div>
      </CardHeader>
      <Separator className="bg-foreground/8" />
      <CardContent className="px-5 py-4">
        <Button
          variant="outline"
          className="border-foreground/10 bg-transparent text-foreground/72 hover:bg-foreground/8 hover:text-foreground"
          render={<Link href={href} />}
        >
          Open
          <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={1.7} className="size-4" />
        </Button>
      </CardContent>
    </SurfaceCard>
  );
}

function ReadonlyField({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-2">
      <Label className="text-xs font-medium text-foreground/48">{label}</Label>
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
  const visibleCards = settingsCards.filter(
    (card) => !("requiredCapability" in card) || capabilities.includes(card.requiredCapability),
  );

  return (
    <main className="space-y-5">
      <SettingsHeader
        eyebrow="Settings"
        icon={Settings01Icon}
        title="Settings"
        description="Review the core controls for this workspace and jump into the area you need to update."
      />

      <section className="grid gap-3 md:grid-cols-3">
        {visibleCards.map((card) => (
          <SettingsCard key={card.label} {...card} href={`${baseHref}/${card.href}`} />
        ))}
      </section>

      <SurfaceCard>
        <CardContent className="grid gap-4 px-5 py-5 md:grid-cols-[1fr_16rem] md:items-center">
          <div>
            <TypographyP className="text-sm font-medium text-foreground">
              Workspace readiness
            </TypographyP>
            <TypographyP className="mt-1 text-sm leading-6 text-foreground/48">
              Account identity, billing ownership, and notification routing are ready for release
              operations.
            </TypographyP>
          </div>
          <div className="grid gap-2">
            {["Account profile", "Plan usage", "Release alerts"].map((item) => (
              <div key={item} className="flex items-center gap-2 text-sm text-foreground/62">
                <HugeiconsIcon
                  icon={CheckmarkCircle01Icon}
                  strokeWidth={1.8}
                  className="size-4 text-bud-300"
                />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </SurfaceCard>
    </main>
  );
}

export function AccountSettingsPageContent({
  organizationName,
  organizationSlug,
  userEmail,
  userName,
}: AccountPageProps) {
  return (
    <main className="space-y-5">
      <SettingsHeader
        eyebrow="Account settings"
        icon={AiUserIcon}
        title="Account"
        description="Keep the signed-in user and workspace identity easy to verify before agents act on releases."
      />

      <section className="grid gap-3 lg:grid-cols-[1fr_20rem]">
        <SurfaceCard>
          <CardHeader className="px-5 py-5">
            <CardTitle className="text-lg font-medium text-foreground">Profile</CardTitle>
            <CardDescription className="text-foreground/52">
              These details come from your WorkOS session.
            </CardDescription>
          </CardHeader>
          <Separator className="bg-foreground/8" />
          <CardContent className="grid gap-4 px-5 py-5 sm:grid-cols-2">
            <ReadonlyField label="Name" value={userName} />
            <ReadonlyField label="Email" value={userEmail} />
          </CardContent>
        </SurfaceCard>

        <SurfaceCard>
          <CardHeader className="px-5 py-5">
            <div className="flex size-10 items-center justify-center rounded-lg border border-foreground/10 bg-foreground/5">
              <HugeiconsIcon icon={AiSecurity01Icon} strokeWidth={1.8} className="size-5" />
            </div>
            <CardTitle className="text-base font-medium text-foreground">Access posture</CardTitle>
            <CardDescription className="leading-6 text-foreground/52">
              Authentication and organization access are enforced before every workspace page.
            </CardDescription>
          </CardHeader>
        </SurfaceCard>
      </section>

      <SurfaceCard>
        <CardHeader className="px-5 py-5">
          <CardTitle className="text-lg font-medium text-foreground">Workspace</CardTitle>
          <CardDescription className="text-foreground/52">
            Public workspace identifiers used in app navigation.
          </CardDescription>
        </CardHeader>
        <Separator className="bg-foreground/8" />
        <CardContent className="grid gap-4 px-5 py-5 sm:grid-cols-2">
          <ReadonlyField label="Organization name" value={organizationName} />
          <ReadonlyField label="Workspace slug" value={organizationSlug} />
        </CardContent>
      </SurfaceCard>
    </main>
  );
}

export function BillingSettingsPageContent() {
  return (
    <main className="space-y-5">
      <SettingsHeader
        eyebrow="Billing settings"
        icon={CreditCardIcon}
        title="Billing"
        description="Track plan status, usage, and billing records for localization operations."
      />

      <section className="grid gap-3 lg:grid-cols-[1fr_22rem]">
        <SurfaceCard>
          <CardHeader className="px-5 py-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <CardTitle className="text-lg font-medium text-foreground">
                  Enterprise plan
                </CardTitle>
                <CardDescription className="mt-1 text-foreground/52">
                  1.2M of 2M translated words used this cycle.
                </CardDescription>
              </div>
              <Badge
                variant="outline"
                className="shrink-0 rounded-full border-bud-500/25 bg-bud-500/10 text-bud-100"
              >
                Active
              </Badge>
            </div>
          </CardHeader>
          <Separator className="bg-foreground/8" />
          <CardContent className="px-5 py-5">
            <div className="h-2 overflow-hidden rounded-full bg-foreground/10">
              <div className="h-full w-[60%] rounded-full bg-bud-500" />
            </div>
            <div className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
              <Metric label="Cycle usage" value="60%" />
              <Metric label="Renewal" value="Aug 24, 2027" />
              <Metric label="Billing owner" value="Finance" />
            </div>
          </CardContent>
        </SurfaceCard>

        <SurfaceCard>
          <CardHeader className="px-5 py-5">
            <div className="flex size-10 items-center justify-center rounded-lg border border-foreground/10 bg-foreground/5">
              <HugeiconsIcon icon={Wallet03Icon} strokeWidth={1.8} className="size-5" />
            </div>
            <CardTitle className="text-base font-medium text-foreground">Payment method</CardTitle>
            <CardDescription className="leading-6 text-foreground/52">
              Card and invoice collection will be managed through the billing provider.
            </CardDescription>
          </CardHeader>
          <Separator className="bg-foreground/8" />
          <CardContent className="px-5 py-4">
            <Button
              variant="outline"
              className="border-foreground/10 bg-transparent text-foreground/40"
              disabled
            >
              Manage billing
            </Button>
          </CardContent>
        </SurfaceCard>
      </section>

      <SurfaceCard>
        <CardHeader className="px-5 py-5">
          <CardTitle className="text-lg font-medium text-foreground">Invoices</CardTitle>
          <CardDescription className="text-foreground/52">
            Recent billing documents.
          </CardDescription>
        </CardHeader>
        <Separator className="bg-foreground/8" />
        <CardContent className="divide-y divide-foreground/8 px-5 py-0">
          {["Aug 2025", "Jul 2025", "Jun 2025"].map((invoice) => (
            <div key={invoice} className="flex items-center justify-between gap-4 py-4">
              <div className="flex items-center gap-3">
                <div className="flex size-9 items-center justify-center rounded-lg bg-foreground/5">
                  <HugeiconsIcon icon={Invoice03Icon} strokeWidth={1.8} className="size-4" />
                </div>
                <div>
                  <TypographyP className="text-sm font-medium text-foreground">
                    {invoice}
                  </TypographyP>
                  <TypographyP className="text-xs text-foreground/42">
                    Enterprise workspace subscription
                  </TypographyP>
                </div>
              </div>
              <Badge
                variant="outline"
                className="rounded-full border-foreground/10 bg-foreground/4 text-foreground/52"
              >
                Paid
              </Badge>
            </div>
          ))}
        </CardContent>
      </SurfaceCard>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-foreground/8 bg-foreground/4 px-4 py-3">
      <TypographyP className="text-xs text-foreground/42">{label}</TypographyP>
      <TypographyP className="mt-1 text-sm font-medium text-foreground">{value}</TypographyP>
    </div>
  );
}

export function NotificationSettingsPageContent() {
  return (
    <main className="space-y-5">
      <SettingsHeader
        eyebrow="Notification settings"
        icon={Notification01Icon}
        title="Notifications"
        description="Choose which operational updates reach the people responsible for release quality."
      />

      <section className="grid gap-3 md:grid-cols-3">
        {[
          { label: "Email", value: "Primary channel", icon: Mail01Icon },
          { label: "Workspace", value: "Owner updates", icon: Building02Icon },
          { label: "Digest", value: "Weekly summary", icon: Calendar03Icon },
        ].map((channel) => (
          <SurfaceCard key={channel.label}>
            <CardHeader className="px-5 py-5">
              <div className="flex size-10 items-center justify-center rounded-lg border border-foreground/10 bg-foreground/5">
                <HugeiconsIcon icon={channel.icon} strokeWidth={1.8} className="size-5" />
              </div>
              <CardTitle className="text-base font-medium text-foreground">
                {channel.label}
              </CardTitle>
              <CardDescription className="text-foreground/52">{channel.value}</CardDescription>
            </CardHeader>
          </SurfaceCard>
        ))}
      </section>

      <SurfaceCard>
        <CardHeader className="px-5 py-5">
          <CardTitle className="text-lg font-medium text-foreground">Alert preferences</CardTitle>
          <CardDescription className="text-foreground/52">
            Defaults are shown until notification persistence is connected.
          </CardDescription>
        </CardHeader>
        <Separator className="bg-foreground/8" />
        <CardContent className="divide-y divide-foreground/8 px-5 py-0">
          {notificationRows.map((row) => (
            <div key={row.label} className="flex items-start justify-between gap-4 py-4">
              <div>
                <TypographyP className="text-sm font-medium text-foreground">
                  {row.label}
                </TypographyP>
                <TypographyP className="mt-1 max-w-2xl text-sm leading-6 text-foreground/48">
                  {row.description}
                </TypographyP>
              </div>
              <Switch checked={row.checked} disabled className="mt-1 data-checked:bg-bud-500" />
            </div>
          ))}
        </CardContent>
      </SurfaceCard>

      <SurfaceCard>
        <CardContent className="flex items-start gap-3 px-5 py-4">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-dew-500/10 text-dew-300">
            <HugeiconsIcon icon={BellDotIcon} strokeWidth={1.8} className="size-4" />
          </div>
          <div>
            <TypographyP className="text-sm font-medium text-foreground">
              Notification delivery is scoped.
            </TypographyP>
            <TypographyP className="mt-1 text-sm leading-6 text-foreground/48">
              Release alerts are intended for workspace owners and configured delivery channels.
            </TypographyP>
          </div>
        </CardContent>
      </SurfaceCard>
    </main>
  );
}
