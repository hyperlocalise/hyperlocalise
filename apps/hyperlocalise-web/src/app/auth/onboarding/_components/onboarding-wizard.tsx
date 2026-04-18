"use client";

import type { ComponentProps, ReactNode } from "react";
import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  ArrowLeft01Icon,
  ArrowRight01Icon,
  CheckmarkCircle02Icon,
  SparklesIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import Link from "next/link";

import type { LlmProvider } from "@/lib/database/types";
import { defaultModelByProvider, llmProviderCatalog } from "@/lib/providers/catalog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldTitle,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Progress, ProgressLabel } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

import type { CreateWorkspaceActionState, SaveProviderActionState } from "../actions";
import {
  createWorkspaceAction,
  finishOnboardingAction,
  saveProviderCredentialAction,
  skipProviderCredentialAction,
} from "../actions";

type OnboardingStep = "create" | "provider" | "ready";

type OnboardingWizardProps = {
  step: OnboardingStep;
  organizationName?: string | null;
  organizationSlug?: string | null;
  providerSummary?: {
    provider: string;
    defaultModel: string;
    maskedApiKeySuffix: string;
  } | null;
  providerSetupStatus?: "pending" | "configured" | "skipped";
};

const steps: Array<{ id: OnboardingStep; label: string; title: string }> = [
  { id: "create", label: "01", title: "Create workspace" },
  { id: "provider", label: "02", title: "Add AI provider" },
  { id: "ready", label: "03", title: "Ready to go" },
];

function SubmitButton({
  children,
  ...props
}: ComponentProps<typeof Button> & { children: ReactNode }) {
  const { pending } = useFormStatus();

  return (
    <Button disabled={pending} {...props}>
      {children}
    </Button>
  );
}

function StepProgress({ step }: { step: OnboardingStep }) {
  const stepIndex = steps.findIndex((item) => item.id === step);
  const progressValue = ((stepIndex + 1) / steps.length) * 100;

  return (
    <div className="space-y-6">
      <Progress value={progressValue} className="gap-2">
        <ProgressLabel>
          Step {stepIndex + 1} of {steps.length}
        </ProgressLabel>
        <div className="ms-auto text-sm text-muted-foreground">{steps[stepIndex]?.title}</div>
      </Progress>

      <div className="grid grid-cols-3 gap-3">
        {steps.map((item, index) => {
          const isActive = item.id === step;
          const isComplete = index < stepIndex;

          return (
            <div
              key={item.id}
              className={cn(
                "rounded-3xl border px-4 py-3 text-left transition-colors",
                isActive
                  ? "border-primary/40 bg-primary/10 text-foreground"
                  : isComplete
                    ? "border-border/70 bg-background/80 text-foreground"
                    : "border-border/60 bg-background/60 text-muted-foreground",
              )}
            >
              <div className="text-xs font-medium tracking-[0.24em] text-muted-foreground">
                {item.label}
              </div>
              <div className="mt-2 text-sm font-medium">{item.title}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CreateWorkspaceStep({ organizationName }: { organizationName?: string | null }) {
  const [state, formAction] = useActionState<CreateWorkspaceActionState, FormData>(
    createWorkspaceAction,
    {},
  );

  if (organizationName) {
    return (
      <div className="space-y-6">
        <div className="space-y-3">
          <h2 className="font-heading text-3xl font-semibold text-balance text-foreground">
            Workspace created
          </h2>
          <p className="max-w-xl text-sm leading-6 text-muted-foreground">
            Your workspace is ready. Continue to add the shared AI provider that this workspace will
            use by default.
          </p>
        </div>

        <Card className="border-border/70 bg-background/90">
          <CardHeader>
            <CardTitle>{organizationName}</CardTitle>
            <CardDescription>
              This workspace is already created. You can continue to provider setup now.
            </CardDescription>
          </CardHeader>
        </Card>

        <div className="flex justify-end">
          <Button nativeButton={false} render={<Link href="/auth/onboarding?step=provider" />}>
            Continue
            <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2} />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-6">
      <div className="space-y-3">
        <h2 className="font-heading text-3xl font-semibold text-balance text-foreground">
          Create your workspace
        </h2>
        <p className="max-w-xl text-sm leading-6 text-muted-foreground">
          Start with the workspace name. You can configure the AI provider that powers it on the
          next step.
        </p>
      </div>

      {state.error ? (
        <Alert variant="destructive">
          <AlertTitle>Workspace creation failed</AlertTitle>
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}

      <Field>
        <FieldContent>
          <FieldTitle>Workspace name</FieldTitle>
          <Input
            name="organizationName"
            placeholder="Acme localisation"
            defaultValue=""
            aria-invalid={Boolean(state.fieldErrors?.organizationName)}
          />
          <FieldDescription>
            This name becomes the workspace label people see across projects and settings.
          </FieldDescription>
          <FieldError>{state.fieldErrors?.organizationName}</FieldError>
        </FieldContent>
      </Field>

      <div className="flex justify-end">
        <SubmitButton nativeButton type="submit">
          Create workspace
          <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2} />
        </SubmitButton>
      </div>
    </form>
  );
}

function ProviderCredentialStep({
  providerSummary,
}: {
  providerSummary?: OnboardingWizardProps["providerSummary"];
}) {
  const [selectedProvider, setSelectedProvider] = useState<LlmProvider>(
    (providerSummary?.provider as LlmProvider | undefined) ?? "openai",
  );
  const [selectedModel, setSelectedModel] = useState(
    providerSummary?.defaultModel ?? defaultModelByProvider[selectedProvider],
  );
  const [state, formAction] = useActionState<SaveProviderActionState, FormData>(
    saveProviderCredentialAction,
    {},
  );

  useEffect(() => {
    if (
      !(llmProviderCatalog[selectedProvider].models as readonly string[]).includes(selectedModel)
    ) {
      setSelectedModel(defaultModelByProvider[selectedProvider]);
    }
  }, [selectedModel, selectedProvider]);

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <h2 className="font-heading text-3xl font-semibold text-balance text-foreground">
          Add an AI provider
        </h2>
        <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
          Save one shared provider for this workspace. We will validate the credential before
          finishing setup.
        </p>
      </div>

      {providerSummary ? (
        <Alert>
          <AlertTitle>Current workspace default</AlertTitle>
          <AlertDescription>
            {llmProviderCatalog[providerSummary.provider as LlmProvider]?.label ??
              providerSummary.provider}{" "}
            is already configured with {providerSummary.defaultModel}. The saved key ends in{" "}
            {providerSummary.maskedApiKeySuffix}. Enter a new key below only if you want to replace
            it.
          </AlertDescription>
        </Alert>
      ) : null}

      {state.error ? (
        <Alert variant="destructive">
          <AlertTitle>Provider validation failed</AlertTitle>
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}

      <form action={formAction} className="space-y-6">
        <input type="hidden" name="provider" value={selectedProvider} />
        <input type="hidden" name="defaultModel" value={selectedModel} />

        <Field>
          <FieldContent>
            <FieldTitle>Provider</FieldTitle>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {Object.entries(llmProviderCatalog).map(([provider, providerConfig]) => {
                const isActive = provider === selectedProvider;

                return (
                  <button
                    key={provider}
                    type="button"
                    onClick={() => {
                      setSelectedProvider(provider as LlmProvider);
                      setSelectedModel(defaultModelByProvider[provider as LlmProvider]);
                    }}
                    className={cn(
                      "rounded-3xl border px-4 py-4 text-left transition-colors",
                      isActive
                        ? "border-primary/40 bg-primary/10 text-foreground shadow-[0_12px_30px_rgba(79,180,141,0.12)]"
                        : "border-border/70 bg-background/80 text-foreground hover:border-primary/25 hover:bg-primary/5",
                    )}
                  >
                    <div className="text-sm font-medium">{providerConfig.label}</div>
                    <div className="mt-2 text-xs text-muted-foreground">
                      {providerConfig.models.length} curated models
                    </div>
                  </button>
                );
              })}
            </div>
            <FieldError>{state.fieldErrors?.provider}</FieldError>
          </FieldContent>
        </Field>

        <Field>
          <FieldContent>
            <FieldTitle>Default model</FieldTitle>
            <select
              value={selectedModel}
              onChange={(event) => setSelectedModel(event.target.value)}
              className="h-10 w-full rounded-4xl border border-input bg-input/30 px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
              aria-invalid={Boolean(state.fieldErrors?.defaultModel)}
            >
              {llmProviderCatalog[selectedProvider].models.map((model) => (
                <option key={model} value={model}>
                  {model}
                </option>
              ))}
            </select>
            <FieldDescription>
              This becomes the initial workspace default for AI translation work.
            </FieldDescription>
            <FieldError>{state.fieldErrors?.defaultModel}</FieldError>
          </FieldContent>
        </Field>

        <Field>
          <FieldContent>
            <FieldTitle>API key</FieldTitle>
            <Input
              name="apiKey"
              type="password"
              autoComplete="off"
              placeholder={`Enter your ${llmProviderCatalog[selectedProvider].label} API key`}
              aria-invalid={Boolean(state.fieldErrors?.apiKey)}
            />
            <FieldDescription>
              The key is encrypted at rest in Postgres and only decrypted inside server-only code
              paths.
            </FieldDescription>
            <FieldError>{state.fieldErrors?.apiKey}</FieldError>
          </FieldContent>
        </Field>

        <div className="flex flex-wrap justify-between gap-3">
          <Button
            variant="ghost"
            nativeButton={false}
            render={<Link href="/auth/onboarding?step=create" />}
          >
            <HugeiconsIcon icon={ArrowLeft01Icon} strokeWidth={2} />
            Back
          </Button>

          <div className="flex flex-wrap gap-3">
            <SubmitButton
              nativeButton
              type="submit"
              variant="outline"
              formAction={skipProviderCredentialAction}
            >
              Skip for now
            </SubmitButton>
            <SubmitButton nativeButton type="submit">
              Save provider
              <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2} />
            </SubmitButton>
          </div>
        </div>
      </form>
    </div>
  );
}

function ReadyStep({
  organizationName,
  organizationSlug,
  providerSummary,
  providerSetupStatus,
}: {
  organizationName?: string | null;
  organizationSlug?: string | null;
  providerSummary?: OnboardingWizardProps["providerSummary"];
  providerSetupStatus?: OnboardingWizardProps["providerSetupStatus"];
}) {
  const providerConfigured = Boolean(providerSummary);

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <h2 className="font-heading text-3xl font-semibold text-balance text-foreground">
          Your workspace is ready
        </h2>
        <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
          Enter the dashboard and start creating projects. Team invites can come after this.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="border-border/70 bg-background/90">
          <CardHeader>
            <CardTitle>{organizationName ?? "Workspace"}</CardTitle>
            <CardDescription>Workspace slug: {organizationSlug ?? "pending"}</CardDescription>
          </CardHeader>
        </Card>
        <Card className="border-border/70 bg-background/90">
          <CardHeader>
            <CardTitle>{providerConfigured ? "Provider configured" : "Provider skipped"}</CardTitle>
            <CardDescription>
              {providerConfigured && providerSummary
                ? `${llmProviderCatalog[providerSummary.provider as LlmProvider]?.label ?? providerSummary.provider} • ${providerSummary.defaultModel}`
                : providerSetupStatus === "skipped"
                  ? "You can add a provider later from workspace settings."
                  : "Add a provider before running AI-powered translation jobs."}
            </CardDescription>
          </CardHeader>
        </Card>
      </div>

      <Alert>
        <HugeiconsIcon
          icon={providerConfigured ? CheckmarkCircle02Icon : SparklesIcon}
          strokeWidth={2}
        />
        <AlertTitle>
          {providerConfigured ? "Activation complete" : "One setup task left for AI runs"}
        </AlertTitle>
        <AlertDescription>
          {providerConfigured
            ? "The workspace has a validated shared provider and is ready for first use."
            : "The workspace exists and you can explore it now. AI actions will prompt for provider setup later."}
        </AlertDescription>
      </Alert>

      <div className="flex flex-wrap justify-between gap-3">
        <Button
          variant="ghost"
          nativeButton={false}
          render={<Link href="/auth/onboarding?step=provider" />}
        >
          <HugeiconsIcon icon={ArrowLeft01Icon} strokeWidth={2} />
          Back
        </Button>

        <form action={finishOnboardingAction}>
          <SubmitButton nativeButton type="submit">
            Enter workspace
            <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2} />
          </SubmitButton>
        </form>
      </div>
    </div>
  );
}

export function OnboardingWizard(props: OnboardingWizardProps) {
  return (
    <main className="min-h-svh bg-[radial-gradient(circle_at_top,rgba(79,180,141,0.16),transparent_55%),linear-gradient(180deg,#f7f8f7_0%,#eef2ee_100%)] px-4 py-8 text-foreground sm:px-6 sm:py-12">
      <div className="mx-auto flex min-h-[calc(100svh-4rem)] w-full max-w-5xl items-center justify-center">
        <Card className="w-full border-border/70 bg-background/92 shadow-[0_28px_80px_rgba(15,23,42,0.12)] backdrop-blur">
          <CardContent className="grid gap-10 p-6 sm:p-8 lg:grid-cols-[0.9fr_1.1fr] lg:p-10">
            <div className="space-y-8">
              <div className="space-y-3">
                <div className="text-xs font-medium tracking-[0.28em] text-muted-foreground uppercase">
                  Hyperlocalise cloud setup
                </div>
                <h1 className="font-heading text-4xl leading-tight font-semibold text-balance text-foreground">
                  Stand up the workspace before the first translation run.
                </h1>
                <p className="text-sm leading-6 text-muted-foreground">
                  The onboarding flow stays linear on purpose: create the workspace, set its
                  provider defaults, then land in the product without detours.
                </p>
              </div>

              <StepProgress step={props.step} />
            </div>

            <div className="rounded-[2rem] border border-border/70 bg-background/80 p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.5)] sm:p-8">
              {props.step === "create" ? (
                <CreateWorkspaceStep organizationName={props.organizationName} />
              ) : null}
              {props.step === "provider" ? (
                <ProviderCredentialStep providerSummary={props.providerSummary} />
              ) : null}
              {props.step === "ready" ? (
                <ReadyStep
                  organizationName={props.organizationName}
                  organizationSlug={props.organizationSlug}
                  providerSummary={props.providerSummary}
                  providerSetupStatus={props.providerSetupStatus}
                />
              ) : null}
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
