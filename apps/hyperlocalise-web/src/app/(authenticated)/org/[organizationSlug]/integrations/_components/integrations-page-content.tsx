"use client";

import { useEffect, useId, useState } from "react";
import Image from "next/image";
import {
  CheckmarkCircle02Icon,
  Clock01Icon,
  Delete02Icon,
  Key01Icon,
  SaveIcon,
} from "@hugeicons/core-free-icons";
import { EyeIcon, EyeOffIcon } from "lucide-react";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import type { LlmProvider } from "@/lib/database/types";
import { defaultModelByProvider, llmProviderCatalog } from "@/lib/providers/catalog";
import { createApiClient } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
  const [showApiKey, setShowApiKey] = useState(false);

  const modelFieldId = useId();
  const apiKeyFieldId = useId();

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
          <TypographyH1 className="font-heading text-2xl font-medium text-foreground md:text-2xl">
            Integrations
          </TypographyH1>
          <TypographyP className="mt-1 max-w-2xl text-sm leading-6 text-foreground/52">
            Configure the model provider Hyperlocalise uses for translation runs and prepare TMS
            handoffs for approved copy.
          </TypographyP>
        </div>
        <Badge
          variant="outline"
          className="rounded-full border-foreground/10 bg-foreground/5 text-foreground/68 lg:self-start"
        >
          Workspace level
        </Badge>
      </div>

      <section className="flex flex-col gap-4">
        <div>
          <TypographyH2 className="font-heading text-xl font-medium text-foreground md:text-xl">
            Model Provider
          </TypographyH2>
          <TypographyP className="mt-1 max-w-2xl text-sm leading-6 text-foreground/52">
            Choose how Hyperlocalise runs translations: use our managed provider or bring your own
            API keys.
          </TypographyP>
        </div>

        <div className="overflow-x-auto rounded-lg border border-foreground/8 bg-foreground/2.5">
          {isLoading ? (
            <div className="flex flex-col px-5 py-4 lg:px-6">
              <Skeleton className="my-3 h-12 rounded-lg bg-foreground/5" />
              <Skeleton className="my-3 h-12 rounded-lg bg-foreground/5" />
              <Skeleton className="my-3 h-12 rounded-lg bg-foreground/5" />
              <Skeleton className="my-3 h-12 rounded-lg bg-foreground/5" />
            </div>
          ) : (
            <div className="min-w-[640px]">
              <div className="grid grid-cols-[minmax(180px,1fr)_minmax(220px,2fr)_160px] border-b border-foreground/8 px-4 py-4 text-xs font-medium tracking-[0.08em] text-foreground/46 uppercase">
                <div>Provider</div>
                <div>API key</div>
                <div className="text-right">
                  <span className="sr-only">Actions</span>
                </div>
              </div>
              <div className="divide-y divide-foreground/8">
                <div className="grid min-h-16 grid-cols-[minmax(180px,1fr)_minmax(220px,2fr)_160px] items-center px-4 py-4">
                  <div className="flex items-center gap-3">
                    <div className="text-base font-medium text-foreground">
                      {hyperlocaliseGoProvider.label}
                    </div>
                    <Badge
                      variant="outline"
                      className="border-foreground/10 bg-foreground/5 text-foreground/52 text-[10px]"
                    >
                      Managed
                    </Badge>
                  </div>
                  <div className="text-sm text-foreground/52">{hyperlocaliseGoProvider.apiKey}</div>
                  <div className="flex justify-end">
                    {credential ? (
                      <Button
                        type="button"
                        variant="ghost"
                        className="text-foreground/62 hover:bg-foreground/8 hover:text-foreground"
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
                      <div className="text-base font-medium text-foreground">{provider.label}</div>
                      <div className="text-sm text-foreground/52">
                        {isConfigured ? `**** ${credential.maskedApiKeySuffix}` : "-"}
                      </div>
                      <div className="flex justify-end">
                        <Button
                          type="button"
                          variant="ghost"
                          className="text-foreground/62 hover:bg-foreground/8 hover:text-foreground"
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
        <DialogContent className="border border-foreground/8 bg-foreground/2.5 text-foreground">
          <DialogHeader>
            <DialogTitle>Configure {selectedProviderLabel}</DialogTitle>
            <DialogDescription className="text-foreground/52">
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
                  <SelectTrigger
                    id={modelFieldId}
                    className="h-9 w-full border-foreground/10 bg-foreground/3 text-foreground focus-visible:border-dew-500/60 focus-visible:ring-dew-500/20"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#0b0b0b] text-foreground">
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
                    className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-foreground/38"
                  />
                  <Input
                    id={apiKeyFieldId}
                    type={showApiKey ? "text" : "password"}
                    autoComplete="off"
                    value={apiKey}
                    onChange={(event) => setApiKey(event.target.value)}
                    placeholder={`Enter ${selectedProviderLabel} API key`}
                    className="border-foreground/10 bg-foreground/3 ps-9 pe-9 text-foreground placeholder:text-foreground/34 focus-visible:border-dew-500/60 focus-visible:ring-dew-500/20"
                  />
                  <button
                    type="button"
                    onClick={() => setShowApiKey(!showApiKey)}
                    className="absolute top-1/2 right-3 -translate-y-1/2 text-foreground/38 transition-colors hover:text-foreground"
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
                  className="border-foreground/10 bg-transparent text-foreground hover:bg-foreground/8 hover:text-foreground"
                  onClick={() => deleteCredential.mutate()}
                  disabled={!credential || deleteCredential.isPending}
                >
                  <HugeiconsIcon icon={Delete02Icon} strokeWidth={1.8} />
                  {deleteCredential.isPending ? "Disconnecting..." : "Disconnect"}
                </Button>
                <Button
                  type="submit"
                  className="bg-foreground text-background hover:bg-foreground/90"
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
          <TypographyH2 className="font-heading text-xl font-medium text-foreground md:text-xl">
            TMS
          </TypographyH2>
          <TypographyP className="mt-1 max-w-2xl text-sm leading-6 text-foreground/52">
            Translation management system sync is staged for a later release. These connectors are
            visible now so teams can plan the handoff path.
          </TypographyP>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {tmsIntegrations.map((integration) => (
            <Card
              key={integration.name}
              className="rounded-lg border border-foreground/8 bg-foreground/2.5 py-0 text-foreground opacity-78 ring-0"
            >
              <CardHeader className="gap-4 px-5 py-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex min-w-0 items-start gap-3">
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-foreground/10 bg-foreground p-2">
                      <Image
                        src={integration.logo}
                        alt=""
                        width={30}
                        height={30}
                        className="max-h-7 w-auto object-contain"
                      />
                    </div>
                    <div className="min-w-0">
                      <CardTitle className="text-base font-medium text-foreground">
                        {integration.name}
                      </CardTitle>
                      <CardDescription className="mt-1 text-foreground/46">
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
