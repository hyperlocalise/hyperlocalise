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
import { useEffect, useId, useMemo, useState } from "react";
import { Delete02Icon, Key01Icon, SaveIcon, ViewIcon, ViewOffSlashIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { SimpleIcon } from "simple-icons";
import { siAnthropic, siGooglegemini } from "simple-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormattedMessage, useIntl, type IntlShape } from "react-intl";
import { toast } from "sonner";

import type { LlmProvider } from "@/lib/database/types";
import { defaultModelByProvider, llmProviderCatalog } from "@/lib/providers/shared/catalog";
import { createApiClient } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { TypographyH1, TypographyP } from "@/components/ui/typography";
import {
  ModelProviderCard,
  type ModelProviderCardConfig,
} from "../../integrations/_components/model-provider-card";

import { aiEnginePageContentMessages } from "./ai-engine-page-content.messages";

const api = createApiClient();

type AiEnginePageContentProps = {
  organizationSlug: string;
  canManageAiEngine: boolean;
};

type ProviderCredentialSummary = {
  provider: LlmProvider;
  defaultModel: string;
  maskedApiKeySuffix: string;
  lastValidatedAt: string;
};

type ManagedProviderId = "hyperlocalise-go";
type ProviderOptionId = LlmProvider | ManagedProviderId;

const hyperlocaliseGoProviderId = "hyperlocalise-go" as const satisfies ManagedProviderId;

const byokProviderMeta = [
  {
    id: "openai",
    logo: "/images/openai-old-logo.webp",
  },
  {
    id: "anthropic",
    logo: "/images/claude.png",
    icon: siAnthropic,
  },
  {
    id: "gemini",
    logo: "/images/gemini.webp",
    icon: siGooglegemini,
  },
] as const satisfies readonly {
  id: LlmProvider;
  logo: string;
  icon?: SimpleIcon;
}[];

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

function useSaveProviderCredential(organizationSlug: string, intl: IntlShape) {
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
          "message" in error && typeof error.message === "string"
            ? error.message
            : "Unable to validate provider credential",
        );
      }

      const data = await res.json();
      return data.providerCredential as ProviderCredentialSummary;
    },
    onSuccess: async (_, payload) => {
      await queryClient.invalidateQueries({ queryKey: ["provider-credential", organizationSlug] });
      toast.success(
        intl.formatMessage(aiEnginePageContentMessages.providerSavedToast, {
          providerLabel: llmProviderCatalog[payload.provider].label,
        }),
      );
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });
}

function useDeleteProviderCredential(organizationSlug: string, intl: IntlShape) {
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
      toast.success(intl.formatMessage(aiEnginePageContentMessages.llmProviderDisconnectedToast));
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });
}

export function AiEnginePageContent({
  organizationSlug,
  canManageAiEngine,
}: AiEnginePageContentProps) {
  const intl = useIntl();
  const { data: credential, isLoading } = useProviderCredential(organizationSlug);
  const saveCredential = useSaveProviderCredential(organizationSlug, intl);
  const deleteCredential = useDeleteProviderCredential(organizationSlug, intl);
  const [selectedProvider, setSelectedProvider] = useState<ProviderOptionId | null>(null);
  const [selectedModel, setSelectedModel] = useState(defaultModelByProvider.openai);
  const [apiKey, setApiKey] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);

  const modelFieldId = useId();
  const apiKeyFieldId = useId();

  const hyperlocaliseGoProvider = useMemo(
    () => ({
      id: hyperlocaliseGoProviderId,
      label: intl.formatMessage(aiEnginePageContentMessages.hyperlocaliseGoLabel),
      description: intl.formatMessage(aiEnginePageContentMessages.hyperlocaliseGoDescription),
      logo: "/images/logo.png",
    }),
    [intl],
  );

  const byokProviders = useMemo(
    () =>
      byokProviderMeta.map((provider) => {
        const copyById = {
          openai: {
            label: aiEnginePageContentMessages.openAiLabel,
            description: aiEnginePageContentMessages.openAiDescription,
          },
          anthropic: {
            label: aiEnginePageContentMessages.anthropicLabel,
            description: aiEnginePageContentMessages.anthropicDescription,
          },
          gemini: {
            label: aiEnginePageContentMessages.geminiLabel,
            description: aiEnginePageContentMessages.geminiDescription,
          },
        } as const;

        const copy = copyById[provider.id];

        return {
          ...provider,
          label: intl.formatMessage(copy.label),
          description: intl.formatMessage(copy.description),
        };
      }),
    [intl],
  );

  const modelProviderCards = useMemo<readonly ModelProviderCardConfig[]>(
    () => [hyperlocaliseGoProvider, ...byokProviders],
    [byokProviders, hyperlocaliseGoProvider],
  );

  useEffect(() => {
    if (!credential || selectedProvider !== credential.provider) {
      return;
    }

    setSelectedModel(credential.defaultModel);
  }, [credential, selectedProvider]);

  useEffect(() => {
    if (!selectedProvider || selectedProvider === hyperlocaliseGoProviderId) {
      return;
    }

    if (
      !(llmProviderCatalog[selectedProvider].models as readonly string[]).includes(selectedModel)
    ) {
      setSelectedModel(defaultModelByProvider[selectedProvider]);
    }
  }, [selectedModel, selectedProvider]);

  const selectedByokProvider =
    selectedProvider && selectedProvider !== hyperlocaliseGoProviderId ? selectedProvider : null;
  const selectedProviderConfig = selectedByokProvider
    ? llmProviderCatalog[selectedByokProvider]
    : null;
  const selectedProviderLabel =
    byokProviders.find((provider) => provider.id === selectedByokProvider)?.label ??
    selectedProviderConfig?.label;

  return (
    <main className="space-y-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex flex-col gap-1.5">
          <TypographyH1 className="font-heading text-2xl font-medium text-foreground md:text-2xl">
            <FormattedMessage {...aiEnginePageContentMessages.pageTitle} />
          </TypographyH1>
          <TypographyP className="max-w-2xl text-sm leading-6 text-muted-foreground">
            <FormattedMessage {...aiEnginePageContentMessages.pageDescription} />
          </TypographyP>
        </div>
        <Badge variant="outline" className="rounded-full lg:self-start">
          <FormattedMessage {...aiEnginePageContentMessages.workspaceLevelBadge} />
        </Badge>
      </div>

      {canManageAiEngine ? (
        <>
          {isLoading ? (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {modelProviderCards.map((provider) => (
                <Skeleton key={provider.id} className="min-h-44 rounded-lg" />
              ))}
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {modelProviderCards.map((provider) => {
                const isManaged = provider.id === hyperlocaliseGoProviderId;
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
                      isManaged
                        ? isActive
                          ? undefined
                          : intl.formatMessage(aiEnginePageContentMessages.switchToManagedFooter)
                        : intl.formatMessage(aiEnginePageContentMessages.configureFooter)
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

          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>
                  {intl.formatMessage(aiEnginePageContentMessages.configureDialogTitle, {
                    providerLabel: selectedProviderLabel ?? "",
                  })}
                </DialogTitle>
                <DialogDescription>
                  {intl.formatMessage(aiEnginePageContentMessages.configureDialogDescription)}
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
                    <FieldLabel htmlFor={modelFieldId}>
                      {intl.formatMessage(aiEnginePageContentMessages.defaultModelLabel)}
                    </FieldLabel>
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
                    <FieldLabel htmlFor={apiKeyFieldId}>
                      {intl.formatMessage(aiEnginePageContentMessages.apiKeyLabel)}
                    </FieldLabel>
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
                        placeholder={intl.formatMessage(
                          aiEnginePageContentMessages.apiKeyPlaceholder,
                          { providerLabel: selectedProviderLabel ?? "" },
                        )}
                        className="ps-9 pe-9"
                      />
                      <button
                        type="button"
                        onClick={() => setShowApiKey(!showApiKey)}
                        className="absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                        aria-label={intl.formatMessage(
                          showApiKey
                            ? aiEnginePageContentMessages.hideApiKeyAriaLabel
                            : aiEnginePageContentMessages.showApiKeyAriaLabel,
                        )}
                      >
                        {showApiKey ? (
                          <HugeiconsIcon icon={ViewOffSlashIcon} size={16} />
                        ) : (
                          <HugeiconsIcon icon={ViewIcon} size={16} />
                        )}
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
                      {deleteCredential.isPending
                        ? intl.formatMessage(aiEnginePageContentMessages.disconnecting)
                        : intl.formatMessage(aiEnginePageContentMessages.disconnect)}
                    </Button>
                    <Button type="submit" disabled={!apiKey.trim() || saveCredential.isPending}>
                      <HugeiconsIcon icon={SaveIcon} strokeWidth={1.8} />
                      {saveCredential.isPending
                        ? intl.formatMessage(aiEnginePageContentMessages.validating)
                        : intl.formatMessage(aiEnginePageContentMessages.saveProvider)}
                    </Button>
                  </DialogFooter>
                </form>
              ) : null}
            </DialogContent>
          </Dialog>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          <FormattedMessage {...aiEnginePageContentMessages.noAccess} />
        </p>
      )}
    </main>
  );
}
