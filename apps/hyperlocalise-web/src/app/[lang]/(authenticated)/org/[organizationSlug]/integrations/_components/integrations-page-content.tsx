"use client";

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
import { useId, useMemo, useState, type ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { useAutoAnimate } from "@formkit/auto-animate/react";
import { Alert02Icon, ArrowDown01Icon, Delete02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { SimpleIcon } from "simple-icons";
import { siCrowdin } from "simple-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormattedMessage, useIntl, type IntlShape } from "react-intl";
import { toast } from "sonner";

import { hasCapability } from "@/api/auth/policy";

import type { OrganizationMembershipRole } from "@/lib/database/types";
import { createApiClient } from "@/lib/api-client";
import type {
  ExternalTmsProviderCredentialListItem,
  ExternalTmsProviderCredentialSummary,
} from "@/lib/providers/contracts/external-tms-provider-credential";
import type { ExternalTmsProviderKind } from "@/lib/providers/contracts/external-tms-provider-kind";
import {
  OAUTH_AUTH_MODE,
  PAT_AUTH_MODE,
} from "@/lib/providers/contracts/external-tms-provider-credential";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { TypographyH1 } from "@/components/ui/typography";
import { cn } from "@/lib/primitives/cn";
import { agentIntegrationsSectionMessages } from "./agent-integrations-section.messages";
import {
  CollaborationIntegrationsSection,
  CustomerEngagementIntegrationsSection,
  SourceControlIntegrationsSection,
} from "./agent-integrations-section";
import {
  ContentfulConnectionPanel,
  type ContentfulConnectionForm,
  type ContentfulConnectionSummary,
  useContentfulConnections,
  useSaveContentfulConnection,
} from "./contentful-connection-panel";
import { McpServerConnectionPanel } from "./mcp-server-connection-panel";
import { AhrefsConnectionPanel } from "./ahrefs-connection-panel";
import { SemrushConnectionPanel } from "./semrush-connection-panel";
import { integrationRowMessages } from "./integration-row.messages";
import { integrationsPageContentMessages } from "./integrations-page-content.messages";
import { IntegrationLogo } from "./integration-logo";
import {
  CollapsibleIntegrationRow,
  IntegrationCategoryCard,
  IntegrationCategoryLabel,
  IntegrationRow,
  integrationConnectButtonClassName,
} from "./integration-row";
import { SimpleBrandIcon } from "./simple-brand-icon";
import { TmsProviderCredentialPanel } from "./tms-provider-credential-panel";
import { getTmsUserOAuthErrorCopy } from "@/lib/providers/credentials/tms-user-oauth-error-copy";
import { tmsUserConnectCtaQueryKey } from "../../_hooks/use-tms-user-connect-cta";

const api = createApiClient();

const INTEGRATION_CATEGORY_IDS = [
  "source-control",
  "collaboration",
  "tms",
  "cms",
  "customer-engagement",
  "experimentation",
  "seo-tools",
  "mcp-servers",
] as const;

type IntegrationCategoryId = (typeof INTEGRATION_CATEGORY_IDS)[number];

type IntegrationCategoryFilter = "all" | IntegrationCategoryId;

const PROVIDER_INTEGRATION_CATEGORY_IDS = new Set<IntegrationCategoryId>([
  "tms",
  "cms",
  "experimentation",
  "seo-tools",
  "mcp-servers",
]);

const INTEGRATION_CATEGORY_MESSAGES = {
  "source-control": agentIntegrationsSectionMessages.sourceControlCategory,
  tms: integrationsPageContentMessages.tmsCategory,
  cms: integrationsPageContentMessages.cmsCategory,
  experimentation: integrationsPageContentMessages.experimentationCategory,
  "seo-tools": integrationsPageContentMessages.seoToolsCategory,
  "mcp-servers": integrationsPageContentMessages.mcpServersCategory,
  collaboration: agentIntegrationsSectionMessages.collaborationCategory,
  "customer-engagement": agentIntegrationsSectionMessages.customerEngagementCategory,
} as const;

function IntegrationCategorySection({
  categoryId,
  children,
}: {
  categoryId: IntegrationCategoryId;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <IntegrationCategoryLabel>
        <FormattedMessage {...INTEGRATION_CATEGORY_MESSAGES[categoryId]} />
      </IntegrationCategoryLabel>
      <IntegrationCategoryCard>{children}</IntegrationCategoryCard>
    </section>
  );
}

type IntegrationsPageContentProps = {
  organizationSlug: string;
  membershipRole: OrganizationMembershipRole;
  canManageProviderIntegrations: boolean;
  errorCode?: string | null;
};

function canManageIntegrations(role: OrganizationMembershipRole) {
  return hasCapability(role, "integrations:write");
}

function canManageAgents(role: OrganizationMembershipRole) {
  return hasCapability(role, "provider_credentials:write");
}

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

const tmsIntegrationMeta = [
  {
    providerKind: "native" as const,
    logo: "/images/logo.png",
    included: true as const,
  },
  {
    providerKind: "crowdin" as const,
    logo: "/images/tms/crowdin.png",
    icon: siCrowdin,
  },
  {
    providerKind: "lokalise" as const,
    logo: "/images/tms/lokalise.webp",
  },
  {
    providerKind: "phrase" as const,
    logo: "/images/tms/phrase.png",
  },
  {
    providerKind: "smartling" as const,
    logo: "/images/tms/smartling.png",
  },
] as const;

const contentfulIntegrationMeta = {
  logo: "/images/contentful-logo.svg",
} as const;

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

function useSaveExternalTmsCredential(organizationSlug: string, intl: IntlShape) {
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
          "message" in error && typeof error.message === "string"
            ? error.message
            : "Unable to save external TMS provider",
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
      toast.success(
        intl.formatMessage(integrationsPageContentMessages.externalTmsConnectedToast, {
          displayName: payload.displayName,
        }),
      );
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });
}

function buildTmsOAuthAppPayload(input: {
  displayName: string;
  oauthClientId: string;
  oauthClientSecret: string;
  baseUrl: string;
}) {
  const payload: {
    displayName: string;
    oauthClientId?: string;
    oauthClientSecret?: string;
    baseUrl?: string;
  } = {
    displayName: input.displayName.trim(),
  };

  const oauthClientId = input.oauthClientId.trim();
  const oauthClientSecret = input.oauthClientSecret.trim();
  if (oauthClientId && oauthClientSecret) {
    payload.oauthClientId = oauthClientId;
    payload.oauthClientSecret = oauthClientSecret;
  }

  const baseUrl = input.baseUrl.trim();
  if (baseUrl) {
    payload.baseUrl = baseUrl;
  }

  return payload;
}

function useSaveCrowdinPatSetup(organizationSlug: string, intl: IntlShape) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: { displayName: string; baseUrl?: string }) => {
      const res = await api.api.orgs[":organizationSlug"][
        "external-tms-provider-credential"
      ].crowdin["pat-setup"].$post({
        param: { organizationSlug },
        json: payload,
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({ error: "crowdin_pat_setup_failed" }));
        throw new Error(
          "message" in error && typeof error.message === "string"
            ? error.message
            : "Unable to save Crowdin personal access token settings",
        );
      }

      return res.json();
    },
    onSuccess: async (result, payload) => {
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
      if (result.shouldConnectCrowdinUser) {
        toast.success(
          intl.formatMessage(integrationsPageContentMessages.crowdinPatSavedConnectTokenToast, {
            displayName: payload.displayName,
          }),
        );
        return;
      }
      toast.success(
        intl.formatMessage(integrationsPageContentMessages.settingsSavedToast, {
          displayName: payload.displayName,
        }),
      );
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });
}

function useSaveCrowdinOAuthApp(organizationSlug: string, intl: IntlShape) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: {
      displayName: string;
      oauthClientId?: string;
      oauthClientSecret?: string;
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
          "message" in error && typeof error.message === "string"
            ? error.message
            : "Unable to start Crowdin OAuth",
        );
      }

      return res.json();
    },
    onSuccess: async (result, payload) => {
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
      if (result.shouldConnectCrowdinUser) {
        toast.success(
          intl.formatMessage(integrationsPageContentMessages.crowdinOAuthSavedConnectAccountToast, {
            displayName: payload.displayName,
          }),
        );
        return;
      }
      toast.success(
        intl.formatMessage(integrationsPageContentMessages.settingsSavedToast, {
          displayName: payload.displayName,
        }),
      );
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });
}

function useSavePhraseOAuthApp(organizationSlug: string, intl: IntlShape) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: {
      displayName: string;
      oauthClientId?: string;
      oauthClientSecret?: string;
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
          "message" in error && typeof error.message === "string"
            ? error.message
            : "Unable to start Phrase OAuth",
        );
      }

      return res.json();
    },
    onSuccess: async (result, payload) => {
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
      if (result.shouldConnectPhraseUser) {
        toast.success(
          intl.formatMessage(integrationsPageContentMessages.phraseOAuthSavedConnectAccountToast, {
            displayName: payload.displayName,
          }),
        );
        return;
      }
      toast.success(
        intl.formatMessage(integrationsPageContentMessages.settingsSavedToast, {
          displayName: payload.displayName,
        }),
      );
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });
}

function useSaveLokaliseOAuthApp(organizationSlug: string, intl: IntlShape) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: {
      displayName: string;
      oauthClientId?: string;
      oauthClientSecret?: string;
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
          "message" in error && typeof error.message === "string"
            ? error.message
            : "Unable to start Lokalise OAuth",
        );
      }

      return res.json();
    },
    onSuccess: async (result, payload) => {
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
      if (result.shouldConnectLokaliseUser) {
        toast.success(
          intl.formatMessage(
            integrationsPageContentMessages.lokaliseOAuthSavedConnectAccountToast,
            {
              displayName: payload.displayName,
            },
          ),
        );
        return;
      }
      toast.success(
        intl.formatMessage(integrationsPageContentMessages.settingsSavedToast, {
          displayName: payload.displayName,
        }),
      );
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
  isLoading = false,
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
  isLoading?: boolean;
  isLast: boolean;
  children?: ReactNode;
}) {
  const intl = useIntl();
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
            {isIncluded ? (
              <Badge variant="outline">
                <FormattedMessage {...integrationRowMessages.included} />
              </Badge>
            ) : null}
          </div>
          <p className="mt-0.5 text-sm leading-6 text-muted-foreground">{integration.detail}</p>
        </div>

        <div className="shrink-0">
          {isLoading && !isIncluded && userIsAdmin ? (
            <Skeleton className="h-8 w-[5.75rem] rounded-md" aria-hidden />
          ) : isIncluded ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              nativeButton={false}
              render={<Link href={`/org/${organizationSlug}/projects`} />}
            >
              {intl.formatMessage(integrationsPageContentMessages.viewProjects)}
            </Button>
          ) : isComingSoon ? (
            <Button type="button" variant="outline" size="sm" disabled>
              <FormattedMessage {...integrationRowMessages.comingSoon} />
            </Button>
          ) : isBlockedByActiveProvider ? (
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button type="button" variant="outline" size="sm" disabled>
                    <FormattedMessage {...integrationRowMessages.connect} />
                  </Button>
                }
              />
              <TooltipContent>
                {intl.formatMessage(integrationsPageContentMessages.disconnectTmsTooltip)}
              </TooltipContent>
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
                  {isConnected ? (
                    <FormattedMessage {...integrationRowMessages.manage} />
                  ) : (
                    <FormattedMessage {...integrationRowMessages.connect} />
                  )}
                  <HugeiconsIcon
                    icon={ArrowDown01Icon}
                    className={cn("size-3.5 transition-transform", expanded && "rotate-180")}
                    strokeWidth={2}
                  />
                </Button>
              }
            />
          ) : isConnected ? (
            <Badge variant="outline">
              <FormattedMessage {...integrationRowMessages.viewOnly} />
            </Badge>
          ) : (
            <span className="text-sm text-muted-foreground">
              <FormattedMessage {...integrationRowMessages.adminsCanConnect} />
            </span>
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

function useDeleteExternalTmsCredential(organizationSlug: string, intl: IntlShape) {
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
      toast.success(intl.formatMessage(integrationsPageContentMessages.providerDisconnectedToast));
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
  const intl = useIntl();
  const integrationError = getTmsUserOAuthErrorCopy(errorCode ?? null);
  const [categoryFilter, setCategoryFilter] = useState<IntegrationCategoryFilter>("all");
  const [categoryListRef] = useAutoAnimate<HTMLDivElement>();
  const [expandedContentful, setExpandedContentful] = useState(false);

  const { data: externalTmsCredentialState, isLoading: isLoadingExternalTms } =
    useExternalTmsCredentials(organizationSlug);
  const externalTmsCredentials = externalTmsCredentialState?.credentials;
  const activeExternalTmsProviderCredential = externalTmsCredentialState?.activeCredential ?? null;
  const { data: contentfulConnections, isLoading: isLoadingContentful } =
    useContentfulConnections(organizationSlug);
  const saveExternalTms = useSaveExternalTmsCredential(organizationSlug, intl);
  const saveCrowdinOAuthApp = useSaveCrowdinOAuthApp(organizationSlug, intl);
  const saveCrowdinPatSetup = useSaveCrowdinPatSetup(organizationSlug, intl);
  const savePhraseOAuthApp = useSavePhraseOAuthApp(organizationSlug, intl);
  const saveLokaliseOAuthApp = useSaveLokaliseOAuthApp(organizationSlug, intl);
  const saveContentfulConnection = useSaveContentfulConnection(organizationSlug);
  const deleteExternalTms = useDeleteExternalTmsCredential(organizationSlug, intl);
  const [expandedTmsProvider, setExpandedTmsProvider] = useState<ExternalTmsProviderKind | null>(
    null,
  );
  const [tmsDisplayName, setTmsDisplayName] = useState("");
  const [tmsSecret, setTmsSecret] = useState("");
  const [tmsOauthClientId, setTmsOauthClientId] = useState("");
  const [tmsOauthClientSecret, setTmsOauthClientSecret] = useState("");
  const [tmsBaseUrl, setTmsBaseUrl] = useState("");
  const [tmsCrowdinAuthMode, setTmsCrowdinAuthMode] = useState<
    typeof OAUTH_AUTH_MODE | typeof PAT_AUTH_MODE
  >(OAUTH_AUTH_MODE);
  const [showTmsSecret, setShowTmsSecret] = useState(false);
  const [disconnectingTmsProvider, setDisconnectingTmsProvider] =
    useState<ExternalTmsProviderKind | null>(null);
  const [contentfulForm, setContentfulForm] = useState<ContentfulConnectionForm>({
    displayName: intl.formatMessage(
      integrationsPageContentMessages.contentfulHelpCenterDefaultName,
    ),
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
  const tmsCrowdinAuthModeFieldId = useId();
  const userIsAdmin = canManageIntegrations(membershipRole);
  const userCanManageAgents = canManageAgents(membershipRole);
  const visibleCategoryIds = INTEGRATION_CATEGORY_IDS.filter(
    (categoryId) =>
      canManageProviderIntegrations || !PROVIDER_INTEGRATION_CATEGORY_IDS.has(categoryId),
  );
  const showCategory = (categoryId: IntegrationCategoryId) =>
    categoryFilter === "all" || categoryFilter === categoryId;

  const tmsIntegrations = useMemo<readonly TmsIntegrationConfig[]>(
    () =>
      tmsIntegrationMeta.map((integration) => {
        const copyByKind = {
          native: {
            name: integrationsPageContentMessages.tmsNativeName,
            detail: integrationsPageContentMessages.tmsNativeDetail,
          },
          crowdin: {
            name: integrationsPageContentMessages.tmsCrowdinName,
            detail: integrationsPageContentMessages.tmsCrowdinDetail,
          },
          lokalise: {
            name: integrationsPageContentMessages.tmsLokaliseName,
            detail: integrationsPageContentMessages.tmsLokaliseDetail,
          },
          phrase: {
            name: integrationsPageContentMessages.tmsPhraseName,
            detail: integrationsPageContentMessages.tmsPhraseDetail,
          },
          smartling: {
            name: integrationsPageContentMessages.tmsSmartlingName,
            detail: integrationsPageContentMessages.tmsSmartlingDetail,
          },
        } as const;

        const copy = copyByKind[integration.providerKind];

        if (integration.providerKind === "native") {
          return {
            ...integration,
            name: intl.formatMessage(copy.name),
            detail: intl.formatMessage(copy.detail),
          };
        }

        return {
          ...integration,
          name: intl.formatMessage(copy.name),
          detail: intl.formatMessage(copy.detail),
        };
      }),
    [intl],
  );

  const contentfulIntegration = useMemo(
    () => ({
      ...contentfulIntegrationMeta,
      name: intl.formatMessage(integrationsPageContentMessages.contentfulName),
      detail: intl.formatMessage(integrationsPageContentMessages.contentfulDetail),
    }),
    [intl],
  );

  const contentfulHelpCenterDefaultName = intl.formatMessage(
    integrationsPageContentMessages.contentfulHelpCenterDefaultName,
  );

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
    setTmsCrowdinAuthMode(
      existingCredential?.providerKind === "crowdin" &&
        (existingCredential.authMode === PAT_AUTH_MODE ||
          existingCredential.authMode === "api_token")
        ? PAT_AUTH_MODE
        : OAUTH_AUTH_MODE,
    );
    setShowTmsSecret(false);
  }

  function loadContentfulForm(existingConnection?: ContentfulConnectionSummary) {
    setContentfulForm({
      displayName: existingConnection?.displayName ?? contentfulHelpCenterDefaultName,
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
      <TypographyH1 className="font-heading text-2xl font-medium text-foreground md:text-2xl">
        <FormattedMessage {...integrationsPageContentMessages.pageTitle} />
      </TypographyH1>

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

      <section className="flex flex-col gap-4">
        <Tabs
          value={categoryFilter}
          onValueChange={(value) => setCategoryFilter(value as IntegrationCategoryFilter)}
          className="gap-5"
        >
          <TabsList>
            <TabsTrigger value="all">
              <FormattedMessage {...integrationsPageContentMessages.categoryFilterAll} />
            </TabsTrigger>
            {visibleCategoryIds.map((categoryId) => (
              <TabsTrigger key={categoryId} value={categoryId}>
                <FormattedMessage {...INTEGRATION_CATEGORY_MESSAGES[categoryId]} />
              </TabsTrigger>
            ))}
          </TabsList>
          <div ref={categoryListRef} className="flex flex-col gap-6">
            {showCategory("source-control") ? (
              <IntegrationCategorySection categoryId="source-control">
                <SourceControlIntegrationsSection
                  organizationSlug={organizationSlug}
                  userCanManage={userCanManageAgents}
                />
              </IntegrationCategorySection>
            ) : null}
            {showCategory("collaboration") ? (
              <IntegrationCategorySection categoryId="collaboration">
                <CollaborationIntegrationsSection
                  organizationSlug={organizationSlug}
                  userCanManage={userCanManageAgents}
                />
              </IntegrationCategorySection>
            ) : null}
            {showCategory("tms") && canManageProviderIntegrations ? (
              <IntegrationCategorySection categoryId="tms">
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
                      isLoading={isLoadingExternalTms}
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
                          crowdinAuthMode={tmsCrowdinAuthMode}
                          onCrowdinAuthModeChange={setTmsCrowdinAuthMode}
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
                            const oauthPayload = buildTmsOAuthAppPayload({
                              displayName: tmsDisplayName,
                              oauthClientId: tmsOauthClientId,
                              oauthClientSecret: tmsOauthClientSecret,
                              baseUrl: tmsBaseUrl,
                            });

                            if (integration.providerKind === "crowdin") {
                              if (tmsCrowdinAuthMode === PAT_AUTH_MODE) {
                                saveCrowdinPatSetup.mutate(
                                  {
                                    displayName: tmsDisplayName.trim(),
                                    ...(tmsBaseUrl.trim() ? { baseUrl: tmsBaseUrl.trim() } : {}),
                                  },
                                  {
                                    onSuccess: () => {
                                      setShowTmsSecret(false);
                                    },
                                  },
                                );
                                return;
                              }

                              saveCrowdinOAuthApp.mutate(oauthPayload, {
                                onSuccess: () => {
                                  setTmsOauthClientId("");
                                  setTmsOauthClientSecret("");
                                  setShowTmsSecret(false);
                                },
                              });
                              return;
                            }
                            if (integration.providerKind === "phrase") {
                              savePhraseOAuthApp.mutate(oauthPayload, {
                                onSuccess: () => {
                                  setTmsOauthClientId("");
                                  setTmsOauthClientSecret("");
                                  setShowTmsSecret(false);
                                },
                              });
                              return;
                            }
                            if (integration.providerKind === "lokalise") {
                              saveLokaliseOAuthApp.mutate(oauthPayload, {
                                onSuccess: () => {
                                  setTmsOauthClientId("");
                                  setTmsOauthClientSecret("");
                                  setShowTmsSecret(false);
                                },
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
                            saveCrowdinPatSetup.isPending ||
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
                          crowdinAuthModeFieldId={tmsCrowdinAuthModeFieldId}
                        />
                      ) : null}
                    </TmsIntegrationRow>
                  );
                })}
              </IntegrationCategorySection>
            ) : null}
            {showCategory("cms") && canManageProviderIntegrations ? (
              <IntegrationCategorySection categoryId="cms">
                <IntegrationRow
                  name={intl.formatMessage(
                    integrationsPageContentMessages.contentPublishingFilesName,
                  )}
                  description={intl.formatMessage(
                    integrationsPageContentMessages.contentPublishingFilesDetail,
                  )}
                  icon={<IntegrationLogo src="/images/logo.png" />}
                  iconMuted
                  action="coming-soon"
                />
                <CollapsibleIntegrationRow
                  name={contentfulIntegration.name}
                  description={contentfulIntegration.detail}
                  icon={<IntegrationLogo src={contentfulIntegration.logo} />}
                  isConnected={Boolean(contentfulConnections?.[0])}
                  userIsAdmin={userIsAdmin}
                  expanded={expandedContentful}
                  onExpandedChange={handleContentfulExpandedChange}
                  isLoading={isLoadingContentful}
                  isLast
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
                </CollapsibleIntegrationRow>
              </IntegrationCategorySection>
            ) : null}
            {showCategory("customer-engagement") ? (
              <IntegrationCategorySection categoryId="customer-engagement">
                <CustomerEngagementIntegrationsSection
                  organizationSlug={organizationSlug}
                  userIsAdmin={userIsAdmin}
                  showIntercom={canManageProviderIntegrations}
                />
              </IntegrationCategorySection>
            ) : null}
            {showCategory("experimentation") && canManageProviderIntegrations ? (
              <IntegrationCategorySection categoryId="experimentation">
                <IntegrationRow
                  name={intl.formatMessage(integrationsPageContentMessages.hyperlabName)}
                  description={intl.formatMessage(integrationsPageContentMessages.hyperlabDetail)}
                  icon={<IntegrationLogo src="/images/logo.png" />}
                  iconMuted
                  action="coming-soon"
                  isLast
                />
              </IntegrationCategorySection>
            ) : null}
            {showCategory("seo-tools") && canManageProviderIntegrations ? (
              <IntegrationCategorySection categoryId="seo-tools">
                <IntegrationRow
                  name={intl.formatMessage(integrationsPageContentMessages.hyperSeoName)}
                  description={intl.formatMessage(integrationsPageContentMessages.hyperSeoDetail)}
                  icon={<IntegrationLogo src="/images/logo.png" />}
                  iconMuted
                  action="coming-soon"
                />
                <SemrushConnectionPanel
                  organizationSlug={organizationSlug}
                  disabled={!userIsAdmin}
                />
                <AhrefsConnectionPanel
                  organizationSlug={organizationSlug}
                  disabled={!userIsAdmin}
                  isLast
                />
              </IntegrationCategorySection>
            ) : null}
            {showCategory("mcp-servers") && canManageProviderIntegrations ? (
              <IntegrationCategorySection categoryId="mcp-servers">
                <McpServerConnectionPanel
                  organizationSlug={organizationSlug}
                  disabled={!userIsAdmin}
                  isLast
                />
              </IntegrationCategorySection>
            ) : null}
          </div>
        </Tabs>
      </section>

      {canManageProviderIntegrations ? (
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
                {intl.formatMessage(integrationsPageContentMessages.disconnectTmsDialogTitle, {
                  providerName:
                    disconnectingTmsProviderName ??
                    intl.formatMessage(
                      integrationsPageContentMessages.disconnectTmsDialogTitleFallback,
                    ),
                })}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {intl.formatMessage(integrationsPageContentMessages.disconnectTmsDialogDescription)}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleteExternalTms.isPending}>
                {intl.formatMessage(integrationsPageContentMessages.cancel)}
              </AlertDialogCancel>
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
                      setTmsCrowdinAuthMode(OAUTH_AUTH_MODE);
                      setShowTmsSecret(false);
                    },
                  });
                }}
              >
                <HugeiconsIcon icon={Delete02Icon} strokeWidth={1.8} />
                {deleteExternalTms.isPending
                  ? intl.formatMessage(integrationsPageContentMessages.disconnecting)
                  : intl.formatMessage(integrationsPageContentMessages.disconnect)}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : null}
    </main>
  );
}
