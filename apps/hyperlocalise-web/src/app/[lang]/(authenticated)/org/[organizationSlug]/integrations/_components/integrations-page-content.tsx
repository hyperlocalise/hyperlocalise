"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { Alert02Icon, Delete02Icon, Key01Icon, SaveIcon } from "@hugeicons/core-free-icons";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { TypographyH1 } from "@/components/ui/typography";
import { cn } from "@/lib/primitives/cn";
import {
  CollaborationIntegrationsSection,
  SourceControlIntegrationsSection,
} from "./agent-integrations-section";
import {
  ContentfulConnectionPanel,
  type ContentfulConnectionForm,
  type ContentfulConnectionSummary,
  useContentfulConnections,
  useSaveContentfulConnection,
} from "./contentful-connection-panel";
import { IntegrationCategoryLabel, integrationConnectButtonClassName } from "./integration-row";
import { ModelProviderCard, type ModelProviderCardConfig } from "./model-provider-card";
import { SimpleBrandIcon } from "./simple-brand-icon";
import { TmsProviderCredentialPanel } from "./tms-provider-credential-panel";
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
  phrase_user_oauth_exchange_failed: {
    title: "Phrase account link failed",
    description:
      "Phrase did not return an access token. Check that the OAuth app callback URL, client ID, and client secret match the Phrase OAuth App configuration.",
  },
  phrase_user_oauth_invalid: {
    title: "Phrase account link failed",
    description:
      "Phrase rejected the access token returned during authorization. Try connecting again.",
  },
  phrase_user_lookup_failed: {
    title: "Phrase account link failed",
    description: "Hyperlocalise received a token but could not load the authorized Phrase user.",
  },
  phrase_integration_not_connected: {
    title: "Phrase integration is not connected",
    description: "Save the Phrase OAuth app credentials before linking a user account.",
  },
  phrase_user_already_linked: {
    title: "Phrase account already linked",
    description:
      "That Phrase user is already linked to another Hyperlocalise user in this workspace.",
  },
  missing_phrase_user_oauth_code: {
    title: "Phrase account link was cancelled",
    description: "Phrase did not return an authorization code. Start the connection again.",
  },
  invalid_phrase_oauth_state: {
    title: "Phrase account link expired",
    description: "This Phrase connection link expired. Start Connect Phrase again.",
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

const modelProviderCards: readonly ModelProviderCardConfig[] = [
  hyperlocaliseGoProvider,
  ...byokProviders,
];

type TmsIntegrationConfig =
  | {
      name: string;
      providerKind: "native";
      logo: string;
      detail: string;
      included: true;
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
    logo: "/images/logo.png",
    included: true,
    detail:
      "Built-in TMS for projects, jobs, files, and translation memories. No external provider required.",
  },
  {
    name: "Crowdin",
    providerKind: "crowdin",
    logo: "/images/tms/crowdin.png",
    icon: siCrowdin,
    detail:
      "Connect to browse Crowdin projects alongside native Hyperlocalise projects. Lists read from your local workspace copy while background sync keeps data current.",
  },
  {
    name: "Lokalise",
    providerKind: "lokalise" as const,
    logo: "/images/tms/lokalise.webp",
    detail:
      "Connect to browse Lokalise projects, tasks, glossaries, and translation memories with user OAuth.",
  },
  {
    name: "Phrase",
    providerKind: "phrase" as const,
    logo: "/images/tms/phrase.png",
    detail: "Connect to browse Phrase projects and jobs with user OAuth.",
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

function useSavePhraseOAuthApp(organizationSlug: string) {
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
      ].phrase["oauth-app"].$post({
        param: { organizationSlug },
        json: payload,
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({ error: "phrase_oauth_start_failed" }));
        throw new Error(
          "message" in error ? String(error.message) : "Unable to start Phrase OAuth",
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
          queryKey: ["phrase-user-connection", organizationSlug],
        }),
        queryClient.invalidateQueries({
          queryKey: tmsUserConnectCtaQueryKey(organizationSlug),
        }),
      ]);
      toast.success(`${payload.displayName} saved. Connect your Phrase account to continue.`);
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });
}

function useSaveLokaliseOAuthApp(organizationSlug: string) {
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
      ].lokalise["oauth-app"].$post({
        param: { organizationSlug },
        json: payload,
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({ error: "lokalise_oauth_start_failed" }));
        throw new Error(
          "message" in error ? String(error.message) : "Unable to start Lokalise OAuth",
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
          queryKey: ["lokalise-user-connection", organizationSlug],
        }),
        queryClient.invalidateQueries({
          queryKey: tmsUserConnectCtaQueryKey(organizationSlug),
        }),
      ]);
      toast.success(`${payload.displayName} saved. Connect your Lokalise account to continue.`);
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
  organizationSlug,
  userIsAdmin,
  expanded,
  onExpandedChange,
  isLast,
  children,
}: {
  integration: TmsIntegrationConfig;
  credential?: ExternalTmsProviderCredentialListItem;
  activeExternalProviderKind?: ExternalTmsProviderKind | null;
  organizationSlug: string;
  userIsAdmin: boolean;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  isLast: boolean;
  children?: ReactNode;
}) {
  const isIncluded = integration.providerKind === "native";
  const isConnected = isIncluded || !!credential;
  const isComingSoon = !isIncluded && Boolean(integration.comingSoon);
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
          {isIncluded ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              nativeButton={false}
              render={<Link href={`/org/${organizationSlug}/projects`} />}
            >
              View projects
            </Button>
          ) : isComingSoon ? (
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
  const [expandedContentful, setExpandedContentful] = useState(false);

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
  const savePhraseOAuthApp = useSavePhraseOAuthApp(organizationSlug);
  const saveLokaliseOAuthApp = useSaveLokaliseOAuthApp(organizationSlug);
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
    spaceId: "",
    environmentId: "master",
    contentTypeIds: [],
    accessToken: "",
  });
  const [lastContentfulWebhookSecret, setLastContentfulWebhookSecret] = useState("");

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
      spaceId: existingConnection?.spaceId ?? "",
      environmentId: existingConnection?.environmentId ?? "master",
      contentTypeIds: existingConnection?.contentTypeIds ?? [],
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
                      organizationSlug={organizationSlug}
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
                            if (integration.providerKind === "phrase") {
                              savePhraseOAuthApp.mutate({
                                displayName: tmsDisplayName.trim(),
                                oauthClientId: tmsOauthClientId.trim(),
                                oauthClientSecret: tmsOauthClientSecret.trim(),
                                ...(tmsBaseUrl.trim() ? { baseUrl: tmsBaseUrl.trim() } : {}),
                              });
                              return;
                            }
                            if (integration.providerKind === "lokalise") {
                              saveLokaliseOAuthApp.mutate({
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
                          isSaving={
                            saveExternalTms.isPending ||
                            saveCrowdinOAuthApp.isPending ||
                            savePhraseOAuthApp.isPending ||
                            saveLokaliseOAuthApp.isPending
                          }
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
                    organizationSlug={organizationSlug}
                    onSave={() => {
                      const accessToken = contentfulForm.accessToken.trim();
                      const existingConnection = contentfulConnections?.[0];

                      const payload = {
                        displayName: contentfulForm.displayName.trim(),
                        spaceId: contentfulForm.spaceId.trim(),
                        environmentId: contentfulForm.environmentId.trim() || "master",
                        contentTypeIds: contentfulForm.contentTypeIds,
                      };

                      saveContentfulConnection.mutate(
                        existingConnection
                          ? {
                              ...payload,
                              connectionId: existingConnection.id,
                              ...(accessToken ? { accessToken } : {}),
                            }
                          : { ...payload, accessToken },
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
                  This removes the saved encrypted provider credentials. Reconnecting this provider
                  will require entering the secret again.
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
