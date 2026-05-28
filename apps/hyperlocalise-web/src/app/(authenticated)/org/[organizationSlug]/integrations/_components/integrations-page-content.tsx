"use client";

import { useEffect, useId, useState } from "react";
import Image from "next/image";
import {
  Alert02Icon,
  ArrowRight01Icon,
  CheckmarkCircle02Icon,
  Delete02Icon,
  Key01Icon,
  SaveIcon,
} from "@hugeicons/core-free-icons";
import { ArrowUpRightIcon, EyeIcon, EyeOffIcon } from "lucide-react";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import type { LlmProvider } from "@/lib/database/types";
import { hasCapability } from "@/api/auth/policy";
import { defaultModelByProvider, llmProviderCatalog } from "@/lib/providers/catalog";

import type { OrganizationMembershipRole } from "@/lib/database/types";
import { createApiClient } from "@/lib/api-client";
import type { ExternalTmsProviderCredentialListItem } from "@/lib/providers/organization-external-tms-provider-credentials";
import type { ProviderWebhookSubscriptionSummary } from "@/lib/providers/provider-webhook-subscription-types";
import { toneClass } from "../../_components/workspace-resource-shared";
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
import { TypographyH1, TypographyH2, TypographyP } from "@/components/ui/typography";
import { cn } from "@/lib/utils";

const api = createApiClient();

type IntegrationsPageContentProps = {
  organizationSlug: string;
  membershipRole: OrganizationMembershipRole;
};

function canManageIntegrations(role: OrganizationMembershipRole) {
  return hasCapability(role, "integrations:write");
}

function tmsHealthTone(status: string): Parameters<typeof toneClass>[0] {
  switch (status) {
    case "connected":
      return "safe";
    case "degraded":
      return "watch";
    case "error":
      return "risk";
    default:
      return "info";
  }
}

function tmsHealthLabel(status: string) {
  switch (status) {
    case "connected":
      return "Connected";
    case "degraded":
      return "Degraded";
    case "error":
      return "Error";
    default:
      return "Unvalidated";
  }
}

function webhookStatusTone(status: ProviderWebhookSubscriptionSummary["status"]) {
  switch (status) {
    case "active":
      return "safe" as const;
    case "pending":
      return "info" as const;
    case "disabled":
      return "info" as const;
    case "permission_error":
    case "provider_error":
    case "manual_required":
      return "watch" as const;
    default:
      return "info" as const;
  }
}

function webhookStatusLabel(status: ProviderWebhookSubscriptionSummary["status"]) {
  switch (status) {
    case "active":
      return "Webhooks active";
    case "pending":
      return "Webhook setup pending";
    case "permission_error":
      return "Webhook permission issue";
    case "provider_error":
      return "Webhook setup failed";
    case "manual_required":
      return "Manual webhook setup";
    case "disabled":
      return "Webhooks disabled";
    default:
      return "Webhook status unknown";
  }
}

function summarizeWebhookSubscriptions(subscriptions: ProviderWebhookSubscriptionSummary[]) {
  if (subscriptions.length === 0) {
    return null;
  }

  const activeCount = subscriptions.filter((item) => item.status === "active").length;
  const needsAttention = subscriptions.filter((item) =>
    ["permission_error", "provider_error", "manual_required"].includes(item.status),
  );

  if (needsAttention.length > 0) {
    return {
      tone: "watch" as const,
      label: `${needsAttention.length} webhook${needsAttention.length === 1 ? "" : "s"} need attention`,
    };
  }

  if (activeCount === subscriptions.length) {
    return {
      tone: "safe" as const,
      label: `${activeCount} active webhook${activeCount === 1 ? "" : "s"}`,
    };
  }

  return {
    tone: "info" as const,
    label: `${subscriptions.length} webhook subscription${subscriptions.length === 1 ? "" : "s"}`,
  };
}

type ProviderCredentialSummary = {
  provider: LlmProvider;
  defaultModel: string;
  maskedApiKeySuffix: string;
  lastValidatedAt: string;
};

type ManagedProviderId = "hyperlocalise-go";
type ProviderOptionId = LlmProvider | ManagedProviderId;

type ExternalTmsProviderKind = "crowdin" | "smartling" | "phrase" | "lokalise";

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
  },
  {
    id: "gemini",
    label: "Google Gemini",
    description: "Connect your Gemini account",
    logo: "/images/gemini.webp",
  },
] as const satisfies readonly {
  id: LlmProvider;
  label: string;
  description: string;
  logo: string;
}[];

type ModelProviderCardConfig = {
  id: ProviderOptionId;
  label: string;
  description: string;
  logo: string;
  managed?: boolean;
};

const modelProviderCards: readonly ModelProviderCardConfig[] = [
  hyperlocaliseGoProvider,
  ...byokProviders,
];

const tmsIntegrations = [
  {
    name: "Lokalise",
    providerKind: "lokalise" as const,
    logo: "/images/tms/lokalise.webp",
    detail: "Projects, branches, and reviewed strings.",
  },
  {
    name: "Phrase",
    providerKind: "phrase" as const,
    logo: "/images/tms/phrase.png",
    detail: "Sync jobs into existing Phrase workflows.",
  },
  {
    name: "Crowdin",
    providerKind: "crowdin" as const,
    logo: "/images/tms/crowdin.png",
    detail: "Route reviewed output into Crowdin projects.",
  },
  {
    name: "Smartling",
    providerKind: "smartling" as const,
    logo: "/images/tms/smartling.png",
    detail: "Connect enterprise localization programs.",
  },
] as const;

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
      return data.externalTmsProviderCredentials;
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
      await queryClient.invalidateQueries({
        queryKey: ["external-tms-credentials", organizationSlug],
      });
      toast.success(`${payload.displayName} connected`);
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });
}

function TmsIntegrationRow({
  integration,
  credential,
  userIsAdmin,
  onAction,
  isLast,
}: {
  integration: (typeof tmsIntegrations)[number];
  credential?: ExternalTmsProviderCredentialListItem;
  userIsAdmin: boolean;
  onAction: () => void;
  isLast: boolean;
}) {
  const isConnected = !!credential;

  return (
    <div className={cn("flex items-center gap-4 px-5 py-4", !isLast && "border-b border-border")}>
      <div className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-border bg-muted p-2">
        <Image
          src={integration.logo}
          alt=""
          width={30}
          height={30}
          className="max-h-7 w-auto object-contain"
        />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-base font-medium text-foreground">{integration.name}</p>
          {isConnected ? (
            <>
              <Badge
                variant="outline"
                className={toneClass(tmsHealthTone(credential.validationStatus))}
              >
                <HugeiconsIcon
                  icon={
                    credential.validationStatus === "connected"
                      ? CheckmarkCircle02Icon
                      : Alert02Icon
                  }
                  strokeWidth={1.8}
                />
                {tmsHealthLabel(credential.validationStatus)}
              </Badge>
              {(() => {
                const webhookSummary = summarizeWebhookSubscriptions(
                  credential.webhookSubscriptions,
                );
                if (!webhookSummary) {
                  return null;
                }

                return (
                  <Badge variant="outline" className={toneClass(webhookSummary.tone)}>
                    {webhookSummary.label}
                  </Badge>
                );
              })()}
            </>
          ) : null}
        </div>
        <p className="mt-0.5 text-sm leading-6 text-muted-foreground">{integration.detail}</p>
      </div>

      <div className="shrink-0">
        {userIsAdmin ? (
          <Button type="button" variant="outline" size="sm" onClick={onAction}>
            {isConnected ? "Manage" : "Connect"}
            <ArrowUpRightIcon className="size-3.5" strokeWidth={2} />
          </Button>
        ) : isConnected ? (
          <Badge variant="outline">View only</Badge>
        ) : (
          <span className="text-sm text-muted-foreground">Admins can connect</span>
        )}
      </div>
    </div>
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
        <Badge variant="outline" className="absolute top-4 right-4 text-[10px]">
          Active
        </Badge>
      ) : null}

      <div className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-border bg-muted p-2">
        <Image
          src={provider.logo}
          alt=""
          width={28}
          height={28}
          className="max-h-7 w-auto object-contain"
        />
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

function useRetryWebhookSubscriptions(organizationSlug: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (providerKind: ExternalTmsProviderKind) => {
      const res = await api.api.orgs[":organizationSlug"]["external-tms-provider-credential"][
        ":providerKind"
      ]["webhook-subscriptions"].retry.$post({
        param: { organizationSlug, providerKind },
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({ error: "webhook_retry_failed" }));
        throw new Error(
          "message" in error ? String(error.message) : "Unable to retry webhook setup",
        );
      }

      return res.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["external-tms-credentials", organizationSlug],
      });
      toast.success("Webhook setup retried");
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });
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
      await queryClient.invalidateQueries({
        queryKey: ["external-tms-credentials", organizationSlug],
      });
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
}: IntegrationsPageContentProps) {
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

  const { data: externalTmsCredentials, isLoading: isLoadingExternalTms } =
    useExternalTmsCredentials(organizationSlug);
  const saveExternalTms = useSaveExternalTmsCredential(organizationSlug);
  const deleteExternalTms = useDeleteExternalTmsCredential(organizationSlug);
  const retryWebhookSetup = useRetryWebhookSubscriptions(organizationSlug);
  const [selectedTmsProvider, setSelectedTmsProvider] = useState<ExternalTmsProviderKind | null>(
    null,
  );
  const [tmsDialogOpen, setTmsDialogOpen] = useState(false);
  const [tmsDisplayName, setTmsDisplayName] = useState("");
  const [tmsSecret, setTmsSecret] = useState("");
  const [tmsRegion, setTmsRegion] = useState("");
  const [tmsBaseUrl, setTmsBaseUrl] = useState("");
  const [showTmsSecret, setShowTmsSecret] = useState(false);
  const [disconnectingTmsProvider, setDisconnectingTmsProvider] =
    useState<ExternalTmsProviderKind | null>(null);

  const tmsDisplayNameFieldId = useId();
  const tmsSecretFieldId = useId();
  const tmsRegionFieldId = useId();
  const tmsBaseUrlFieldId = useId();
  const userIsAdmin = canManageIntegrations(membershipRole);

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
  const selectedTmsCredential = selectedTmsProvider
    ? externalTmsCredentials?.find((item) => item.providerKind === selectedTmsProvider)
    : undefined;

  function openTmsProviderDialog(
    providerKind: ExternalTmsProviderKind,
    existingCredential?: ExternalTmsProviderCredentialListItem,
  ) {
    setSelectedTmsProvider(providerKind);
    setTmsDisplayName(existingCredential?.displayName ?? "");
    setTmsSecret("");
    setTmsRegion(existingCredential?.region ?? "");
    setTmsBaseUrl(existingCredential?.baseUrl ?? "");
    setShowTmsSecret(false);
    setTmsDialogOpen(true);
  }

  return (
    <main className="space-y-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <TypographyH1 className="font-heading text-2xl font-medium text-foreground md:text-2xl">
            Integrations
          </TypographyH1>
          <TypographyP className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
            Configure the model provider Hyperlocalise uses for translation runs and prepare TMS
            handoffs for approved copy.
          </TypographyP>
        </div>
        <Badge variant="outline" className="rounded-full lg:self-start">
          Workspace level
        </Badge>
      </div>

      <section className="flex flex-col gap-4">
        <div>
          <TypographyH2 className="font-heading text-xl font-medium text-foreground md:text-xl">
            Model Provider
          </TypographyH2>
          <TypographyP className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
            Choose how Hyperlocalise runs translations: use our managed provider or bring your own
            API keys.
          </TypographyP>
        </div>

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
                  disabled={isManaged && isActive ? true : isManaged && deleteCredential.isPending}
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
              Save one shared provider key for this workspace. Saving validates the key, encrypts it
              at rest, and replaces the current provider.
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

      <section className="flex flex-col gap-4">
        <div>
          <TypographyH2 className="font-heading text-xl font-medium text-foreground md:text-xl">
            TMS
          </TypographyH2>
          <TypographyP className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
            Connect external translation management systems to sync projects, files, jobs,
            glossaries, and translation memories into the unified workspace.
          </TypographyP>
        </div>

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
              const credential = externalTmsCredentials?.find(
                (item) => item.providerKind === integration.providerKind,
              );

              return (
                <TmsIntegrationRow
                  key={integration.name}
                  integration={integration}
                  credential={credential}
                  userIsAdmin={userIsAdmin}
                  isLast={index === tmsIntegrations.length - 1}
                  onAction={() => openTmsProviderDialog(integration.providerKind, credential)}
                />
              );
            })}
          </div>
        )}
      </section>

      <Dialog open={tmsDialogOpen} onOpenChange={setTmsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {selectedTmsProvider
                ? `${tmsIntegrations.find((t) => t.providerKind === selectedTmsProvider)?.name} credentials`
                : "TMS credentials"}
            </DialogTitle>
            <DialogDescription>
              Save credentials to connect this provider. The secret is encrypted at rest and used to
              sync projects, files, and jobs into the workspace.
            </DialogDescription>
          </DialogHeader>

          {selectedTmsProvider ? (
            <form
              className="flex flex-col gap-5"
              onSubmit={(event) => {
                event.preventDefault();
                saveExternalTms.mutate(
                  {
                    providerKind: selectedTmsProvider,
                    displayName: tmsDisplayName.trim(),
                    secretMaterial: tmsSecret.trim(),
                    ...(tmsRegion.trim() ? { region: tmsRegion.trim() } : {}),
                    ...(tmsBaseUrl.trim() ? { baseUrl: tmsBaseUrl.trim() } : {}),
                  },
                  {
                    onSuccess: () => {
                      setTmsDisplayName("");
                      setTmsSecret("");
                      setTmsRegion("");
                      setTmsBaseUrl("");
                      setShowTmsSecret(false);
                      setTmsDialogOpen(false);
                    },
                  },
                );
              }}
            >
              <Field className="gap-2">
                <FieldLabel htmlFor={tmsDisplayNameFieldId}>Display name</FieldLabel>
                <Input
                  id={tmsDisplayNameFieldId}
                  value={tmsDisplayName}
                  onChange={(event) => setTmsDisplayName(event.target.value)}
                  placeholder="e.g. Crowdin Production"
                />
              </Field>

              <Field className="gap-2">
                <FieldLabel htmlFor={tmsSecretFieldId}>API token / secret</FieldLabel>
                <div className="relative">
                  <HugeiconsIcon
                    icon={Key01Icon}
                    strokeWidth={1.8}
                    className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                  />
                  <Input
                    id={tmsSecretFieldId}
                    type={showTmsSecret ? "text" : "password"}
                    autoComplete="off"
                    value={tmsSecret}
                    onChange={(event) => setTmsSecret(event.target.value)}
                    placeholder="Enter provider API token"
                    className="ps-9 pe-9"
                  />
                  <button
                    type="button"
                    onClick={() => setShowTmsSecret(!showTmsSecret)}
                    className="absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                    aria-label={showTmsSecret ? "Hide secret" : "Show secret"}
                  >
                    {showTmsSecret ? <EyeOffIcon size={16} /> : <EyeIcon size={16} />}
                  </button>
                </div>
              </Field>

              <Field className="gap-2">
                <FieldLabel htmlFor={tmsRegionFieldId}>Region (optional)</FieldLabel>
                <Input
                  id={tmsRegionFieldId}
                  value={tmsRegion}
                  onChange={(event) => setTmsRegion(event.target.value)}
                  placeholder="e.g. us, eu"
                />
              </Field>

              <Field className="gap-2">
                <FieldLabel htmlFor={tmsBaseUrlFieldId}>Base URL (optional)</FieldLabel>
                <Input
                  id={tmsBaseUrlFieldId}
                  value={tmsBaseUrl}
                  onChange={(event) => setTmsBaseUrl(event.target.value)}
                  placeholder="https://api.example.com"
                />
              </Field>

              {selectedTmsCredential && selectedTmsCredential.webhookSubscriptions.length > 0 ? (
                <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium text-foreground">Webhook sync</p>
                      <p className="mt-0.5 text-sm text-muted-foreground">
                        Hyperlocalise registers inbound webhooks automatically when the provider API
                        allows it.
                      </p>
                    </div>
                    {userIsAdmin &&
                    selectedTmsCredential.webhookSubscriptions.some((item) => item.canRetry) ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={retryWebhookSetup.isPending}
                        onClick={() => {
                          if (!selectedTmsProvider) {
                            return;
                          }

                          retryWebhookSetup.mutate(selectedTmsProvider);
                        }}
                      >
                        {retryWebhookSetup.isPending ? "Retrying..." : "Retry setup"}
                      </Button>
                    ) : null}
                  </div>

                  <div className="space-y-3">
                    {selectedTmsCredential.webhookSubscriptions.map((subscription) => (
                      <div
                        key={subscription.id}
                        className="space-y-2 rounded-md border border-border bg-card p-3"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge
                            variant="outline"
                            className={toneClass(webhookStatusTone(subscription.status))}
                          >
                            {webhookStatusLabel(subscription.status)}
                          </Badge>
                          {subscription.projectId ? (
                            <span className="text-xs text-muted-foreground">
                              Project {subscription.projectId}
                            </span>
                          ) : null}
                        </div>

                        {subscription.manualFallback ? (
                          <div className="space-y-2 text-sm text-muted-foreground">
                            <p>
                              <span className="font-medium text-foreground">Webhook URL:</span>{" "}
                              <code className="break-all rounded bg-muted px-1 py-0.5 text-xs">
                                {subscription.manualFallback.webhookUrl}
                              </code>
                            </p>
                            {subscription.manualFallback.secretHeaderName ? (
                              <p>
                                <span className="font-medium text-foreground">Secret header:</span>{" "}
                                {subscription.manualFallback.secretHeaderName}
                              </p>
                            ) : null}
                            {subscription.manualFallback.secretInstructions ? (
                              <p>{subscription.manualFallback.secretInstructions}</p>
                            ) : null}
                            {subscription.manualFallback.subscribedEvents.length > 0 ? (
                              <p>
                                <span className="font-medium text-foreground">Events:</span>{" "}
                                {subscription.manualFallback.subscribedEvents.join(", ")}
                              </p>
                            ) : null}
                            {subscription.manualFallback.lastError ? (
                              <p className="text-destructive">
                                {subscription.manualFallback.lastError}
                              </p>
                            ) : null}
                          </div>
                        ) : subscription.lastError ? (
                          <p className="text-sm text-destructive">{subscription.lastError}</p>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              ) : selectedTmsCredential ? (
                <div className="rounded-lg border border-dashed border-border px-4 py-3 text-sm text-muted-foreground">
                  Webhook subscriptions appear after projects are synced for this provider.
                </div>
              ) : null}

              <DialogFooter className="gap-2 sm:justify-between">
                {selectedTmsCredential && userIsAdmin ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setTmsDialogOpen(false);
                      setDisconnectingTmsProvider(selectedTmsProvider);
                    }}
                    disabled={deleteExternalTms.isPending}
                  >
                    <HugeiconsIcon icon={Delete02Icon} strokeWidth={1.8} />
                    Disconnect
                  </Button>
                ) : (
                  <div />
                )}
                <div className="flex gap-2">
                  <Button type="button" variant="outline" onClick={() => setTmsDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={
                      !tmsDisplayName.trim() || !tmsSecret.trim() || saveExternalTms.isPending
                    }
                  >
                    <HugeiconsIcon icon={SaveIcon} strokeWidth={1.8} />
                    {saveExternalTms.isPending ? "Saving..." : "Save provider"}
                  </Button>
                </div>
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
                  onSuccess: () => setDisconnectingTmsProvider(null),
                });
              }}
            >
              <HugeiconsIcon icon={Delete02Icon} strokeWidth={1.8} />
              {deleteExternalTms.isPending ? "Disconnecting..." : "Disconnect"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}
