"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import {
  CheckmarkCircle02Icon,
  Clock01Icon,
  Delete02Icon,
  Key01Icon,
  Plug01Icon,
  SaveIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import type { LlmProvider } from "@/lib/database/types";
import { defaultModelByProvider, llmProviderCatalog } from "@/lib/providers/catalog";
import { createApiClient } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const api = createApiClient();

type IntegrationsPageContentProps = {
  organizationSlug: string;
};

type ProviderCredentialSummary = {
  provider: LlmProvider;
  defaultModel: string;
  maskedApiKeySuffix: string;
  lastValidatedAt: string;
};

const providerLogos = {
  openai: "/images/openai-old-logo.webp",
  anthropic: "/images/claude.png",
  gemini: "/images/gemini.webp",
  groq: "/images/groq.webp",
  mistral: "/images/mistral.jpg",
} as const satisfies Record<LlmProvider, string>;

const tmsIntegrations = [
  {
    name: "Lokalise",
    logo: "/images/tms/lokalise.webp",
    detail: "Projects, branches, and reviewed strings.",
  },
  {
    name: "Phrase",
    logo: "/images/tms/phrase.png",
    detail: "Sync jobs into existing Phrase workflows.",
  },
  {
    name: "Crowdin",
    logo: "/images/tms/crowdin.png",
    detail: "Route reviewed output into Crowdin projects.",
  },
  {
    name: "Transifex",
    logo: "/images/tms/transifex.webp",
    detail: "Keep product strings aligned with Transifex resources.",
  },
  {
    name: "POEditor",
    logo: "/images/tms/poeditor.png",
    detail: "Push approved translations into POEditor terms.",
  },
  {
    name: "Smartling",
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

function ProviderLogo({ provider }: { provider: LlmProvider }) {
  return (
    <div className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/5 p-2">
      <Image
        src={providerLogos[provider]}
        alt=""
        width={28}
        height={28}
        className="max-h-7 w-auto object-contain"
      />
    </div>
  );
}

export function IntegrationsPageContent({ organizationSlug }: IntegrationsPageContentProps) {
  const { data: credential, isLoading } = useProviderCredential(organizationSlug);
  const saveCredential = useSaveProviderCredential(organizationSlug);
  const deleteCredential = useDeleteProviderCredential(organizationSlug);
  const [selectedProvider, setSelectedProvider] = useState<LlmProvider>(
    credential?.provider ?? "openai",
  );
  const [selectedModel, setSelectedModel] = useState(defaultModelByProvider[selectedProvider]);
  const [apiKey, setApiKey] = useState("");

  useEffect(() => {
    if (credential) {
      setSelectedProvider(credential.provider);
      setSelectedModel(credential.defaultModel);
    }
  }, [credential]);

  useEffect(() => {
    if (
      !(llmProviderCatalog[selectedProvider].models as readonly string[]).includes(selectedModel)
    ) {
      setSelectedModel(defaultModelByProvider[selectedProvider]);
    }
  }, [selectedModel, selectedProvider]);

  const selectedProviderConfig = llmProviderCatalog[selectedProvider];
  const selectedProviderIsConfigured = credential?.provider === selectedProvider;
  const selectedProviderStatus = useMemo(() => {
    if (!credential) {
      return "No workspace provider configured yet.";
    }

    return `${llmProviderCatalog[credential.provider].label} is configured with ${
      credential.defaultModel
    }. Saved key ends in ${credential.maskedApiKeySuffix}.`;
  }, [credential]);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="font-heading text-2xl font-medium text-white">Integrations</h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-white/52">
            Configure the model provider Hyperlocalise uses for translation runs and prepare TMS
            handoffs for approved copy.
          </p>
        </div>
        <Badge
          variant="outline"
          className="rounded-full border-white/10 bg-white/5 text-white/68 lg:self-start"
        >
          Workspace level
        </Badge>
      </div>

      <section className="grid gap-5 lg:grid-cols-[minmax(0,0.92fr)_minmax(360px,1fr)]">
        <Card className="rounded-lg border border-white/8 bg-[#0b0b0b] py-0 text-white ring-0">
          <CardHeader className="gap-4 px-5 py-5 lg:px-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <CardTitle className="text-lg font-medium text-white">LLM providers</CardTitle>
                <CardDescription className="mt-1 text-white/52">
                  Select one shared provider for localization jobs in this workspace.
                </CardDescription>
              </div>
              <HugeiconsIcon
                icon={Plug01Icon}
                strokeWidth={1.8}
                className="mt-1 size-5 text-white/42"
              />
            </div>
          </CardHeader>
          <Separator className="bg-white/8" />
          <CardContent className="grid gap-3 px-5 py-5 lg:px-6">
            {isLoading ? (
              <>
                <Skeleton className="h-20 bg-white/5" />
                <Skeleton className="h-20 bg-white/5" />
                <Skeleton className="h-20 bg-white/5" />
              </>
            ) : (
              Object.entries(llmProviderCatalog).map(([provider, providerConfig]) => {
                const typedProvider = provider as LlmProvider;
                const isSelected = selectedProvider === typedProvider;
                const isConfigured = credential?.provider === typedProvider;

                return (
                  <button
                    key={provider}
                    type="button"
                    onClick={() => {
                      setSelectedProvider(typedProvider);
                      setSelectedModel(
                        isConfigured
                          ? credential.defaultModel
                          : defaultModelByProvider[typedProvider],
                      );
                    }}
                    className={cn(
                      "flex min-h-20 items-center gap-3 rounded-lg border px-4 py-3 text-left transition-colors",
                      isSelected
                        ? "border-dew-500/35 bg-dew-500/10"
                        : "border-white/8 bg-white/[0.03] hover:border-white/18 hover:bg-white/[0.055]",
                    )}
                  >
                    <ProviderLogo provider={typedProvider} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-medium text-white">{providerConfig.label}</p>
                        {isConfigured ? (
                          <Badge
                            variant="outline"
                            className="border-grove-300/25 bg-grove-300/10 text-grove-300"
                          >
                            Configured
                          </Badge>
                        ) : null}
                      </div>
                      <p className="mt-1 line-clamp-1 text-xs text-white/46">
                        {providerConfig.models.join(", ")}
                      </p>
                    </div>
                    {isSelected ? (
                      <HugeiconsIcon
                        icon={CheckmarkCircle02Icon}
                        strokeWidth={1.8}
                        className="size-5 shrink-0 text-dew-100"
                      />
                    ) : null}
                  </button>
                );
              })
            )}
          </CardContent>
        </Card>

        <Card className="rounded-lg border border-white/8 bg-[#0b0b0b] py-0 text-white ring-0">
          <CardHeader className="gap-4 px-5 py-5 lg:px-6">
            <div className="flex items-start justify-between gap-4">
              <div className="flex min-w-0 items-start gap-3">
                <ProviderLogo provider={selectedProvider} />
                <div className="min-w-0">
                  <CardTitle className="text-lg font-medium text-white">
                    Configure {selectedProviderConfig.label}
                  </CardTitle>
                  <CardDescription className="mt-1 text-white/52">
                    {selectedProviderStatus}
                  </CardDescription>
                </div>
              </div>
              <Badge
                variant="outline"
                className={cn(
                  "shrink-0 rounded-full",
                  selectedProviderIsConfigured
                    ? "border-grove-300/25 bg-grove-300/10 text-grove-300"
                    : "border-dew-500/25 bg-dew-500/10 text-dew-100",
                )}
              >
                {selectedProviderIsConfigured ? "Active" : "Available"}
              </Badge>
            </div>
          </CardHeader>
          <Separator className="bg-white/8" />
          <CardContent className="px-5 py-5 lg:px-6">
            <form
              className="flex flex-col gap-5"
              onSubmit={(event) => {
                event.preventDefault();
                saveCredential.mutate({
                  provider: selectedProvider,
                  defaultModel: selectedModel,
                  apiKey,
                });
              }}
            >
              <label className="flex flex-col gap-2">
                <span className="text-sm font-medium text-white">Default model</span>
                <select
                  value={selectedModel}
                  onChange={(event) => setSelectedModel(event.target.value)}
                  className="h-9 w-full rounded-4xl border border-white/10 bg-white/[0.03] px-3 text-sm text-white outline-none transition-colors focus-visible:border-dew-500/60 focus-visible:ring-[3px] focus-visible:ring-dew-500/20"
                >
                  {selectedProviderConfig.models.map((model) => (
                    <option key={model} value={model} className="bg-[#0b0b0b] text-white">
                      {model}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-2">
                <span className="text-sm font-medium text-white">API key</span>
                <div className="relative">
                  <HugeiconsIcon
                    icon={Key01Icon}
                    strokeWidth={1.8}
                    className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-white/38"
                  />
                  <Input
                    type="password"
                    autoComplete="off"
                    value={apiKey}
                    onChange={(event) => setApiKey(event.target.value)}
                    placeholder={`Enter ${selectedProviderConfig.label} API key`}
                    className="border-white/10 bg-white/[0.03] ps-9 text-white placeholder:text-white/34 focus-visible:border-dew-500/60 focus-visible:ring-dew-500/20"
                  />
                </div>
                <span className="text-xs leading-5 text-white/42">
                  Saving validates the key, encrypts it at rest, and replaces any current provider.
                </span>
              </label>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <Button
                  type="button"
                  variant="outline"
                  className="border-white/10 bg-transparent text-white hover:bg-white/8 hover:text-white"
                  onClick={() => deleteCredential.mutate()}
                  disabled={!credential || deleteCredential.isPending}
                >
                  <HugeiconsIcon icon={Delete02Icon} strokeWidth={1.8} />
                  {deleteCredential.isPending ? "Disconnecting..." : "Disconnect"}
                </Button>
                <Button
                  type="submit"
                  className="bg-white text-black hover:bg-white/90"
                  disabled={!apiKey.trim() || saveCredential.isPending}
                >
                  <HugeiconsIcon icon={SaveIcon} strokeWidth={1.8} />
                  {saveCredential.isPending ? "Validating..." : "Save provider"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </section>

      <section className="flex flex-col gap-4">
        <div>
          <h2 className="font-heading text-xl font-medium text-white">TMS</h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-white/52">
            Translation management system sync is staged for a later release. These connectors are
            visible now so teams can plan the handoff path.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {tmsIntegrations.map((integration) => (
            <Card
              key={integration.name}
              className="rounded-lg border border-white/8 bg-[#0b0b0b] py-0 text-white opacity-78 ring-0"
            >
              <CardHeader className="gap-4 px-5 py-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex min-w-0 items-start gap-3">
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white p-2">
                      <Image
                        src={integration.logo}
                        alt=""
                        width={30}
                        height={30}
                        className="max-h-7 w-auto object-contain"
                      />
                    </div>
                    <div className="min-w-0">
                      <CardTitle className="text-base font-medium text-white">
                        {integration.name}
                      </CardTitle>
                      <CardDescription className="mt-1 text-white/46">
                        {integration.detail}
                      </CardDescription>
                    </div>
                  </div>
                  <Badge
                    variant="outline"
                    className="shrink-0 border-bud-500/25 bg-bud-500/10 text-bud-300"
                  >
                    <HugeiconsIcon icon={Clock01Icon} strokeWidth={1.8} />
                    Coming soon
                  </Badge>
                </div>
              </CardHeader>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}
