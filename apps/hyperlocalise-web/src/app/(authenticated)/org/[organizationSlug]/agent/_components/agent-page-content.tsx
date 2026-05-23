"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  BotIcon,
  BubbleChatIcon,
  Copy01Icon,
  GoogleIcon,
  MailReceive01Icon,
  MicrosoftIcon,
  TelegramIcon,
  Tick02Icon,
  WhatsappIcon,
  WorkIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { GitHubAgentCard } from "./github-agent-card";
import { SlackAgentCard } from "./slack-agent-card";
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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { createApiClient } from "@/lib/api-client";
import { TypographyH1, TypographyP } from "@/components/ui/typography";

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
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const copyEmailAddress = async () => {
    if (!emailAddress) {
      return;
    }

    await navigator.clipboard.writeText(emailAddress);
    setCopied(true);
    toast.success("Inbound email copied");

    if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    copyTimeoutRef.current = setTimeout(() => setCopied(false), 5000);
  };

  useEffect(
    () => () => {
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    },
    [],
  );

  const toggleEnabled = async (enabled: boolean) => {
    try {
      await updateEmailAgentState.mutateAsync(enabled);
      toast.success(enabled ? "Email agent enabled" : "Email agent disabled");
    } catch {
      toast.error("Unable to update email agent right now");
    }
  };

  return (
    <main className="space-y-5">
      <section className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="max-w-2xl">
          <div className="flex items-center gap-2 text-sm text-foreground/48">
            <HugeiconsIcon icon={BotIcon} strokeWidth={1.8} className="size-4" />
            <span>Agent setup</span>
          </div>
          <TypographyH1 className="mt-2 font-heading text-2xl font-medium text-foreground md:text-2xl">
            Agent
          </TypographyH1>
          <TypographyP className="mt-2 text-sm leading-6 text-foreground/52">
            Connect the places your team already works so Hyperlocalise can review source changes,
            open fixes, and keep translation workflows moving.
          </TypographyP>
        </div>
        <Badge
          variant="outline"
          className="h-8 w-fit rounded-lg border-foreground/10 bg-foreground/4 text-foreground/64"
        >
          3 available
        </Badge>
      </section>

      <section className="grid gap-3 lg:grid-cols-2">
        <GitHubAgentCard organizationSlug={organizationSlug} />
        <SlackAgentCard organizationSlug={organizationSlug} />

        <Card className="rounded-lg border border-foreground/8 bg-foreground/2.5 py-0 text-foreground ring-0">
          <CardHeader className="gap-4 px-5 py-5 lg:px-6">
            <div className="flex items-start justify-between gap-4">
              <div className="flex min-w-0 items-start gap-3">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-foreground/10 bg-foreground/5">
                  <HugeiconsIcon icon={MailReceive01Icon} strokeWidth={1.8} className="size-5" />
                </div>
                <div className="min-w-0">
                  <CardTitle className="text-lg font-medium text-foreground">Email agent</CardTitle>
                  <CardDescription className="mt-1 text-foreground/52">
                    Use a unique workspace address to translate supported files and localize images
                    from email.
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
          <Separator className="bg-foreground/8" />
          <CardContent className="flex flex-col gap-4 px-5 py-5 lg:px-6">
            <div>
              <TypographyP className="text-sm font-medium text-foreground">
                Enable translation requests by email
              </TypographyP>
              <TypographyP className="mt-2 text-sm leading-6 text-foreground/52">
                Send documents, spreadsheets, JSON, text files, or images with a target language.
                Source language is optional, and style notes like tone or terminology are applied to
                file translations.
              </TypographyP>
              {isEmailAgentError ? (
                <TypographyP className="mt-2 text-sm text-red-300">
                  Unable to load email agent settings right now.
                </TypographyP>
              ) : null}
            </div>

            <div>
              <InputGroup className="h-11 rounded-lg border-foreground/10 bg-foreground/3 text-foreground">
                {isEmailAgentLoading ? (
                  <div className="flex h-full w-full items-center px-3">
                    <Skeleton className="h-4 w-full bg-foreground/10" />
                  </div>
                ) : (
                  <InputGroupInput
                    readOnly
                    value={emailAddress}
                    aria-label="Email agent intake address"
                    className="truncate text-sm text-foreground/58"
                    disabled={!emailAgent?.enabled}
                    placeholder={
                      isEmailAgentError
                        ? "Email agent settings unavailable"
                        : "Enable email agent to generate inbox address"
                    }
                  />
                )}
                <InputGroupAddon align="inline-end">
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <InputGroupButton
                          variant="ghost"
                          size="icon-sm"
                          className="text-foreground/46 hover:bg-foreground/8 hover:text-foreground"
                          onClick={copyEmailAddress}
                          disabled={!emailAgent?.enabled || !emailAddress}
                          aria-label={copied ? "Copied!" : "Copy email address"}
                        >
                          <HugeiconsIcon icon={copied ? Tick02Icon : Copy01Icon} strokeWidth={1.8} />
                        </InputGroupButton>
                      }
                    />
                    <TooltipContent>{copied ? "Copied!" : "Copy email address"}</TooltipContent>
                  </Tooltip>
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
            className="rounded-lg border border-foreground/8 bg-foreground/2.5 py-0 text-foreground ring-0"
          >
            <CardHeader className="gap-4 px-5 py-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-foreground/10 bg-foreground/5">
                  <HugeiconsIcon icon={agent.icon} strokeWidth={1.8} className="size-5" />
                </div>
                <Badge
                  variant="outline"
                  className="rounded-full border-foreground/10 bg-foreground/4 text-foreground/52"
                >
                  Coming soon
                </Badge>
              </div>
              <div>
                <CardTitle className="text-base font-medium text-foreground">
                  {agent.name}
                </CardTitle>
                <CardDescription className="mt-2 text-sm leading-6 text-foreground/52">
                  {agent.description}
                </CardDescription>
              </div>
            </CardHeader>
            <Separator className="bg-foreground/8" />
            <CardContent className="px-5 py-4">
              <Button
                variant="outline"
                className="border-foreground/10 bg-transparent text-foreground/40"
                disabled
              >
                Connect
              </Button>
            </CardContent>
          </Card>
        ))}
      </section>

      <Card className="rounded-lg border border-foreground/8 bg-foreground/2.5 py-0 text-foreground ring-0">
        <CardContent className="flex items-start gap-3 px-5 py-4">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-bud-500/10 text-bud-300">
            <HugeiconsIcon icon={BubbleChatIcon} strokeWidth={1.8} className="size-4" />
          </div>
          <div>
            <TypographyP className="text-sm font-medium text-foreground">
              More agent channels are planned.
            </TypographyP>
            <TypographyP className="mt-1 text-sm leading-6 text-foreground/48">
              Each channel will get its own permissions and setup flow before it can act on behalf
              of the organization.
            </TypographyP>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
