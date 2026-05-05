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

type SettingsPageProps = {
  organizationSlug: string;
};

type AccountPageProps = SettingsPageProps & {
  organizationName: string;
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
  },
  {
    label: "Billing",
    description: "Plan usage, payment method, invoices, and billing contacts.",
    href: "billing",
    icon: CreditCardIcon,
    status: "Enterprise",
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
        <div className="flex items-center gap-2 text-sm text-white/48">
          <HugeiconsIcon icon={icon} strokeWidth={1.8} className="size-4" />
          <span>{eyebrow}</span>
        </div>
        <h1 className="mt-2 font-heading text-2xl font-medium text-white">{title}</h1>
        <p className="mt-2 text-sm leading-6 text-white/52">{description}</p>
      </div>
    </section>
  );
}

function SurfaceCard({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <Card
      className={`rounded-lg border border-white/8 bg-[#0b0b0b] py-0 text-white ring-0 ${className}`}
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
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/5">
            <HugeiconsIcon icon={icon} strokeWidth={1.8} className="size-5" />
          </div>
          <Badge
            variant="outline"
            className="rounded-full border-white/10 bg-white/4 text-white/52"
          >
            {status}
          </Badge>
        </div>
        <div>
          <CardTitle className="text-base font-medium text-white">{label}</CardTitle>
          <CardDescription className="mt-2 text-sm leading-6 text-white/52">
            {description}
          </CardDescription>
        </div>
      </CardHeader>
      <Separator className="bg-white/8" />
      <CardContent className="px-5 py-4">
        <Button
          variant="outline"
          className="border-white/10 bg-transparent text-white/72 hover:bg-white/8 hover:text-white"
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
      <Label className="text-xs font-medium text-white/48">{label}</Label>
      <Input
        readOnly
        value={value}
        className="h-10 rounded-lg border-white/10 bg-white/4 text-white"
      />
    </div>
  );
}

export function SettingsPageContent({ organizationSlug }: SettingsPageProps) {
  const baseHref = `/org/${organizationSlug}/settings`;

  return (
    <main className="space-y-5">
      <SettingsHeader
        eyebrow="Settings"
        icon={Settings01Icon}
        title="Settings"
        description="Review the core controls for this workspace and jump into the area you need to update."
      />

      <section className="grid gap-3 md:grid-cols-3">
        {settingsCards.map((card) => (
          <SettingsCard key={card.label} {...card} href={`${baseHref}/${card.href}`} />
        ))}
      </section>

      <SurfaceCard>
        <CardContent className="grid gap-4 px-5 py-5 md:grid-cols-[1fr_16rem] md:items-center">
          <div>
            <p className="text-sm font-medium text-white">Workspace readiness</p>
            <p className="mt-1 text-sm leading-6 text-white/48">
              Account identity, billing ownership, and notification routing are ready for release
              operations.
            </p>
          </div>
          <div className="grid gap-2">
            {["Account profile", "Plan usage", "Release alerts"].map((item) => (
              <div key={item} className="flex items-center gap-2 text-sm text-white/62">
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
            <CardTitle className="text-lg font-medium text-white">Profile</CardTitle>
            <CardDescription className="text-white/52">
              These details come from your WorkOS session.
            </CardDescription>
          </CardHeader>
          <Separator className="bg-white/8" />
          <CardContent className="grid gap-4 px-5 py-5 sm:grid-cols-2">
            <ReadonlyField label="Name" value={userName} />
            <ReadonlyField label="Email" value={userEmail} />
          </CardContent>
        </SurfaceCard>

        <SurfaceCard>
          <CardHeader className="px-5 py-5">
            <div className="flex size-10 items-center justify-center rounded-lg border border-white/10 bg-white/5">
              <HugeiconsIcon icon={AiSecurity01Icon} strokeWidth={1.8} className="size-5" />
            </div>
            <CardTitle className="text-base font-medium text-white">Access posture</CardTitle>
            <CardDescription className="leading-6 text-white/52">
              Authentication and organization access are enforced before every workspace page.
            </CardDescription>
          </CardHeader>
        </SurfaceCard>
      </section>

      <SurfaceCard>
        <CardHeader className="px-5 py-5">
          <CardTitle className="text-lg font-medium text-white">Workspace</CardTitle>
          <CardDescription className="text-white/52">
            Public workspace identifiers used in app navigation.
          </CardDescription>
        </CardHeader>
        <Separator className="bg-white/8" />
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
                <CardTitle className="text-lg font-medium text-white">Enterprise plan</CardTitle>
                <CardDescription className="mt-1 text-white/52">
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
          <Separator className="bg-white/8" />
          <CardContent className="px-5 py-5">
            <div className="h-2 overflow-hidden rounded-full bg-white/10">
              <div className="h-full w-[60%] rounded-full bg-bud-500" />
            </div>
            <div className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
              <Metric label="Cycle usage" value="60%" />
              <Metric label="Renewal" value="Aug 24, 2025" />
              <Metric label="Billing owner" value="Finance" />
            </div>
          </CardContent>
        </SurfaceCard>

        <SurfaceCard>
          <CardHeader className="px-5 py-5">
            <div className="flex size-10 items-center justify-center rounded-lg border border-white/10 bg-white/5">
              <HugeiconsIcon icon={Wallet03Icon} strokeWidth={1.8} className="size-5" />
            </div>
            <CardTitle className="text-base font-medium text-white">Payment method</CardTitle>
            <CardDescription className="leading-6 text-white/52">
              Card and invoice collection will be managed through the billing provider.
            </CardDescription>
          </CardHeader>
          <Separator className="bg-white/8" />
          <CardContent className="px-5 py-4">
            <Button
              variant="outline"
              className="border-white/10 bg-transparent text-white/40"
              disabled
            >
              Manage billing
            </Button>
          </CardContent>
        </SurfaceCard>
      </section>

      <SurfaceCard>
        <CardHeader className="px-5 py-5">
          <CardTitle className="text-lg font-medium text-white">Invoices</CardTitle>
          <CardDescription className="text-white/52">Recent billing documents.</CardDescription>
        </CardHeader>
        <Separator className="bg-white/8" />
        <CardContent className="divide-y divide-white/8 px-5 py-0">
          {["Aug 2025", "Jul 2025", "Jun 2025"].map((invoice) => (
            <div key={invoice} className="flex items-center justify-between gap-4 py-4">
              <div className="flex items-center gap-3">
                <div className="flex size-9 items-center justify-center rounded-lg bg-white/5">
                  <HugeiconsIcon icon={Invoice03Icon} strokeWidth={1.8} className="size-4" />
                </div>
                <div>
                  <p className="text-sm font-medium text-white">{invoice}</p>
                  <p className="text-xs text-white/42">Enterprise workspace subscription</p>
                </div>
              </div>
              <Badge
                variant="outline"
                className="rounded-full border-white/10 bg-white/4 text-white/52"
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
    <div className="rounded-lg border border-white/8 bg-white/4 px-4 py-3">
      <p className="text-xs text-white/42">{label}</p>
      <p className="mt-1 text-sm font-medium text-white">{value}</p>
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
              <div className="flex size-10 items-center justify-center rounded-lg border border-white/10 bg-white/5">
                <HugeiconsIcon icon={channel.icon} strokeWidth={1.8} className="size-5" />
              </div>
              <CardTitle className="text-base font-medium text-white">{channel.label}</CardTitle>
              <CardDescription className="text-white/52">{channel.value}</CardDescription>
            </CardHeader>
          </SurfaceCard>
        ))}
      </section>

      <SurfaceCard>
        <CardHeader className="px-5 py-5">
          <CardTitle className="text-lg font-medium text-white">Alert preferences</CardTitle>
          <CardDescription className="text-white/52">
            Defaults are shown until notification persistence is connected.
          </CardDescription>
        </CardHeader>
        <Separator className="bg-white/8" />
        <CardContent className="divide-y divide-white/8 px-5 py-0">
          {notificationRows.map((row) => (
            <div key={row.label} className="flex items-start justify-between gap-4 py-4">
              <div>
                <p className="text-sm font-medium text-white">{row.label}</p>
                <p className="mt-1 max-w-2xl text-sm leading-6 text-white/48">{row.description}</p>
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
            <p className="text-sm font-medium text-white">Notification delivery is scoped.</p>
            <p className="mt-1 text-sm leading-6 text-white/48">
              Release alerts are intended for workspace owners and configured delivery channels.
            </p>
          </div>
        </CardContent>
      </SurfaceCard>
    </main>
  );
}
