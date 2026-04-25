"use client";

import { useMemo, useState } from "react";
import {
  BotIcon,
  BubbleChatIcon,
  Copy01Icon,
  GoogleIcon,
  MailReceive01Icon,
  MicrosoftIcon,
  SlackIcon,
  TelegramIcon,
  Tick02Icon,
  WhatsappIcon,
  WorkIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { GitHubAgentCard } from "@/components/app/github-agent-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { createApiClient } from "@/lib/api-client";

type AgentPageContentProps = {
  organizationSlug: string;
};

type EmailAgentState = {
  enabled: boolean;
  inboundEmailAddress: string | null;
};

const api = createApiClient();

const comingSoonAgents = [
  {
    name: "Slack agent",
    description: "Triage release requests, answer localization questions, and notify channels.",
    icon: SlackIcon,
  },
  {
    name: "Linear agent",
    description: "Create issues from translation blockers and keep launch tasks in sync.",
    icon: WorkIcon,
  },
  {
    name: "Teams agent",
    description: "Route approvals and status updates through Microsoft Teams workspaces.",
    icon: MicrosoftIcon,
  },
  {
    name: "Google Chat agent",
    description: "Send review prompts and translation status to Google Chat spaces.",
    icon: GoogleIcon,
  },
  {
    name: "Telegram agent",
    description: "Receive lightweight release alerts and approve routine agent actions.",
    icon: TelegramIcon,
  },
  {
    name: "WhatsApp agent",
    description: "Coordinate urgent localization approvals with WhatsApp notifications.",
    icon: WhatsappIcon,
  },
] as const;

function useEmailAgentState(organizationSlug: string) {
  return useQuery({
    queryKey: ["email-agent", organizationSlug],
    queryFn: async () => {
      const res = await api.api.orgs[":organizationSlug"]["agent-email"].$get({
        param: { organizationSlug },
      });

      if (!res.ok) {
        throw new Error("Failed to load email agent settings");
      }

      const data = await res.json();
      return data.emailAgent as EmailAgentState;
    },
  });
}

function useUpdateEmailAgentState(organizationSlug: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (enabled: boolean) => {
      const res = await api.api.orgs[":organizationSlug"]["agent-email"].$patch({
        param: { organizationSlug },
        json: { enabled },
      });

      if (!res.ok) {
        throw new Error("Failed to update email agent settings");
      }

      const data = await res.json();
      return data.emailAgent as EmailAgentState;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["email-agent", organizationSlug] });
    },
  });
}

export function AgentPageContent({ organizationSlug }: AgentPageContentProps) {
  const {
    data: emailAgent,
    isLoading: isEmailAgentLoading,
    isError: isEmailAgentError,
  } = useEmailAgentState(organizationSlug);
  const updateEmailAgentState = useUpdateEmailAgentState(organizationSlug);

  const emailAddress = useMemo(() => emailAgent?.inboundEmailAddress ?? "", [emailAgent]);
  const [copied, setCopied] = useState(false);

  const copyEmailAddress = async () => {
    if (!emailAddress) {
      return;
    }

    await navigator.clipboard.writeText(emailAddress);
    setCopied(true);
    toast.success("Inbound email copied");
    setTimeout(() => setCopied(false), 5000);
  };

  const toggleEnabled = async (enabled: boolean) => {
    try {
      await updateEmailAgentState.mutateAsync(enabled);
      toast.success(enabled ? "Email agent enabled" : "Email agent disabled");
    } catch {
      toast.error("Unable to update email agent right now");
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
      <section className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="max-w-2xl">
          <div className="flex items-center gap-2 text-sm text-white/48">
            <HugeiconsIcon icon={BotIcon} strokeWidth={1.8} className="size-4" />
            <span>Agent setup</span>
          </div>
          <h1 className="mt-2 font-heading text-2xl font-medium text-white">Agent</h1>
          <p className="mt-2 text-sm leading-6 text-white/52">
            Connect the places your team already works so Hyperlocalise can review source changes,
            open fixes, and keep translation workflows moving.
          </p>
        </div>
        <Badge
          variant="outline"
          className="h-8 w-fit rounded-lg border-white/10 bg-white/4 text-white/64"
        >
          2 available
        </Badge>
      </section>

      <section className="grid gap-3 lg:grid-cols-2">
        <GitHubAgentCard organizationSlug={organizationSlug} />

        <Card className="rounded-lg border border-white/8 bg-[#0b0b0b] py-0 text-white ring-0">
          <CardHeader className="gap-4 px-5 py-5 lg:px-6">
            <div className="flex items-start justify-between gap-4">
              <div className="flex min-w-0 items-start gap-3">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/5">
                  <HugeiconsIcon icon={MailReceive01Icon} strokeWidth={1.8} className="size-5" />
                </div>
                <div className="min-w-0">
                  <CardTitle className="text-lg font-medium text-white">Email agent</CardTitle>
                  <CardDescription className="mt-1 text-white/52">
                    Use a unique email address for this workspace to send or forward translation
                    requests with file attachments.
                  </CardDescription>
                </div>
              </div>
              <Switch
                checked={emailAgent?.enabled ?? false}
                onCheckedChange={toggleEnabled}
                aria-label="Enable email agent"
                className="mt-1 data-checked:bg-dew-500"
                disabled={
                  isEmailAgentLoading || isEmailAgentError || updateEmailAgentState.isPending
                }
              />
            </div>
          </CardHeader>
          <Separator className="bg-white/8" />
          <CardContent className="flex flex-col gap-4 px-5 py-5 lg:px-6">
            <div>
              <p className="text-sm font-medium text-white">Enable translation requests by email</p>
              <p className="mt-2 text-sm leading-6 text-white/52">
                Send or forward emails to this address and Hyperlocalise will automatically process
                the request.
              </p>
              {isEmailAgentError ? (
                <p className="mt-2 text-sm text-red-300">
                  Unable to load email agent settings right now.
                </p>
              ) : null}
            </div>

            <div>
              <InputGroup className="h-11 rounded-lg border-white/10 bg-white/3 text-white">
                {isEmailAgentLoading ? (
                  <div className="flex h-full w-full items-center px-3">
                    <Skeleton className="h-4 w-full bg-white/10" />
                  </div>
                ) : (
                  <InputGroupInput
                    readOnly
                    value={emailAddress}
                    aria-label="Email agent intake address"
                    className="truncate text-sm text-white/58"
                    disabled={!emailAgent?.enabled}
                    placeholder={
                      isEmailAgentError
                        ? "Email agent settings unavailable"
                        : "Enable email agent to generate inbox address"
                    }
                  />
                )}
                <InputGroupAddon align="inline-end">
                  <InputGroupButton
                    variant="ghost"
                    size="icon-sm"
                    className="text-white/46 hover:bg-white/8 hover:text-white"
                    onClick={copyEmailAddress}
                    disabled={!emailAgent?.enabled || !emailAddress}
                    aria-label="Copy email address"
                  >
                    <HugeiconsIcon icon={copied ? Tick02Icon : Copy01Icon} strokeWidth={1.8} />
                  </InputGroupButton>
                </InputGroupAddon>
              </InputGroup>
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {comingSoonAgents.map((agent) => (
          <Card
            key={agent.name}
            className="rounded-lg border border-white/8 bg-[#0b0b0b] py-0 text-white ring-0"
          >
            <CardHeader className="gap-4 px-5 py-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/5">
                  <HugeiconsIcon icon={agent.icon} strokeWidth={1.8} className="size-5" />
                </div>
                <Badge
                  variant="outline"
                  className="rounded-full border-white/10 bg-white/4 text-white/52"
                >
                  Coming soon
                </Badge>
              </div>
              <div>
                <CardTitle className="text-base font-medium text-white">{agent.name}</CardTitle>
                <CardDescription className="mt-2 text-sm leading-6 text-white/52">
                  {agent.description}
                </CardDescription>
              </div>
            </CardHeader>
            <Separator className="bg-white/8" />
            <CardContent className="px-5 py-4">
              <Button
                variant="outline"
                className="border-white/10 bg-transparent text-white/40"
                disabled
              >
                Connect
              </Button>
            </CardContent>
          </Card>
        ))}
      </section>

      <Card className="rounded-lg border border-white/8 bg-[#0b0b0b] py-0 text-white ring-0">
        <CardContent className="flex items-start gap-3 px-5 py-4">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-bud-500/10 text-bud-300">
            <HugeiconsIcon icon={BubbleChatIcon} strokeWidth={1.8} className="size-4" />
          </div>
          <div>
            <p className="text-sm font-medium text-white">More agent channels are planned.</p>
            <p className="mt-1 text-sm leading-6 text-white/48">
              Each channel will get its own permissions and setup flow before it can act on behalf
              of the organization.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
