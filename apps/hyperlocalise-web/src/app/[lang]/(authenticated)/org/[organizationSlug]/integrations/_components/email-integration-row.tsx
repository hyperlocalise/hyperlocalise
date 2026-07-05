"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Copy01Icon, Tick02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { siGmail } from "simple-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useIntl } from "react-intl";
import { toast } from "sonner";

import { emailIntegrationRowMessages } from "./email-integration-row.messages";
import { IntegrationRow } from "./integration-row";
import { SimpleBrandIcon } from "./simple-brand-icon";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { createApiClient } from "@/lib/api-client";
import { TypographyP } from "@/components/ui/typography";

const api = createApiClient();

type EmailAgentState = {
  enabled: boolean;
  inboundEmailAddress: string | null;
};

type EmailIntegrationRowProps = {
  organizationSlug: string;
  isLast?: boolean;
  userCanManage: boolean;
};

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

export function EmailIntegrationRow({
  organizationSlug,
  isLast = false,
  userCanManage,
}: EmailIntegrationRowProps) {
  const intl = useIntl();
  const [expanded, setExpanded] = useState(false);
  const { data: emailAgent, isLoading, isError } = useEmailAgentState(organizationSlug);
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
    toast.success(intl.formatMessage(emailIntegrationRowMessages.inboundEmailCopiedToast));

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
      toast.success(
        intl.formatMessage(
          enabled
            ? emailIntegrationRowMessages.enabledToast
            : emailIntegrationRowMessages.disabledToast,
        ),
      );
      if (enabled) {
        setExpanded(true);
      }
    } catch {
      toast.error(intl.formatMessage(emailIntegrationRowMessages.updateFailedToast));
    }
  };

  const hasAddress = Boolean(emailAgent?.inboundEmailAddress);
  const description = hasAddress
    ? intl.formatMessage(emailIntegrationRowMessages.descriptionReady)
    : intl.formatMessage(emailIntegrationRowMessages.descriptionNotReady);

  const action = !userCanManage
    ? "view-only"
    : hasAddress || emailAgent?.enabled
      ? "manage"
      : "connect";

  return (
    <IntegrationRow
      name={intl.formatMessage(emailIntegrationRowMessages.name)}
      description={description}
      icon={<SimpleBrandIcon icon={siGmail} colored={hasAddress} />}
      iconMuted={!hasAddress}
      action={action}
      expanded={expanded}
      onExpandedChange={setExpanded}
      onConnect={() => void toggleEnabled(true)}
      isConnecting={updateEmailAgentState.isPending}
      isLoading={isLoading}
      isLast={isLast}
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 rounded-lg border border-border bg-background/70 p-3 sm:flex-row sm:items-center sm:justify-between">
          <TypographyP className="text-sm leading-6 text-muted-foreground">
            {intl.formatMessage(emailIntegrationRowMessages.panelInstructions)}
          </TypographyP>
          <Switch
            checked={emailAgent?.enabled ?? false}
            onCheckedChange={toggleEnabled}
            aria-label={intl.formatMessage(emailIntegrationRowMessages.enableEmailAgentAriaLabel)}
            disabled={isLoading || isError || updateEmailAgentState.isPending || !userCanManage}
          />
        </div>

        {isError ? (
          <TypographyP className="text-sm text-destructive">
            {intl.formatMessage(emailIntegrationRowMessages.loadError)}
          </TypographyP>
        ) : null}

        <InputGroup className="h-10 bg-background focus-within:border-primary/40 focus-within:ring-primary/20">
          {isLoading ? (
            <div className="flex h-full w-full items-center px-3">
              <Skeleton className="h-4 w-full" />
            </div>
          ) : (
            <InputGroupInput
              readOnly
              value={emailAddress}
              aria-label={intl.formatMessage(emailIntegrationRowMessages.intakeAddressAriaLabel)}
              className="truncate text-sm"
              disabled={!emailAgent?.enabled}
              placeholder={
                isError
                  ? intl.formatMessage(emailIntegrationRowMessages.placeholderUnavailable)
                  : intl.formatMessage(emailIntegrationRowMessages.placeholderEnable)
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
                    onClick={copyEmailAddress}
                    disabled={!emailAgent?.enabled || !emailAddress}
                    aria-label={intl.formatMessage(
                      copied
                        ? emailIntegrationRowMessages.copiedAriaLabel
                        : emailIntegrationRowMessages.copyAriaLabel,
                    )}
                  >
                    <HugeiconsIcon icon={copied ? Tick02Icon : Copy01Icon} strokeWidth={1.8} />
                  </InputGroupButton>
                }
              />
              <TooltipContent>
                {intl.formatMessage(
                  copied
                    ? emailIntegrationRowMessages.copiedTooltip
                    : emailIntegrationRowMessages.copyTooltip,
                )}
              </TooltipContent>
            </Tooltip>
          </InputGroupAddon>
        </InputGroup>
      </div>
    </IntegrationRow>
  );
}
