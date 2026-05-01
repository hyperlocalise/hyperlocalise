"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import {
  CheckmarkCircle02Icon,
  Clock01Icon,
  Delete02Icon,
  Key01Icon,
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
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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

type ManagedProviderId = "hyperlocalise-go";
type ProviderOptionId = LlmProvider | ManagedProviderId;

const hyperlocaliseGoProvider = {
  id: "hyperlocalise-go",
  label: "Hyperlocalise Go",
  apiKey: "Managed by Hyperlocalise",
} as const;

const byokProviders = [
  { id: "openai", label: "OpenAI" },
  { id: "anthropic", label: "Anthropic" },
  { id: "gemini", label: "Google Gemini" },
] as const satisfies readonly { id: LlmProvider; label: string }[];

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

export function IntegrationsPageContent({ organizationSlug }: IntegrationsPageContentProps) {
  const { data: credential, isLoading } = useProviderCredential(organizationSlug);
  const saveCredential = useSaveProviderCredential(organizationSlug);
  const deleteCredential = useDeleteProviderCredential(organizationSlug);
  const [selectedProvider, setSelectedProvider] = useState<ProviderOptionId | null>(null);
  const [selectedModel, setSelectedModel] = useState(defaultModelByProvider.openai);
  const [apiKey, setApiKey] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);

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

  return (
    <main className="space-y-5">
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

      <section className="flex flex-col gap-4">
        <div>
          <h2 className="font-heading text-xl font-medium text-white">Model Provider</h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-white/52">
            Choose how Hyperlocalise runs translations: use our managed provider or bring your own
            API keys.
          </p>
        </div>

        <div className="overflow-x-auto rounded-lg border border-white/8 bg-[#0b0b0b]">
          {isLoading ? (
            <div className="flex flex-col px-5 py-4 lg:px-6">
              <Skeleton className="my-3 h-12 rounded-lg bg-white/5" />
              <Skeleton className="my-3 h-12 rounded-lg bg-white/5" />
              <Skeleton className="my-3 h-12 rounded-lg bg-white/5" />
              <Skeleton className="my-3 h-12 rounded-lg bg-white/5" />
            </div>
          ) : (
            <div className="min-w-[640px]">
              <div className="grid grid-cols-[minmax(180px,1fr)_minmax(220px,2fr)_160px] border-b border-white/8 px-4 py-4 text-xs font-medium tracking-[0.08em] text-white/46 uppercase">
                <div>Provider</div>
                <div>API key</div>
                <div className="text-right">
                  <span className="sr-only">Actions</span>
                </div>
              </div>
              <div className="divide-y divide-white/8">
                <div className="grid min-h-16 grid-cols-[minmax(180px,1fr)_minmax(220px,2fr)_160px] items-center px-4 py-4">
                  <div className="flex items-center gap-3">
                    <div className="text-base font-medium text-white">
                      {hyperlocaliseGoProvider.label}
                    </div>
                    <Badge
                      variant="outline"
                      className="border-white/10 bg-white/5 text-white/52 text-[10px]"
                    >
                      Managed
                    </Badge>
                  </div>
                  <div className="text-sm text-white/52">{hyperlocaliseGoProvider.apiKey}</div>
                  <div className="flex justify-end">
                    {credential ? (
                      <Button
                        type="button"
                        variant="ghost"
                        className="text-white/62 hover:bg-white/8 hover:text-white"
                        onClick={() => deleteCredential.mutate()}
                        disabled={deleteCredential.isPending}
                      >
                        <HugeiconsIcon icon={Delete02Icon} strokeWidth={1.8} />
                        {deleteCredential.isPending ? "Switching..." : "Switch to managed"}
                      </Button>
                    ) : (
                      <Badge
                        variant="outline"
                        className="border-grove-300/25 bg-grove-300/10 text-grove-300"
                      >
                        <HugeiconsIcon icon={CheckmarkCircle02Icon} strokeWidth={1.8} />
                        Active
                      </Badge>
                    )}
                  </div>
                </div>

                {byokProviders.map((provider) => {
                  const isConfigured = credential?.provider === provider.id;

                  return (
                    <div
                      key={provider.id}
                      className="grid min-h-16 grid-cols-[minmax(180px,1fr)_minmax(220px,2fr)_160px] items-center px-4 py-4"
                    >
                      <div className="text-base font-medium text-white">{provider.label}</div>
                      <div className="text-sm text-white/52">
                        {isConfigured ? `**** ${credential.maskedApiKeySuffix}` : "-"}
                      </div>
                      <div className="flex justify-end">
                        <Button
                          type="button"
                          variant="ghost"
                          className="text-white/62 hover:bg-white/8 hover:text-white"
                          onClick={() => {
                            setSelectedProvider(provider.id);
                            setSelectedModel(
                              isConfigured
                                ? credential.defaultModel
                                : defaultModelByProvider[provider.id],
                            );
                            setApiKey("");
                            setDialogOpen(true);
                          }}
                        >
                          {isConfigured ? "Configured" : "Configure"}
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </section>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="border border-white/8 bg-[#0b0b0b] text-white">
          <DialogHeader>
            <DialogTitle>Configure {selectedProviderLabel}</DialogTitle>
            <DialogDescription className="text-white/52">
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
                      setDialogOpen(false);
                    },
                  },
                );
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
                    placeholder={`Enter ${selectedProviderLabel} API key`}
                    className="border-white/10 bg-white/[0.03] ps-9 text-white placeholder:text-white/34 focus-visible:border-dew-500/60 focus-visible:ring-dew-500/20"
                  />
                </div>
              </label>

              <DialogFooter>
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
              </DialogFooter>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>

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
    </main>
  );
}
