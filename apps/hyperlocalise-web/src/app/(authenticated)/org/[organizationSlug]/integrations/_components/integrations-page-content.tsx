"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import Image from "next/image";
import {
  Alert02Icon,
  ArrowRight01Icon,
  Copy01Icon,
  Delete02Icon,
  Key01Icon,
  SaveIcon,
  Tick02Icon,
} from "@hugeicons/core-free-icons";
import { ChevronDownIcon, EyeIcon, EyeOffIcon } from "lucide-react";
import { HugeiconsIcon } from "@hugeicons/react";
import type { SimpleIcon } from "simple-icons";
import { siAnthropic, siContentful, siCrowdin, siGooglegemini } from "simple-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import type { LlmProvider } from "@/lib/database/types";
import { hasCapability } from "@/api/auth/policy";
import { defaultModelByProvider, llmProviderCatalog } from "@/lib/providers/catalog";

import type { OrganizationMembershipRole } from "@/lib/database/types";
import { createApiClient } from "@/lib/api-client";
import type {
  ExternalTmsProviderCredentialListItem,
  ExternalTmsProviderCredentialSummary,
  ExternalTmsProviderKind,
} from "@/lib/providers/organization-external-tms-provider-credentials";
import { isTmsProviderShellModeEnabled } from "@/lib/providers/tms-provider-shell-mode";
import { CROWDIN_OAUTH_SCOPE_GUIDE } from "@/lib/providers/adapters/crowdin/crowdin-oauth-scopes";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Field, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { TypographyH1 } from "@/components/ui/typography";
import { cn } from "@/lib/primitives/cn";
import {
  CollaborationIntegrationsSection,
  SourceControlIntegrationsSection,
} from "./agent-integrations-section";
import { IntegrationCategoryLabel, integrationConnectButtonClassName } from "./integration-row";
import { SimpleBrandIcon } from "./simple-brand-icon";
import { tmsUserConnectCtaQueryKey } from "../../_hooks/use-tms-user-connect-cta";

const api = createApiClient();

type IntegrationsPageContentProps = {
  organizationSlug: string;
  membershipRole: OrganizationMembershipRole;
  canManageProviderIntegrations: boolean;
  errorCode?: string | null;
};

type IntegrationErrorCopy = {
  title: string;
  description: string;
};

const integrationErrorCopyByCode = {
  crowdin_user_oauth_exchange_failed: {
    title: "Crowdin account link failed",
    description:
      "Crowdin did not return an access token. Check that the OAuth app callback URL, client ID, client secret, and app type match the Crowdin OAuth App configuration.",
  },
  crowdin_user_oauth_invalid: {
    title: "Crowdin account link failed",
    description:
      "Crowdin rejected the access token returned during authorization. Try connecting again, then verify the OAuth app credentials if it repeats.",
  },
  crowdin_user_lookup_failed: {
    title: "Crowdin account link failed",
    description:
      "Hyperlocalise received a token but could not load the authorized Crowdin user. For Crowdin Enterprise, verify the API base URL uses your organization domain.",
  },
  crowdin_integration_not_connected: {
    title: "Crowdin integration is not connected",
    description: "Save the Crowdin OAuth app credentials before linking a user account.",
  },
  crowdin_user_already_linked: {
    title: "Crowdin account already linked",
    description:
      "That Crowdin user is already linked to another Hyperlocalise user in this workspace.",
  },
  missing_crowdin_user_oauth_code: {
    title: "Crowdin account link was cancelled",
    description: "Crowdin did not return an authorization code. Start the connection again.",
  },
} satisfies Record<string, IntegrationErrorCopy>;

function canManageIntegrations(role: OrganizationMembershipRole) {
  return hasCapability(role, "integrations:write");
}

function canManageAgents(role: OrganizationMembershipRole) {
  return hasCapability(role, "provider_credentials:write");
}

function getIntegrationErrorCopy(error: string | null) {
  if (!error) return null;
  return integrationErrorCopyByCode[error as keyof typeof integrationErrorCopyByCode] ?? null;
}

type ProviderCredentialSummary = {
  provider: LlmProvider;
  defaultModel: string;
  maskedApiKeySuffix: string;
  lastValidatedAt: string;
};

type ManagedProviderId = "hyperlocalise-go";
type ProviderOptionId = LlmProvider | ManagedProviderId;

const hyperlocaliseGoProvider = {
  id: "hyperlocalise-go",
  label: "Hyperlocalise GO",
  description: "Managed by Hyperlocalise",
  logo: "/images/logo.png",
} as const;

const byokProviders = [
  {
    id: "openai",
    label: "Open AI",
    description: "Connect your OpenAI account",
    logo: "/images/openai-old-logo.webp",
  },
  {
    id: "anthropic",
    label: "Anthropic",
    description: "Connect your Anthropic account",
    logo: "/images/claude.png",
    icon: siAnthropic,
  },
  {
    id: "gemini",
    label: "Google Gemini",
    description: "Connect your Gemini account",
    logo: "/images/gemini.webp",
    icon: siGooglegemini,
  },
] as const satisfies readonly {
  id: LlmProvider;
  label: string;
  description: string;
  logo: string;
  icon?: SimpleIcon;
}[];

type ModelProviderCardConfig = {
  id: ProviderOptionId;
  label: string;
  description: string;
  logo: string;
  icon?: SimpleIcon;
  managed?: boolean;
};

const modelProviderCards: readonly ModelProviderCardConfig[] = [
  hyperlocaliseGoProvider,
  ...byokProviders,
];

type TmsIntegrationConfig =
  | {
      name: string;
      providerKind: "native";
      detail: string;
      comingSoon: true;
    }
  | {
      name: string;
      providerKind: ExternalTmsProviderKind;
      logo: string;
      icon?: SimpleIcon;
      detail: string;
      comingSoon?: boolean;
    };

const tmsIntegrations: readonly TmsIntegrationConfig[] = [
  {
    name: "Hyperlocalise Native",
    providerKind: "native",
    comingSoon: true,
    detail: "Built-in TMS — projects, jobs, and memories without an external provider.",
  },
  {
    name: "Crowdin",
    providerKind: "crowdin",
    logo: "/images/tms/crowdin.png",
    icon: siCrowdin,
    detail: isTmsProviderShellModeEnabled()
      ? "Connect to browse Crowdin projects and tasks in Hyperlocalise. Data is loaded live; background sync is not enabled yet."
      : "Route reviewed output into Crowdin projects.",
  },
  {
    name: "Lokalise",
    providerKind: "lokalise" as const,
    logo: "/images/tms/lokalise.webp",
    detail: "Projects, branches, and reviewed strings.",
    comingSoon: true,
  },
  {
    name: "Phrase",
    providerKind: "phrase" as const,
    logo: "/images/tms/phrase.png",
    detail: "Sync jobs into existing Phrase workflows.",
    comingSoon: true,
  },
  {
    name: "Smartling",
    providerKind: "smartling" as const,
    logo: "/images/tms/smartling.png",
    detail: "Connect enterprise localization programs.",
    comingSoon: true,
  },
] as const;

const contentfulIntegration = {
  name: "Contentful",
  icon: siContentful,
  detail: "CMS connector for agentic article translation and draft writeback.",
} as const;

type ContentfulConnectionSummary = {
  id: string;
  displayName: string;
  projectId: string;
  spaceId: string;
  environmentId: string;
  sourceLocale: string;
  targetLocales: string[];
  contentTypeIds: string[];
  validationStatus: string;
  validationMessage: string | null;
  maskedTokenSuffix: string;
  webhook: {
    id: string;
    status: string;
    url: string | null;
    lastDeliveryId: string | null;
    lastDeliveredAt: string | null;
    lastError: string | null;
  } | null;
};

type ContentfulConnectionForm = {
  displayName: string;
  projectId: string;
  spaceId: string;
  environmentId: string;
  sourceLocale: string;
  targetLocales: string;
  contentTypeIds: string;
  accessToken: string;
};

function useProviderCredential(organizationSlug: string) {
  return useQuery({
    queryKey: ["provider-credential", organizationSlug],
    queryFn: async () => {
      const res = await api.api.orgs[":organizationSlug"]["provider-credential"].$get({
        param: { organizationSlug },
      });
      if (!res.ok) {
        throw new Error("Failed to fetch provider credential");
      }

      const data = await res.json();
      return data.providerCredential as ProviderCredentialSummary | null;
    },
  });
}

function useSaveProviderCredential(organizationSlug: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: {
      provider: LlmProvider;
      defaultModel: string;
      apiKey: string;
    }) => {
      const res = await api.api.orgs[":organizationSlug"]["provider-credential"].$put({
        param: { organizationSlug },
        json: payload,
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({ error: "provider_validation_failed" }));
        throw new Error(
          "message" in error ? String(error.message) : "Unable to validate provider credential",
        );
      }

      const data = await res.json();
      return data.providerCredential as ProviderCredentialSummary;
    },
    onSuccess: async (_, payload) => {
      await queryClient.invalidateQueries({ queryKey: ["provider-credential", organizationSlug] });
      toast.success(`${llmProviderCatalog[payload.provider].label} provider saved`);
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });
}

function useDeleteProviderCredential(organizationSlug: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const res = await api.api.orgs[":organizationSlug"]["provider-credential"].$delete({
        param: { organizationSlug },
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({ error: "delete_failed" }));
        throw new Error("error" in error ? String(error.error) : "Unable to disconnect provider");
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["provider-credential", organizationSlug] });
      toast.success("LLM provider disconnected");
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });
}

function useExternalTmsCredentials(organizationSlug: string) {
  return useQuery({
    queryKey: ["external-tms-credentials", organizationSlug],
    queryFn: async () => {
      const res = await api.api.orgs[":organizationSlug"]["external-tms-provider-credential"].$get({
        param: { organizationSlug },
      });
      if (!res.ok) {
        throw new Error("Failed to fetch external TMS credentials");
      }

      const data = await res.json();
      return {
        credentials: data.externalTmsProviderCredentials as ExternalTmsProviderCredentialListItem[],
        activeCredential:
          (data.activeExternalTmsProviderCredential as ExternalTmsProviderCredentialSummary | null) ??
          null,
      };
    },
  });
}

function useSaveExternalTmsCredential(organizationSlug: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: {
      providerKind: ExternalTmsProviderKind;
      displayName: string;
      secretMaterial: string;
      region?: string;
      baseUrl?: string;
    }) => {
      const res = await api.api.orgs[":organizationSlug"]["external-tms-provider-credential"].$put({
        param: { organizationSlug },
        json: payload,
      });
      if (!res.ok) {
        const error = await res
          .json()
          .catch(() => ({ error: "external_tms_provider_save_failed" }));
        throw new Error(
          "message" in error ? String(error.message) : "Unable to save external TMS provider",
        );
      }

      const data = await res.json();
      return data.externalTmsProviderCredential;
    },
    onSuccess: async (_, payload) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["external-tms-credentials", organizationSlug],
        }),
        queryClient.invalidateQueries({
          queryKey: ["tms-provider-connection", organizationSlug],
        }),
      ]);
      toast.success(`${payload.displayName} connected`);
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });
}

function useSaveCrowdinOAuthApp(organizationSlug: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: {
      displayName: string;
      oauthClientId: string;
      oauthClientSecret: string;
      baseUrl?: string;
    }) => {
      const res = await api.api.orgs[":organizationSlug"][
        "external-tms-provider-credential"
      ].crowdin["oauth-app"].$post({
        param: { organizationSlug },
        json: payload,
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({ error: "crowdin_oauth_start_failed" }));
        throw new Error(
          "message" in error ? String(error.message) : "Unable to start Crowdin OAuth",
        );
      }

      return res.json();
    },
    onSuccess: async (_, payload) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["external-tms-credentials", organizationSlug],
        }),
        queryClient.invalidateQueries({
          queryKey: ["tms-provider-connection", organizationSlug],
        }),
        queryClient.invalidateQueries({
          queryKey: ["crowdin-user-connection", organizationSlug],
        }),
        queryClient.invalidateQueries({
          queryKey: tmsUserConnectCtaQueryKey(organizationSlug),
        }),
      ]);
      toast.success(`${payload.displayName} saved. Connect your Crowdin account to continue.`);
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });
}

function TmsIntegrationRow({
  integration,
  credential,
  activeExternalProviderKind,
  userIsAdmin,
  expanded,
  onExpandedChange,
  isLast,
  children,
}: {
  integration: TmsIntegrationConfig;
  credential?: ExternalTmsProviderCredentialListItem;
  activeExternalProviderKind?: ExternalTmsProviderKind | null;
  userIsAdmin: boolean;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  isLast: boolean;
  children?: ReactNode;
}) {
  const isConnected = !!credential;
  const isComingSoon = integration.providerKind === "native" || Boolean(integration.comingSoon);
  const integrationProviderKind =
    integration.providerKind === "native" ? null : integration.providerKind;
  const isBlockedByActiveProvider =
    !isComingSoon &&
    integrationProviderKind !== null &&
    integrationProviderKind !== "crowdin" &&
    activeExternalProviderKind !== null &&
    activeExternalProviderKind !== integrationProviderKind &&
    !isConnected;
  const showPanel = userIsAdmin && !isComingSoon && !isBlockedByActiveProvider;

  return (
    <Collapsible
      open={showPanel && expanded}
      onOpenChange={onExpandedChange}
      className={cn(!isLast && "border-b border-border")}
    >
      <div
        className={cn(
          "flex items-center gap-4 px-5 py-4 transition-colors",
          "hover:bg-muted/20",
          expanded && "bg-muted/20",
        )}
      >
        <div
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-lg border border-border p-2",
            isConnected && !isComingSoon
              ? "border-border bg-muted text-foreground"
              : "border-border bg-muted/50 text-muted-foreground",
          )}
        >
          {"icon" in integration && integration.icon ? (
            <SimpleBrandIcon icon={integration.icon} colored={isConnected && !isComingSoon} />
          ) : integration.providerKind === "native" ? (
            <span className="text-sm font-semibold tracking-tight text-foreground">HL</span>
          ) : (
            <Image
              src={integration.logo}
              alt=""
              width={30}
              height={30}
              className={cn(
                "max-h-7 w-auto object-contain",
                (!isConnected || isComingSoon) && "opacity-75",
              )}
            />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-base font-medium text-foreground">{integration.name}</p>
          </div>
          <p className="mt-0.5 text-sm leading-6 text-muted-foreground">{integration.detail}</p>
        </div>

        <div className="shrink-0">
          {isComingSoon ? (
            <Button type="button" variant="outline" size="sm" disabled>
              Coming soon
            </Button>
          ) : isBlockedByActiveProvider ? (
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button type="button" variant="outline" size="sm" disabled>
                    Connect
                  </Button>
                }
              />
              <TooltipContent>Disconnect the current TMS to switch providers.</TooltipContent>
            </Tooltip>
          ) : userIsAdmin && showPanel ? (
            <CollapsibleTrigger
              render={
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className={isConnected ? undefined : integrationConnectButtonClassName}
                >
                  {isConnected ? "Manage" : "Connect"}
                  <ChevronDownIcon
                    className={cn("size-3.5 transition-transform", expanded && "rotate-180")}
                    strokeWidth={2}
                  />
                </Button>
              }
            />
          ) : isConnected ? (
            <Badge variant="outline">View only</Badge>
          ) : (
            <span className="text-sm text-muted-foreground">Admins can connect</span>
          )}
        </div>
      </div>

      {showPanel ? (
        <CollapsibleContent className={cn("border-t px-5 py-5", "border-border bg-muted/20")}>
          {children}
        </CollapsibleContent>
      ) : null}
    </Collapsible>
  );
}

function CmsIntegrationRow({
  connection,
  userIsAdmin,
  expanded,
  onExpandedChange,
  children,
}: {
  connection?: ContentfulConnectionSummary;
  userIsAdmin: boolean;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  children?: ReactNode;
}) {
  const isConnected = Boolean(connection);

  return (
    <Collapsible
      open={userIsAdmin && expanded}
      onOpenChange={onExpandedChange}
      className="border-b border-border last:border-b-0"
    >
      <div
        className={cn(
          "flex items-center gap-4 px-5 py-4 transition-colors",
          "hover:bg-muted/20",
          expanded && "bg-muted/20",
        )}
      >
        <div
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-lg border border-border p-2",
            isConnected
              ? "border-border bg-muted text-foreground"
              : "border-border bg-muted/50 text-muted-foreground",
          )}
        >
          <SimpleBrandIcon icon={contentfulIntegration.icon} colored={isConnected} />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-base font-medium text-foreground">{contentfulIntegration.name}</p>
          </div>
          <p className="mt-0.5 text-sm leading-6 text-muted-foreground">
            {contentfulIntegration.detail}
          </p>
        </div>

        <div className="shrink-0">
          {userIsAdmin ? (
            <CollapsibleTrigger
              render={
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className={isConnected ? undefined : integrationConnectButtonClassName}
                >
                  {isConnected ? "Manage" : "Connect"}
                  <ChevronDownIcon
                    className={cn("size-3.5 transition-transform", expanded && "rotate-180")}
                    strokeWidth={2}
                  />
                </Button>
              }
            />
          ) : isConnected ? (
            <Badge variant="outline">View only</Badge>
          ) : (
            <span className="text-sm text-muted-foreground">Admins can connect</span>
          )}
        </div>
      </div>

      {userIsAdmin ? (
        <CollapsibleContent className={cn("border-t px-5 py-5", "border-border bg-muted/20")}>
          {children}
        </CollapsibleContent>
      ) : null}
    </Collapsible>
  );
}

function CrowdinOAuthSetupFields({
  crowdinRedirectUri,
  redirectUriFieldId,
  redirectUriCopied,
  onCopyRedirectUri,
  oauthClientIdFieldId,
  oauthClientId,
  onOauthClientIdChange,
  oauthClientSecretFieldId,
  oauthClientSecret,
  onOauthClientSecretChange,
  showSecret,
  onToggleShowSecret,
}: {
  crowdinRedirectUri: string;
  redirectUriFieldId: string;
  redirectUriCopied: boolean;
  onCopyRedirectUri: () => void;
  oauthClientIdFieldId: string;
  oauthClientId: string;
  onOauthClientIdChange: (value: string) => void;
  oauthClientSecretFieldId: string;
  oauthClientSecret: string;
  onOauthClientSecretChange: (value: string) => void;
  showSecret: boolean;
  onToggleShowSecret: () => void;
}) {
  return (
    <>
      <Field className="gap-2">
        <FieldLabel htmlFor={redirectUriFieldId}>OAuth callback URL</FieldLabel>
        <InputGroup className="h-10 bg-muted/30">
          <InputGroupInput
            id={redirectUriFieldId}
            readOnly
            tabIndex={-1}
            value={crowdinRedirectUri}
            aria-label="OAuth callback URL"
            className="truncate text-sm cursor-default"
          />
          <InputGroupAddon align="inline-end">
            <Tooltip>
              <TooltipTrigger
                render={
                  <InputGroupButton
                    variant="ghost"
                    size="icon-sm"
                    onClick={onCopyRedirectUri}
                    disabled={!crowdinRedirectUri}
                    aria-label={
                      redirectUriCopied ? "Copied OAuth callback URL" : "Copy OAuth callback URL"
                    }
                  >
                    <HugeiconsIcon
                      icon={redirectUriCopied ? Tick02Icon : Copy01Icon}
                      strokeWidth={1.8}
                    />
                  </InputGroupButton>
                }
              />
              <TooltipContent>
                {redirectUriCopied ? "Copied!" : "Copy OAuth callback URL"}
              </TooltipContent>
            </Tooltip>
          </InputGroupAddon>
        </InputGroup>
      </Field>

      <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-4">
        <div>
          <p className="text-sm font-medium text-foreground">Required OAuth scopes</p>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            In your Crowdin OAuth App, enable every scope below. Hyperlocalise requests the same
            list when you connect Crowdin.
          </p>
        </div>
        <ul className="space-y-2">
          {CROWDIN_OAUTH_SCOPE_GUIDE.map((entry) => (
            <li key={entry.scope} className="flex flex-col gap-1 sm:flex-row sm:gap-3">
              <code className="shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">
                {entry.scope}
              </code>
              <span className="text-sm leading-6 text-muted-foreground">{entry.description}</span>
            </li>
          ))}
        </ul>
      </div>

      <Field className="gap-2">
        <FieldLabel htmlFor={oauthClientIdFieldId}>OAuth client ID</FieldLabel>
        <Input
          id={oauthClientIdFieldId}
          value={oauthClientId}
          onChange={(event) => onOauthClientIdChange(event.target.value)}
          autoComplete="off"
          placeholder="Crowdin OAuth App client ID"
        />
      </Field>

      <Field className="gap-2">
        <FieldLabel htmlFor={oauthClientSecretFieldId}>OAuth client secret</FieldLabel>
        <div className="relative">
          <HugeiconsIcon
            icon={Key01Icon}
            strokeWidth={1.8}
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            id={oauthClientSecretFieldId}
            type={showSecret ? "text" : "password"}
            autoComplete="off"
            value={oauthClientSecret}
            onChange={(event) => onOauthClientSecretChange(event.target.value)}
            placeholder="Crowdin OAuth App client secret"
            className="ps-9 pe-9"
          />
          <button
            type="button"
            onClick={onToggleShowSecret}
            className="absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
            aria-label={showSecret ? "Hide secret" : "Show secret"}
          >
            {showSecret ? <EyeOffIcon size={16} /> : <EyeIcon size={16} />}
          </button>
        </div>
      </Field>
    </>
  );
}

type TmsProviderCredentialPanelProps = {
  providerKind: ExternalTmsProviderKind;
  providerName: string;
  credential?: ExternalTmsProviderCredentialListItem;
  organizationSlug: string;
  userIsAdmin: boolean;
  displayName: string;
  onDisplayNameChange: (value: string) => void;
  secret: string;
  onSecretChange: (value: string) => void;
  oauthClientId: string;
  onOauthClientIdChange: (value: string) => void;
  oauthClientSecret: string;
  onOauthClientSecretChange: (value: string) => void;
  baseUrl: string;
  onBaseUrlChange: (value: string) => void;
  showSecret: boolean;
  onToggleShowSecret: () => void;
  onDisconnect: () => void;
  onSave: () => void;
  isSaving: boolean;
  isDisconnecting: boolean;
  displayNameFieldId: string;
  secretFieldId: string;
  oauthClientIdFieldId: string;
  oauthClientSecretFieldId: string;
  redirectUriFieldId: string;
  baseUrlFieldId: string;
};

function TmsProviderCredentialPanel({
  providerKind,
  providerName,
  credential,
  organizationSlug,
  userIsAdmin,
  displayName,
  onDisplayNameChange,
  secret,
  onSecretChange,
  oauthClientId,
  onOauthClientIdChange,
  oauthClientSecret,
  onOauthClientSecretChange,
  baseUrl,
  onBaseUrlChange,
  showSecret,
  onToggleShowSecret,
  onDisconnect,
  onSave,
  isSaving,
  isDisconnecting,
  displayNameFieldId,
  secretFieldId,
  oauthClientIdFieldId,
  oauthClientSecretFieldId,
  redirectUriFieldId,
  baseUrlFieldId,
}: TmsProviderCredentialPanelProps) {
  const isCrowdin = providerKind === "crowdin";
  const crowdinRedirectUri =
    typeof window === "undefined"
      ? ""
      : `${window.location.origin}/api/orgs/${encodeURIComponent(organizationSlug)}/external-tms-provider-credential/crowdin/oauth/callback`;
  const [redirectUriCopied, setRedirectUriCopied] = useState(false);
  const [advancedSettingsOpen, setAdvancedSettingsOpen] = useState(false);
  const redirectUriCopyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (redirectUriCopyTimeoutRef.current) {
        clearTimeout(redirectUriCopyTimeoutRef.current);
      }
    };
  }, []);

  const copyCrowdinRedirectUri = async () => {
    if (!crowdinRedirectUri) {
      return;
    }

    await navigator.clipboard.writeText(crowdinRedirectUri);
    setRedirectUriCopied(true);
    toast.success("OAuth callback URL copied");

    if (redirectUriCopyTimeoutRef.current) {
      clearTimeout(redirectUriCopyTimeoutRef.current);
    }

    redirectUriCopyTimeoutRef.current = setTimeout(() => {
      setRedirectUriCopied(false);
    }, 2000);
  };

  const isCrowdinOAuthConnected = isCrowdin && credential?.authMode === "oauth";
  const [crowdinReconnectOpen, setCrowdinReconnectOpen] = useState(false);
  const showCrowdinOAuthSetupFields = !isCrowdinOAuthConnected || crowdinReconnectOpen;

  const canSubmit = isCrowdin
    ? isCrowdinOAuthConnected && !crowdinReconnectOpen
      ? false
      : Boolean(displayName.trim() && oauthClientId.trim() && oauthClientSecret.trim())
    : Boolean(displayName.trim() && secret.trim());

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(event) => {
        event.preventDefault();
        onSave();
      }}
    >
      {isCrowdin && isCrowdinOAuthConnected ? (
        <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-4 text-sm">
          <p className="font-medium text-foreground">Crowdin is connected via OAuth</p>
          <p className="leading-6 text-muted-foreground">
            Access and refresh tokens are stored encrypted. Projects, jobs, glossaries, and
            translation memories load live from Crowdin when you open those pages.
          </p>
          {credential.oauthExpiresAt ? (
            <p className="text-xs text-muted-foreground">
              Access token expires {new Date(credential.oauthExpiresAt).toLocaleString()}
            </p>
          ) : null}
        </div>
      ) : null}

      {isCrowdin && !isCrowdinOAuthConnected ? (
        <p className="text-sm leading-6 text-muted-foreground">
          {isTmsProviderShellModeEnabled()
            ? `Connect ${providerName} with a Crowdin OAuth App. Projects, jobs, glossaries, and translation memories load live from Crowdin — background sync and webhooks stay off in this phase.`
            : `Connect ${providerName} with a Crowdin OAuth App created in your Crowdin account. Personal token setup is deprecated in Hyperlocalise.`}
        </p>
      ) : !isCrowdin ? (
        <p className="text-sm leading-6 text-muted-foreground">
          Save credentials to connect {providerName}. The secret is encrypted at rest and used to
          sync projects, files, and jobs into the workspace.
        </p>
      ) : null}

      <Field className="gap-2">
        <FieldLabel htmlFor={displayNameFieldId}>Display name</FieldLabel>
        <Input
          id={displayNameFieldId}
          value={displayName}
          onChange={(event) => onDisplayNameChange(event.target.value)}
          placeholder="e.g. Crowdin Production"
        />
      </Field>

      {isCrowdin && isCrowdinOAuthConnected ? (
        <Collapsible open={crowdinReconnectOpen} onOpenChange={setCrowdinReconnectOpen}>
          <CollapsibleTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 w-full justify-between px-2 text-muted-foreground hover:text-foreground"
              >
                Reconnect with a different OAuth app
                <ChevronDownIcon
                  className={cn(
                    "size-3.5 shrink-0 transition-transform",
                    crowdinReconnectOpen && "rotate-180",
                  )}
                  strokeWidth={2}
                />
              </Button>
            }
          />
          <CollapsibleContent className="space-y-5 pt-3">
            <CrowdinOAuthSetupFields
              crowdinRedirectUri={crowdinRedirectUri}
              redirectUriFieldId={redirectUriFieldId}
              redirectUriCopied={redirectUriCopied}
              onCopyRedirectUri={() => {
                void copyCrowdinRedirectUri();
              }}
              oauthClientIdFieldId={oauthClientIdFieldId}
              oauthClientId={oauthClientId}
              onOauthClientIdChange={onOauthClientIdChange}
              oauthClientSecretFieldId={oauthClientSecretFieldId}
              oauthClientSecret={oauthClientSecret}
              onOauthClientSecretChange={onOauthClientSecretChange}
              showSecret={showSecret}
              onToggleShowSecret={onToggleShowSecret}
            />
          </CollapsibleContent>
        </Collapsible>
      ) : null}

      {isCrowdin && showCrowdinOAuthSetupFields && !isCrowdinOAuthConnected ? (
        <CrowdinOAuthSetupFields
          crowdinRedirectUri={crowdinRedirectUri}
          redirectUriFieldId={redirectUriFieldId}
          redirectUriCopied={redirectUriCopied}
          onCopyRedirectUri={() => {
            void copyCrowdinRedirectUri();
          }}
          oauthClientIdFieldId={oauthClientIdFieldId}
          oauthClientId={oauthClientId}
          onOauthClientIdChange={onOauthClientIdChange}
          oauthClientSecretFieldId={oauthClientSecretFieldId}
          oauthClientSecret={oauthClientSecret}
          onOauthClientSecretChange={onOauthClientSecretChange}
          showSecret={showSecret}
          onToggleShowSecret={onToggleShowSecret}
        />
      ) : null}

      {!isCrowdin ? (
        <Field className="gap-2">
          <FieldLabel htmlFor={secretFieldId}>API token / secret</FieldLabel>
          <div className="relative">
            <HugeiconsIcon
              icon={Key01Icon}
              strokeWidth={1.8}
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              id={secretFieldId}
              type={showSecret ? "text" : "password"}
              autoComplete="off"
              value={secret}
              onChange={(event) => onSecretChange(event.target.value)}
              placeholder="Enter provider API token"
              className="ps-9 pe-9"
            />
            <button
              type="button"
              onClick={onToggleShowSecret}
              className="absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
              aria-label={showSecret ? "Hide secret" : "Show secret"}
            >
              {showSecret ? <EyeOffIcon size={16} /> : <EyeIcon size={16} />}
            </button>
          </div>
        </Field>
      ) : null}

      <Collapsible open={advancedSettingsOpen} onOpenChange={setAdvancedSettingsOpen}>
        <CollapsibleTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 w-full justify-between px-2 text-muted-foreground hover:text-foreground"
            >
              Advanced settings
              <ChevronDownIcon
                className={cn(
                  "size-3.5 shrink-0 transition-transform",
                  advancedSettingsOpen && "rotate-180",
                )}
                strokeWidth={2}
              />
            </Button>
          }
        />
        <CollapsibleContent className="pt-1">
          <Field className="gap-2">
            <FieldLabel htmlFor={baseUrlFieldId}>Base URL (optional)</FieldLabel>
            <Input
              id={baseUrlFieldId}
              value={baseUrl}
              onChange={(event) => onBaseUrlChange(event.target.value)}
              placeholder="https://api.example.com"
            />
          </Field>
        </CollapsibleContent>
      </Collapsible>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        {credential && userIsAdmin ? (
          <Button type="button" variant="outline" onClick={onDisconnect} disabled={isDisconnecting}>
            <HugeiconsIcon icon={Delete02Icon} strokeWidth={1.8} />
            Disconnect
          </Button>
        ) : (
          <div />
        )}
        <Button type="submit" disabled={!canSubmit || isSaving} className="sm:ms-auto">
          <HugeiconsIcon icon={SaveIcon} strokeWidth={1.8} />
          {isSaving
            ? "Saving..."
            : isCrowdin
              ? isCrowdinOAuthConnected
                ? "Update Crowdin"
                : "Save Crowdin"
              : "Save provider"}
        </Button>
      </div>
    </form>
  );
}

function ModelProviderCard({
  provider,
  isActive,
  isManaged,
  footerLabel,
  onSelect,
  disabled,
}: {
  provider: ModelProviderCardConfig;
  isActive: boolean;
  isManaged?: boolean;
  footerLabel?: string;
  onSelect: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      className={cn(
        "group relative flex min-h-44 w-full flex-col rounded-lg border border-border bg-card p-5 text-left text-card-foreground transition-colors",
        "hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60",
        isActive && "border-foreground",
      )}
    >
      {isActive ? (
        <Badge
          variant="outline"
          className={cn(
            "absolute top-4 right-4 text-[10px]",
            "border-grove-500/35 bg-grove-100 text-grove-900 dark:border-grove-300/20 dark:bg-grove-300/10 dark:text-grove-300",
          )}
        >
          Active
        </Badge>
      ) : null}

      <div
        className={cn(
          "flex size-10 shrink-0 items-center justify-center rounded-lg border border-border p-2",
          isActive ? "bg-muted text-foreground" : "bg-background text-foreground",
        )}
      >
        {provider.icon ? (
          <SimpleBrandIcon icon={provider.icon} colored={isActive} />
        ) : (
          <Image
            src={provider.logo}
            alt=""
            width={28}
            height={28}
            className={cn("max-h-7 w-auto object-contain", !isActive && "opacity-75")}
          />
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className="text-base font-medium text-foreground">{provider.label}</span>
        {isManaged ? (
          <Badge variant="outline" className="text-[10px]">
            Managed
          </Badge>
        ) : null}
      </div>

      <p className="mt-1 text-sm text-muted-foreground">{provider.description}</p>

      <div className="mt-auto flex items-center justify-end gap-1 pt-6 text-sm text-muted-foreground">
        {footerLabel ? <span>{footerLabel}</span> : null}
        <HugeiconsIcon
          icon={ArrowRight01Icon}
          strokeWidth={1.8}
          className="size-4 transition-transform group-hover:translate-x-0.5 group-disabled:translate-x-0"
        />
      </div>
    </button>
  );
}

function useDeleteExternalTmsCredential(organizationSlug: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (providerKind: ExternalTmsProviderKind) => {
      const res = await api.api.orgs[":organizationSlug"]["external-tms-provider-credential"][
        ":providerKind"
      ].$delete({
        param: { organizationSlug, providerKind },
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({ error: "delete_failed" }));
        throw new Error("error" in error ? String(error.error) : "Unable to disconnect provider");
      }
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["external-tms-credentials", organizationSlug],
        }),
        queryClient.invalidateQueries({
          queryKey: ["tms-provider-connection", organizationSlug],
        }),
      ]);
      toast.success("Provider disconnected");
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });
}

function useContentfulConnections(organizationSlug: string) {
  return useQuery({
    queryKey: ["contentful-connections", organizationSlug],
    queryFn: async () => {
      const res = await api.api.orgs[":organizationSlug"]["contentful-connections"].$get({
        param: { organizationSlug },
      });
      if (!res.ok) {
        throw new Error("Failed to fetch Contentful connections");
      }
      const data = await res.json();
      return data.contentfulConnections as ContentfulConnectionSummary[];
    },
  });
}

function useSaveContentfulConnection(organizationSlug: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: {
      projectId: string;
      displayName: string;
      spaceId: string;
      environmentId: string;
      sourceLocale: string;
      targetLocales: string[];
      contentTypeIds: string[];
      accessToken: string;
    }) => {
      const res = await api.api.orgs[":organizationSlug"]["contentful-connections"].$post({
        param: { organizationSlug },
        json: {
          ...payload,
          fieldConfig: { fieldMode: "auto", overwriteDraftLocales: false },
          enabled: true,
        },
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({ error: "contentful_connection_failed" }));
        throw new Error(
          "message" in error ? String(error.message) : "Unable to save Contentful connection",
        );
      }
      return res.json();
    },
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({
        queryKey: ["contentful-connections", organizationSlug],
      });
      toast.success("Contentful connection saved");
      if (result.webhookSecret) {
        toast.message("Contentful webhook secret generated", {
          description: "Use the displayed secret when creating the Contentful webhook.",
        });
      }
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });
}

function ContentfulConnectionPanel({
  connection,
  disabled,
  lastWebhookSecret,
  onSave,
  isSaving,
  form,
  onFormChange,
}: {
  connection?: ContentfulConnectionSummary;
  disabled: boolean;
  lastWebhookSecret: string;
  onSave: () => void;
  isSaving: boolean;
  form: ContentfulConnectionForm;
  onFormChange: (form: ContentfulConnectionForm) => void;
}) {
  return (
    <div className="flex flex-col gap-5">
      {connection ? (
        <div className="flex flex-wrap gap-2 text-xs">
          <Badge variant="outline">Token ...{connection.maskedTokenSuffix}</Badge>
          <Badge variant="outline">
            {connection.spaceId}/{connection.environmentId}
          </Badge>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Field className="gap-2">
          <FieldLabel>Display name</FieldLabel>
          <Input
            value={form.displayName}
            disabled={disabled}
            placeholder="Contentful Help Center"
            onChange={(event) => onFormChange({ ...form, displayName: event.target.value })}
          />
        </Field>
        <Field className="gap-2">
          <FieldLabel>Project ID</FieldLabel>
          <Input
            value={form.projectId}
            disabled={disabled}
            placeholder="Hyperlocalise project ID"
            onChange={(event) => onFormChange({ ...form, projectId: event.target.value })}
          />
        </Field>
        <Field className="gap-2">
          <FieldLabel>Space ID</FieldLabel>
          <Input
            value={form.spaceId}
            disabled={disabled}
            onChange={(event) => onFormChange({ ...form, spaceId: event.target.value })}
          />
        </Field>
        <Field className="gap-2">
          <FieldLabel>Environment ID</FieldLabel>
          <Input
            value={form.environmentId}
            disabled={disabled}
            placeholder="master"
            onChange={(event) => onFormChange({ ...form, environmentId: event.target.value })}
          />
        </Field>
        <Field className="gap-2">
          <FieldLabel>Source locale</FieldLabel>
          <Input
            value={form.sourceLocale}
            disabled={disabled}
            placeholder="en-US"
            onChange={(event) => onFormChange({ ...form, sourceLocale: event.target.value })}
          />
        </Field>
        <Field className="gap-2">
          <FieldLabel>Target locales</FieldLabel>
          <Input
            value={form.targetLocales}
            disabled={disabled}
            placeholder="fr-FR, de-DE"
            onChange={(event) => onFormChange({ ...form, targetLocales: event.target.value })}
          />
        </Field>
        <Field className="gap-2">
          <FieldLabel>Content type IDs</FieldLabel>
          <Input
            value={form.contentTypeIds}
            disabled={disabled}
            placeholder="helpCenterArticle"
            onChange={(event) => onFormChange({ ...form, contentTypeIds: event.target.value })}
          />
        </Field>
        <Field className="gap-2">
          <FieldLabel>Management API token</FieldLabel>
          <Input
            type="password"
            value={form.accessToken}
            disabled={disabled}
            autoComplete="off"
            onChange={(event) => onFormChange({ ...form, accessToken: event.target.value })}
          />
        </Field>
      </div>

      {connection?.webhook ? (
        <div className="text-sm">
          <h4 className="font-medium">Webhook setup</h4>
          <p className="mt-1 text-xs text-muted-foreground">
            In Contentful, create a webhook for entry publish/save events and add a custom header
            named <code>x-hyperlocalise-webhook-secret</code>.
          </p>
          <div className="mt-3 grid gap-2 rounded-lg bg-muted/50 p-3 text-xs">
            <span className="font-mono break-all">
              URL: {connection.webhook.url ?? "Set HYPERLOCALISE_PUBLIC_APP_URL"}
            </span>
            {lastWebhookSecret ? (
              <span className="font-mono break-all">Secret: {lastWebhookSecret}</span>
            ) : (
              <span className="text-muted-foreground">
                Secret is only shown when the webhook subscription is first created.
              </span>
            )}
            <span>Last delivery: {connection.webhook.lastDeliveredAt ?? "No deliveries yet"}</span>
          </div>
        </div>
      ) : null}

      <div className="flex justify-end">
        <Button type="button" disabled={disabled || isSaving} onClick={onSave}>
          <HugeiconsIcon icon={SaveIcon} strokeWidth={1.8} />
          {isSaving ? "Saving..." : connection ? "Update connection" : "Save connection"}
        </Button>
      </div>
    </div>
  );
}

export function IntegrationsPageContent({
  organizationSlug,
  membershipRole,
  canManageProviderIntegrations,
  errorCode,
}: IntegrationsPageContentProps) {
  const integrationError = getIntegrationErrorCopy(errorCode ?? null);
  const { data: credential, isLoading } = useProviderCredential(organizationSlug);
  const saveCredential = useSaveProviderCredential(organizationSlug);
  const deleteCredential = useDeleteProviderCredential(organizationSlug);
  const [selectedProvider, setSelectedProvider] = useState<ProviderOptionId | null>(null);
  const [selectedModel, setSelectedModel] = useState(defaultModelByProvider.openai);
  const [apiKey, setApiKey] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);

  const modelFieldId = useId();
  const apiKeyFieldId = useId();

  const { data: externalTmsCredentialState, isLoading: isLoadingExternalTms } =
    useExternalTmsCredentials(organizationSlug);
  const externalTmsCredentials = externalTmsCredentialState?.credentials;
  const activeExternalTmsProviderCredential = externalTmsCredentialState?.activeCredential ?? null;
  const { data: contentfulConnections, isLoading: isLoadingContentful } =
    useContentfulConnections(organizationSlug);
  const saveExternalTms = useSaveExternalTmsCredential(organizationSlug);
  const saveCrowdinOAuthApp = useSaveCrowdinOAuthApp(organizationSlug);
  const saveContentfulConnection = useSaveContentfulConnection(organizationSlug);
  const deleteExternalTms = useDeleteExternalTmsCredential(organizationSlug);
  const [expandedTmsProvider, setExpandedTmsProvider] = useState<ExternalTmsProviderKind | null>(
    null,
  );
  const [tmsDisplayName, setTmsDisplayName] = useState("");
  const [tmsSecret, setTmsSecret] = useState("");
  const [tmsOauthClientId, setTmsOauthClientId] = useState("");
  const [tmsOauthClientSecret, setTmsOauthClientSecret] = useState("");
  const [tmsBaseUrl, setTmsBaseUrl] = useState("");
  const [showTmsSecret, setShowTmsSecret] = useState(false);
  const [disconnectingTmsProvider, setDisconnectingTmsProvider] =
    useState<ExternalTmsProviderKind | null>(null);
  const [contentfulForm, setContentfulForm] = useState<ContentfulConnectionForm>({
    displayName: "Contentful Help Center",
    projectId: "",
    spaceId: "",
    environmentId: "master",
    sourceLocale: "en-US",
    targetLocales: "",
    contentTypeIds: "helpCenterArticle",
    accessToken: "",
  });
  const [lastContentfulWebhookSecret, setLastContentfulWebhookSecret] = useState("");
  const [expandedContentful, setExpandedContentful] = useState(false);

  const tmsDisplayNameFieldId = useId();
  const tmsSecretFieldId = useId();
  const tmsOauthClientIdFieldId = useId();
  const tmsOauthClientSecretFieldId = useId();
  const tmsOauthRedirectUriFieldId = useId();
  const tmsBaseUrlFieldId = useId();
  const userIsAdmin = canManageIntegrations(membershipRole);
  const userCanManageAgents = canManageAgents(membershipRole);

  useEffect(() => {
    if (!credential || selectedProvider !== credential.provider) {
      return;
    }

    setSelectedModel(credential.defaultModel);
  }, [credential, selectedProvider]);

  useEffect(() => {
    if (!selectedProvider || selectedProvider === hyperlocaliseGoProvider.id) {
      return;
    }

    if (
      !(llmProviderCatalog[selectedProvider].models as readonly string[]).includes(selectedModel)
    ) {
      setSelectedModel(defaultModelByProvider[selectedProvider]);
    }
  }, [selectedModel, selectedProvider]);

  const selectedByokProvider =
    selectedProvider && selectedProvider !== hyperlocaliseGoProvider.id ? selectedProvider : null;
  const selectedProviderConfig = selectedByokProvider
    ? llmProviderCatalog[selectedByokProvider]
    : null;
  const selectedProviderLabel =
    byokProviders.find((provider) => provider.id === selectedByokProvider)?.label ??
    selectedProviderConfig?.label;
  const disconnectingTmsProviderName = disconnectingTmsProvider
    ? tmsIntegrations.find((integration) => integration.providerKind === disconnectingTmsProvider)
        ?.name
    : null;
  function loadTmsProviderForm(
    providerKind: ExternalTmsProviderKind,
    existingCredential?: ExternalTmsProviderCredentialListItem,
  ) {
    setTmsDisplayName(existingCredential?.displayName ?? "");
    setTmsSecret("");
    setTmsOauthClientId("");
    setTmsOauthClientSecret("");
    setTmsBaseUrl(existingCredential?.baseUrl ?? "");
    setShowTmsSecret(false);
  }

  function loadContentfulForm(existingConnection?: ContentfulConnectionSummary) {
    setContentfulForm({
      displayName: existingConnection?.displayName ?? "Contentful Help Center",
      projectId: existingConnection?.projectId ?? "",
      spaceId: existingConnection?.spaceId ?? "",
      environmentId: existingConnection?.environmentId ?? "master",
      sourceLocale: existingConnection?.sourceLocale ?? "en-US",
      targetLocales: existingConnection?.targetLocales.join(", ") ?? "",
      contentTypeIds: existingConnection?.contentTypeIds.join(", ") ?? "helpCenterArticle",
      accessToken: "",
    });
  }

  function handleContentfulExpandedChange(expanded: boolean) {
    if (expanded) {
      loadContentfulForm(contentfulConnections?.[0]);
      setExpandedContentful(true);
      return;
    }

    setExpandedContentful(false);
  }

  function handleTmsExpandedChange(
    providerKind: ExternalTmsProviderKind,
    existingCredential: ExternalTmsProviderCredentialListItem | undefined,
    expanded: boolean,
  ) {
    if (expanded) {
      loadTmsProviderForm(providerKind, existingCredential);
      setExpandedTmsProvider(providerKind);
      return;
    }

    setExpandedTmsProvider(null);
    setShowTmsSecret(false);
  }

  return (
    <main className="space-y-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <TypographyH1 className="font-heading text-2xl font-medium text-foreground md:text-2xl">
          Integrations
        </TypographyH1>
        <Badge variant="outline" className="rounded-full lg:self-start">
          Workspace level
        </Badge>
      </div>

      {integrationError ? (
        <div
          role="alert"
          className="flex gap-3 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive"
        >
          <HugeiconsIcon icon={Alert02Icon} strokeWidth={1.8} className="mt-0.5 size-4 shrink-0" />
          <div className="space-y-1">
            <p className="font-medium">{integrationError.title}</p>
            <p className="leading-6 text-destructive/80">{integrationError.description}</p>
          </div>
        </div>
      ) : null}

      <SourceControlIntegrationsSection
        organizationSlug={organizationSlug}
        userCanManage={userCanManageAgents}
      />

      {canManageProviderIntegrations ? (
        <>
          <section className="flex flex-col gap-3">
            <IntegrationCategoryLabel>Translation Management System</IntegrationCategoryLabel>

            {isLoadingExternalTms ? (
              <div className="overflow-hidden rounded-lg border border-border bg-card text-card-foreground">
                {tmsIntegrations.map((integration, index) => (
                  <div
                    key={integration.name}
                    className={cn("px-5 py-4", index > 0 && "border-t border-border")}
                  >
                    <Skeleton className="h-14 rounded-lg" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="overflow-hidden rounded-lg border border-border bg-card text-card-foreground">
                {tmsIntegrations.map((integration, index) => {
                  const tmsCredential =
                    integration.providerKind === "native"
                      ? undefined
                      : externalTmsCredentials?.find(
                          (item) => item.providerKind === integration.providerKind,
                        );

                  return (
                    <TmsIntegrationRow
                      key={integration.name}
                      integration={integration}
                      credential={tmsCredential}
                      activeExternalProviderKind={activeExternalTmsProviderCredential?.providerKind}
                      userIsAdmin={userIsAdmin}
                      isLast={index === tmsIntegrations.length - 1}
                      expanded={
                        integration.providerKind !== "native" &&
                        expandedTmsProvider === integration.providerKind
                      }
                      onExpandedChange={(expanded) => {
                        if (integration.providerKind === "native") {
                          return;
                        }
                        handleTmsExpandedChange(integration.providerKind, tmsCredential, expanded);
                      }}
                    >
                      {userIsAdmin &&
                      integration.providerKind !== "native" &&
                      expandedTmsProvider === integration.providerKind ? (
                        <TmsProviderCredentialPanel
                          providerKind={integration.providerKind}
                          providerName={integration.name}
                          credential={tmsCredential}
                          organizationSlug={organizationSlug}
                          userIsAdmin={userIsAdmin}
                          displayName={tmsDisplayName}
                          onDisplayNameChange={setTmsDisplayName}
                          secret={tmsSecret}
                          onSecretChange={setTmsSecret}
                          oauthClientId={tmsOauthClientId}
                          onOauthClientIdChange={setTmsOauthClientId}
                          oauthClientSecret={tmsOauthClientSecret}
                          onOauthClientSecretChange={setTmsOauthClientSecret}
                          baseUrl={tmsBaseUrl}
                          onBaseUrlChange={setTmsBaseUrl}
                          showSecret={showTmsSecret}
                          onToggleShowSecret={() => setShowTmsSecret((current) => !current)}
                          onDisconnect={() => setDisconnectingTmsProvider(integration.providerKind)}
                          onSave={() => {
                            if (integration.providerKind === "crowdin") {
                              saveCrowdinOAuthApp.mutate({
                                displayName: tmsDisplayName.trim(),
                                oauthClientId: tmsOauthClientId.trim(),
                                oauthClientSecret: tmsOauthClientSecret.trim(),
                                ...(tmsBaseUrl.trim() ? { baseUrl: tmsBaseUrl.trim() } : {}),
                              });
                              return;
                            }
                            saveExternalTms.mutate(
                              {
                                providerKind: integration.providerKind,
                                displayName: tmsDisplayName.trim(),
                                secretMaterial: tmsSecret.trim(),
                                ...(tmsCredential?.region ? { region: tmsCredential.region } : {}),
                                ...(tmsBaseUrl.trim() ? { baseUrl: tmsBaseUrl.trim() } : {}),
                              },
                              {
                                onSuccess: () => {
                                  setTmsSecret("");
                                  setShowTmsSecret(false);
                                },
                              },
                            );
                          }}
                          isSaving={saveExternalTms.isPending || saveCrowdinOAuthApp.isPending}
                          isDisconnecting={deleteExternalTms.isPending}
                          displayNameFieldId={tmsDisplayNameFieldId}
                          secretFieldId={tmsSecretFieldId}
                          oauthClientIdFieldId={tmsOauthClientIdFieldId}
                          oauthClientSecretFieldId={tmsOauthClientSecretFieldId}
                          redirectUriFieldId={tmsOauthRedirectUriFieldId}
                          baseUrlFieldId={tmsBaseUrlFieldId}
                        />
                      ) : null}
                    </TmsIntegrationRow>
                  );
                })}
              </div>
            )}
          </section>
        </>
      ) : null}

      <CollaborationIntegrationsSection
        organizationSlug={organizationSlug}
        userCanManage={userCanManageAgents}
      />

      {canManageProviderIntegrations ? (
        <>
          <section className="flex flex-col gap-3">
            <IntegrationCategoryLabel>Model provider</IntegrationCategoryLabel>

            {isLoading ? (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {modelProviderCards.map((provider) => (
                  <Skeleton key={provider.id} className="min-h-44 rounded-lg" />
                ))}
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {modelProviderCards.map((provider) => {
                  const isManaged = provider.id === hyperlocaliseGoProvider.id;
                  const isByok = !isManaged;
                  const isConfigured = isByok && credential?.provider === provider.id;
                  const isActive = isManaged ? !credential : isConfigured;

                  return (
                    <ModelProviderCard
                      key={provider.id}
                      provider={provider}
                      isActive={isActive}
                      isManaged={isManaged}
                      footerLabel={
                        isManaged ? (isActive ? undefined : "Switch to managed") : "Configure"
                      }
                      disabled={
                        isManaged && isActive ? true : isManaged && deleteCredential.isPending
                      }
                      onSelect={() => {
                        if (isManaged) {
                          if (credential) {
                            deleteCredential.mutate();
                          }
                          return;
                        }

                        const byokProvider = provider.id as LlmProvider;

                        setSelectedProvider(byokProvider);
                        setSelectedModel(
                          isConfigured && credential
                            ? credential.defaultModel
                            : defaultModelByProvider[byokProvider],
                        );
                        setApiKey("");
                        setDialogOpen(true);
                      }}
                    />
                  );
                })}
              </div>
            )}
          </section>

          <section className="flex flex-col gap-3">
            <IntegrationCategoryLabel>Content Management System</IntegrationCategoryLabel>
            {isLoadingContentful ? (
              <div className="overflow-hidden rounded-lg border border-border bg-card text-card-foreground">
                <div className="px-5 py-4">
                  <Skeleton className="h-14 rounded-lg" />
                </div>
              </div>
            ) : (
              <div className="overflow-hidden rounded-lg border border-border bg-card text-card-foreground">
                <CmsIntegrationRow
                  connection={contentfulConnections?.[0]}
                  userIsAdmin={userIsAdmin}
                  expanded={expandedContentful}
                  onExpandedChange={handleContentfulExpandedChange}
                >
                  <ContentfulConnectionPanel
                    connection={contentfulConnections?.[0]}
                    disabled={!userIsAdmin}
                    form={contentfulForm}
                    onFormChange={setContentfulForm}
                    lastWebhookSecret={lastContentfulWebhookSecret}
                    isSaving={saveContentfulConnection.isPending}
                    onSave={() => {
                      saveContentfulConnection.mutate(
                        {
                          projectId: contentfulForm.projectId.trim(),
                          displayName: contentfulForm.displayName.trim(),
                          spaceId: contentfulForm.spaceId.trim(),
                          environmentId: contentfulForm.environmentId.trim() || "master",
                          sourceLocale: contentfulForm.sourceLocale.trim(),
                          targetLocales: contentfulForm.targetLocales
                            .split(",")
                            .map((value) => value.trim())
                            .filter(Boolean),
                          contentTypeIds: contentfulForm.contentTypeIds
                            .split(",")
                            .map((value) => value.trim())
                            .filter(Boolean),
                          accessToken: contentfulForm.accessToken.trim(),
                        },
                        {
                          onSuccess: (result) => {
                            setContentfulForm((current) => ({ ...current, accessToken: "" }));
                            setLastContentfulWebhookSecret(result.webhookSecret ?? "");
                          },
                        },
                      );
                    }}
                  />
                </CmsIntegrationRow>
              </div>
            )}
          </section>

          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Configure {selectedProviderLabel}</DialogTitle>
                <DialogDescription>
                  Save one shared provider key for this workspace. Saving validates the key,
                  encrypts it at rest, and replaces the current provider.
                </DialogDescription>
              </DialogHeader>

              {selectedByokProvider && selectedProviderConfig ? (
                <form
                  className="flex flex-col gap-5"
                  onSubmit={(event) => {
                    event.preventDefault();
                    saveCredential.mutate(
                      {
                        provider: selectedByokProvider,
                        defaultModel: selectedModel,
                        apiKey,
                      },
                      {
                        onSuccess: () => {
                          setApiKey("");
                          setShowApiKey(false);
                          setDialogOpen(false);
                        },
                      },
                    );
                  }}
                >
                  <Field className="gap-2">
                    <FieldLabel htmlFor={modelFieldId}>Default model</FieldLabel>
                    <Select
                      value={selectedModel}
                      onValueChange={(value) => setSelectedModel(value ?? "")}
                    >
                      <SelectTrigger id={modelFieldId} className="h-9 w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {selectedProviderConfig.models.map((model) => (
                          <SelectItem key={model} value={model}>
                            {model}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>

                  <Field className="gap-2">
                    <FieldLabel htmlFor={apiKeyFieldId}>API key</FieldLabel>
                    <div className="relative">
                      <HugeiconsIcon
                        icon={Key01Icon}
                        strokeWidth={1.8}
                        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                      />
                      <Input
                        id={apiKeyFieldId}
                        type={showApiKey ? "text" : "password"}
                        autoComplete="off"
                        value={apiKey}
                        onChange={(event) => setApiKey(event.target.value)}
                        placeholder={`Enter ${selectedProviderLabel} API key`}
                        className="ps-9 pe-9"
                      />
                      <button
                        type="button"
                        onClick={() => setShowApiKey(!showApiKey)}
                        className="absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                        aria-label={showApiKey ? "Hide API key" : "Show API key"}
                      >
                        {showApiKey ? <EyeOffIcon size={16} /> : <EyeIcon size={16} />}
                      </button>
                    </div>
                  </Field>

                  <DialogFooter>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => deleteCredential.mutate()}
                      disabled={!credential || deleteCredential.isPending}
                    >
                      <HugeiconsIcon icon={Delete02Icon} strokeWidth={1.8} />
                      {deleteCredential.isPending ? "Disconnecting..." : "Disconnect"}
                    </Button>
                    <Button type="submit" disabled={!apiKey.trim() || saveCredential.isPending}>
                      <HugeiconsIcon icon={SaveIcon} strokeWidth={1.8} />
                      {saveCredential.isPending ? "Validating..." : "Save provider"}
                    </Button>
                  </DialogFooter>
                </form>
              ) : null}
            </DialogContent>
          </Dialog>

          <AlertDialog
            open={disconnectingTmsProvider !== null}
            onOpenChange={(open) => {
              if (!deleteExternalTms.isPending) {
                setDisconnectingTmsProvider(open ? disconnectingTmsProvider : null);
              }
            }}
          >
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  Disconnect {disconnectingTmsProviderName ?? "TMS provider"}?
                </AlertDialogTitle>
                <AlertDialogDescription>
                  This removes the saved encrypted API credential. Reconnecting this provider will
                  require entering the secret again.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={deleteExternalTms.isPending}>Cancel</AlertDialogCancel>
                <Button
                  type="button"
                  variant="destructive"
                  disabled={!disconnectingTmsProvider || deleteExternalTms.isPending}
                  onClick={() => {
                    if (!disconnectingTmsProvider) {
                      return;
                    }

                    deleteExternalTms.mutate(disconnectingTmsProvider, {
                      onSuccess: () => {
                        setDisconnectingTmsProvider(null);
                        setExpandedTmsProvider(null);
                        setTmsDisplayName("");
                        setTmsSecret("");
                        setTmsBaseUrl("");
                        setShowTmsSecret(false);
                      },
                    });
                  }}
                >
                  <HugeiconsIcon icon={Delete02Icon} strokeWidth={1.8} />
                  {deleteExternalTms.isPending ? "Disconnecting..." : "Disconnect"}
                </Button>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      ) : null}
    </main>
  );
}
