"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Copy01Icon,
  Delete02Icon,
  Key01Icon,
  SaveIcon,
  Tick02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { ChevronDownIcon, EyeIcon, EyeOffIcon } from "lucide-react";
import { toast } from "sonner";

import type {
  ExternalTmsProviderCredentialListItem,
  ExternalTmsProviderKind,
} from "@/lib/providers/organization-external-tms-provider-credentials";
import { CROWDIN_OAUTH_SCOPE_GUIDE } from "@/lib/providers/adapters/crowdin/crowdin-oauth-scopes";
import { LOKALISE_OAUTH_SCOPE_GUIDE } from "@/lib/providers/adapters/lokalise/lokalise-oauth-scopes";
import { PHRASE_OAUTH_SCOPE_GUIDE } from "@/lib/providers/adapters/phrase/phrase-oauth-scopes";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { TmsUserConnectButton } from "@/components/app-shell/tms-user-connect-button";
import { apiClient } from "@/lib/api-client-instance";
import type { TmsUserConnectProviderKind } from "@/lib/providers/tms-user-connection-shared";
import { cn } from "@/lib/primitives/cn";

function TmsOAuthUserAccountBanner({
  organizationSlug,
  providerKind,
  providerName,
}: {
  organizationSlug: string;
  providerKind: TmsUserConnectProviderKind;
  providerName: string;
}) {
  const query = useQuery({
    queryKey: [`${providerKind}-user-connection`, organizationSlug],
    queryFn: async () => {
      const route =
        providerKind === "phrase"
          ? apiClient.api.orgs[":organizationSlug"]["external-tms-provider-credential"].phrase[
              "user-connection"
            ]
          : providerKind === "lokalise"
            ? apiClient.api.orgs[":organizationSlug"]["external-tms-provider-credential"].lokalise[
                "user-connection"
              ]
            : apiClient.api.orgs[":organizationSlug"]["external-tms-provider-credential"].crowdin[
                "user-connection"
              ];
      const response = await route.$get({
        param: { organizationSlug },
      });
      if (!response.ok) {
        throw new Error(`Failed to load ${providerName} user connection`);
      }

      return response.json() as Promise<{
        shouldConnectCrowdinUser?: boolean;
        shouldConnectPhraseUser?: boolean;
        shouldConnectLokaliseUser?: boolean;
        crowdinUserConnection?: { email: string | null } | null;
        phraseUserConnection?: { email: string | null } | null;
        lokaliseUserConnection?: { email: string | null } | null;
      }>;
    },
  });

  const shouldConnect =
    providerKind === "phrase"
      ? query.data?.shouldConnectPhraseUser
      : providerKind === "lokalise"
        ? query.data?.shouldConnectLokaliseUser
        : query.data?.shouldConnectCrowdinUser;

  const connection =
    providerKind === "phrase"
      ? query.data?.phraseUserConnection
      : providerKind === "lokalise"
        ? query.data?.lokaliseUserConnection
        : query.data?.crowdinUserConnection;

  if (query.isLoading || shouldConnect == null) {
    return null;
  }

  if (shouldConnect) {
    return (
      <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-4 text-sm">
        <div>
          <p className="font-medium text-foreground">Link your {providerName} account</p>
          <p className="mt-1 leading-6 text-muted-foreground">
            The workspace OAuth app is connected, but Hyperlocalise still needs your personal{" "}
            {providerName} authorization before projects, jobs, and files can load.
          </p>
        </div>
        <TmsUserConnectButton
          organizationSlug={organizationSlug}
          providerKind={providerKind}
          providerDisplayName={providerName}
        />
      </div>
    );
  }

  if (connection?.email) {
    return (
      <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm">
        <p className="font-medium text-foreground">Your {providerName} account is linked</p>
        <p className="mt-1 leading-6 text-muted-foreground">{connection.email}</p>
      </div>
    );
  }

  return null;
}

function CrowdinOAuthSetupFields({
  providerKind,
  providerName,
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
  providerKind: ExternalTmsProviderKind;
  providerName: string;
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
            {providerKind === "crowdin"
              ? "In your Crowdin OAuth App, enable every scope below. Hyperlocalise requests the same list when you connect Crowdin."
              : providerKind === "lokalise"
                ? "In your Lokalise OAuth App, enable every scope below. Hyperlocalise requests the same list when you connect Lokalise."
                : "Phrase TMS OAuth uses the scope below when Hyperlocalise requests an authorization code and exchanges it for a user bearer token."}
          </p>
        </div>
        {providerKind === "crowdin" || providerKind === "phrase" || providerKind === "lokalise" ? (
          <ul className="space-y-2">
            {(providerKind === "crowdin"
              ? CROWDIN_OAUTH_SCOPE_GUIDE
              : providerKind === "lokalise"
                ? LOKALISE_OAUTH_SCOPE_GUIDE
                : PHRASE_OAUTH_SCOPE_GUIDE
            ).map((entry) => (
              <li key={entry.scope} className="flex flex-col gap-1 sm:flex-row sm:gap-3">
                <code className="shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">
                  {entry.scope}
                </code>
                <span className="text-sm leading-6 text-muted-foreground">{entry.description}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <Field className="gap-2">
        <FieldLabel htmlFor={oauthClientIdFieldId}>OAuth client ID</FieldLabel>
        <Input
          id={oauthClientIdFieldId}
          value={oauthClientId}
          onChange={(event) => onOauthClientIdChange(event.target.value)}
          autoComplete="off"
          placeholder={`${providerName} OAuth App client ID`}
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
            placeholder={`${providerName} OAuth App client secret`}
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

export function TmsProviderCredentialPanel({
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
  const isOAuthProvider = isCrowdin || providerKind === "phrase" || providerKind === "lokalise";
  const oauthRedirectUri =
    typeof window === "undefined"
      ? ""
      : `${window.location.origin}/api/orgs/${encodeURIComponent(organizationSlug)}/external-tms-provider-credential/${providerKind}/oauth/callback`;
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
    if (!oauthRedirectUri) {
      return;
    }

    await navigator.clipboard.writeText(oauthRedirectUri);
    setRedirectUriCopied(true);
    toast.success("OAuth callback URL copied");

    if (redirectUriCopyTimeoutRef.current) {
      clearTimeout(redirectUriCopyTimeoutRef.current);
    }

    redirectUriCopyTimeoutRef.current = setTimeout(() => {
      setRedirectUriCopied(false);
    }, 2000);
  };

  const isOAuthConnected = isOAuthProvider && credential?.authMode === "oauth";
  const [oauthReconnectOpen, setOauthReconnectOpen] = useState(false);
  const showOAuthSetupFields = !isOAuthConnected || oauthReconnectOpen;

  const canSubmit = isOAuthProvider
    ? isOAuthConnected && !oauthReconnectOpen
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
      {isOAuthProvider && isOAuthConnected ? (
        <>
          <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-4 text-sm">
            <p className="font-medium text-foreground">{providerName} is connected via OAuth</p>
            <p className="leading-6 text-muted-foreground">
              Access and refresh tokens are stored encrypted. Projects, jobs, glossaries, and
              translation memories load live from {providerName} when you open those pages.
            </p>
            {credential.oauthExpiresAt ? (
              <p className="text-xs text-muted-foreground">
                Access token expires {new Date(credential.oauthExpiresAt).toLocaleString()}
              </p>
            ) : null}
          </div>
          <TmsOAuthUserAccountBanner
            organizationSlug={organizationSlug}
            providerKind={providerKind as TmsUserConnectProviderKind}
            providerName={providerName}
          />
        </>
      ) : null}

      {isOAuthProvider && !isOAuthConnected ? (
        <p className="text-sm leading-6 text-muted-foreground">
          {`Connect ${providerName} with an OAuth App. Projects, jobs, glossaries, and translation memories load live from ${providerName}. API-token setup is disabled in Hyperlocalise.`}
        </p>
      ) : !isOAuthProvider ? (
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

      {isOAuthProvider && isOAuthConnected ? (
        <Collapsible open={oauthReconnectOpen} onOpenChange={setOauthReconnectOpen}>
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
                    oauthReconnectOpen && "rotate-180",
                  )}
                  strokeWidth={2}
                />
              </Button>
            }
          />
          <CollapsibleContent className="space-y-5 pt-3">
            <CrowdinOAuthSetupFields
              providerKind={providerKind}
              providerName={providerName}
              crowdinRedirectUri={oauthRedirectUri}
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

      {isOAuthProvider && showOAuthSetupFields && !isOAuthConnected ? (
        <CrowdinOAuthSetupFields
          providerKind={providerKind}
          providerName={providerName}
          crowdinRedirectUri={oauthRedirectUri}
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

      {!isOAuthProvider ? (
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
            : isOAuthProvider
              ? isOAuthConnected
                ? `Update ${providerName}`
                : `Save ${providerName}`
              : "Save provider"}
        </Button>
      </div>
    </form>
  );
}
