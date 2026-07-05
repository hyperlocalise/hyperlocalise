"use client";

import { useEffect, useRef, useState } from "react";
import {
  Copy01Icon,
  Delete02Icon,
  Key01Icon,
  SaveIcon,
  Tick02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { ChevronDownIcon, EyeIcon, EyeOffIcon } from "lucide-react";
import { FormattedMessage, useIntl, type IntlShape, type MessageDescriptor } from "react-intl";
import { toast } from "sonner";

import { tmsProviderCredentialPanelMessages } from "./tms-provider-credential-panel.messages";
import type { ExternalTmsProviderCredentialListItem } from "@/lib/providers/contracts/external-tms-provider-credential";
import type { ExternalTmsProviderKind } from "@/lib/providers/contracts/external-tms-provider-kind";
import {
  OAUTH_AUTH_MODE,
  PAT_AUTH_MODE,
} from "@/lib/providers/contracts/external-tms-provider-credential";
import { CROWDIN_OAUTH_SCOPE_GUIDE } from "@/lib/providers/adapters/crowdin/crowdin-oauth-scopes";
import { PHRASE_OAUTH_SCOPE_GUIDE } from "@/lib/providers/adapters/phrase/phrase-oauth-scopes";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/primitives/cn";

const baseUrlGuidanceMessages = {
  crowdin: tmsProviderCredentialPanelMessages.baseUrlGuidanceCrowdin,
  phrase: tmsProviderCredentialPanelMessages.baseUrlGuidancePhrase,
  lokalise: tmsProviderCredentialPanelMessages.baseUrlGuidanceLokalise,
  smartling: tmsProviderCredentialPanelMessages.baseUrlGuidanceSmartling,
} satisfies Record<ExternalTmsProviderKind, MessageDescriptor>;

const baseUrlPlaceholderMessages = {
  crowdin: tmsProviderCredentialPanelMessages.baseUrlPlaceholderCrowdin,
  phrase: tmsProviderCredentialPanelMessages.baseUrlPlaceholderPhrase,
  lokalise: tmsProviderCredentialPanelMessages.baseUrlPlaceholderLokalise,
  smartling: tmsProviderCredentialPanelMessages.baseUrlPlaceholderSmartling,
} satisfies Record<ExternalTmsProviderKind, MessageDescriptor>;

function getTmsBaseUrlGuidance(intl: IntlShape, providerKind: ExternalTmsProviderKind): string {
  return intl.formatMessage(baseUrlGuidanceMessages[providerKind]);
}

function getTmsBaseUrlPlaceholder(intl: IntlShape, providerKind: ExternalTmsProviderKind): string {
  return intl.formatMessage(baseUrlPlaceholderMessages[providerKind]);
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
  allowExistingCredentials,
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
  allowExistingCredentials?: boolean;
}) {
  const intl = useIntl();

  return (
    <>
      <Field className="gap-2">
        <FieldLabel htmlFor={redirectUriFieldId}>
          {intl.formatMessage(tmsProviderCredentialPanelMessages.oauthCallbackUrlLabel)}
        </FieldLabel>
        <InputGroup className="h-10 bg-muted/30">
          <InputGroupInput
            id={redirectUriFieldId}
            readOnly
            tabIndex={-1}
            value={crowdinRedirectUri}
            aria-label={intl.formatMessage(
              tmsProviderCredentialPanelMessages.oauthCallbackUrlAriaLabel,
            )}
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
                    aria-label={intl.formatMessage(
                      redirectUriCopied
                        ? tmsProviderCredentialPanelMessages.copiedOAuthCallbackUrlAriaLabel
                        : tmsProviderCredentialPanelMessages.copyOAuthCallbackUrlAriaLabel,
                    )}
                  >
                    <HugeiconsIcon
                      icon={redirectUriCopied ? Tick02Icon : Copy01Icon}
                      strokeWidth={1.8}
                    />
                  </InputGroupButton>
                }
              />
              <TooltipContent>
                {intl.formatMessage(
                  redirectUriCopied
                    ? tmsProviderCredentialPanelMessages.copiedTooltip
                    : tmsProviderCredentialPanelMessages.copyOAuthCallbackUrlTooltip,
                )}
              </TooltipContent>
            </Tooltip>
          </InputGroupAddon>
        </InputGroup>
      </Field>

      <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-4">
        <div>
          <p className="text-sm font-medium text-foreground">
            <FormattedMessage {...tmsProviderCredentialPanelMessages.requiredOAuthScopesTitle} />
          </p>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            <FormattedMessage
              {...(providerKind === "crowdin"
                ? tmsProviderCredentialPanelMessages.crowdinOAuthScopesDescription
                : tmsProviderCredentialPanelMessages.phraseOAuthScopesDescription)}
            />
          </p>
        </div>
        {providerKind === "crowdin" || providerKind === "phrase" ? (
          <ul className="space-y-2">
            {(providerKind === "crowdin"
              ? CROWDIN_OAUTH_SCOPE_GUIDE
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
        <FieldLabel htmlFor={oauthClientIdFieldId}>
          {intl.formatMessage(tmsProviderCredentialPanelMessages.oauthClientIdLabel)}
        </FieldLabel>
        <Input
          id={oauthClientIdFieldId}
          value={oauthClientId}
          onChange={(event) => onOauthClientIdChange(event.target.value)}
          autoComplete="off"
          placeholder={intl.formatMessage(
            allowExistingCredentials
              ? tmsProviderCredentialPanelMessages.oauthClientIdPlaceholderKeep
              : tmsProviderCredentialPanelMessages.oauthClientIdPlaceholderNew,
            { providerName },
          )}
        />
      </Field>

      <Field className="gap-2">
        <FieldLabel htmlFor={oauthClientSecretFieldId}>
          {intl.formatMessage(tmsProviderCredentialPanelMessages.oauthClientSecretLabel)}
        </FieldLabel>
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
            placeholder={intl.formatMessage(
              allowExistingCredentials
                ? tmsProviderCredentialPanelMessages.oauthClientSecretPlaceholderKeep
                : tmsProviderCredentialPanelMessages.oauthClientSecretPlaceholderNew,
              { providerName },
            )}
            className="ps-9 pe-9"
          />
          <button
            type="button"
            onClick={onToggleShowSecret}
            className="absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
            aria-label={intl.formatMessage(
              showSecret
                ? tmsProviderCredentialPanelMessages.hideSecretAriaLabel
                : tmsProviderCredentialPanelMessages.showSecretAriaLabel,
            )}
          >
            {showSecret ? <EyeOffIcon size={16} /> : <EyeIcon size={16} />}
          </button>
        </div>
      </Field>
    </>
  );
}

type CrowdinAuthMode = typeof OAUTH_AUTH_MODE | typeof PAT_AUTH_MODE;

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
  crowdinAuthMode?: CrowdinAuthMode;
  onCrowdinAuthModeChange?: (value: CrowdinAuthMode) => void;
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
  crowdinAuthModeFieldId?: string;
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
  crowdinAuthMode = OAUTH_AUTH_MODE,
  onCrowdinAuthModeChange,
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
  crowdinAuthModeFieldId,
}: TmsProviderCredentialPanelProps) {
  const intl = useIntl();
  const isCrowdin = providerKind === "crowdin";
  const isCrowdinOAuthMode = isCrowdin && crowdinAuthMode === OAUTH_AUTH_MODE;
  const isCrowdinPatMode = isCrowdin && crowdinAuthMode === PAT_AUTH_MODE;
  const isOAuthProvider =
    isCrowdinOAuthMode || providerKind === "phrase" || providerKind === "lokalise";
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
    toast.success(
      intl.formatMessage(tmsProviderCredentialPanelMessages.oauthCallbackUrlCopiedToast),
    );

    if (redirectUriCopyTimeoutRef.current) {
      clearTimeout(redirectUriCopyTimeoutRef.current);
    }

    redirectUriCopyTimeoutRef.current = setTimeout(() => {
      setRedirectUriCopied(false);
    }, 2000);
  };

  const isOAuthConnected =
    isOAuthProvider &&
    credential?.authMode === OAUTH_AUTH_MODE &&
    (!isCrowdin || crowdinAuthMode === OAUTH_AUTH_MODE);
  const isPatConnected =
    isCrowdin && credential?.authMode === PAT_AUTH_MODE && crowdinAuthMode === PAT_AUTH_MODE;
  const [oauthReconnectOpen, setOauthReconnectOpen] = useState(false);
  const showOAuthSetupFields = !isOAuthConnected || oauthReconnectOpen;
  const hasPartialOAuthCredentials =
    Boolean(oauthClientId.trim()) !== Boolean(oauthClientSecret.trim());

  const canSubmit = isCrowdinPatMode
    ? Boolean(displayName.trim())
    : isOAuthProvider
      ? isOAuthConnected && !oauthReconnectOpen
        ? Boolean(displayName.trim()) && !hasPartialOAuthCredentials
        : Boolean(displayName.trim()) &&
          !hasPartialOAuthCredentials &&
          (isOAuthConnected || Boolean(oauthClientId.trim() && oauthClientSecret.trim()))
      : Boolean(displayName.trim() && secret.trim());
  const showOrgApiTokenField = !isOAuthProvider && !isCrowdinPatMode;

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(event) => {
        event.preventDefault();
        onSave();
      }}
    >
      {isOAuthProvider && isOAuthConnected ? (
        <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-4 text-sm">
          <p className="font-medium text-foreground">
            <FormattedMessage
              {...tmsProviderCredentialPanelMessages.oauthConnectedTitle}
              values={{ providerName }}
            />
          </p>
          <p className="leading-6 text-muted-foreground">
            <FormattedMessage
              {...tmsProviderCredentialPanelMessages.oauthConnectedDescription}
              values={{ providerName }}
            />
          </p>
          {credential.oauthExpiresAt ? (
            <p className="text-xs text-muted-foreground">
              {intl.formatMessage(tmsProviderCredentialPanelMessages.accessTokenExpires, {
                expiresAt: new Date(credential.oauthExpiresAt).toLocaleString(),
              })}
            </p>
          ) : null}
        </div>
      ) : null}

      {isPatConnected ? (
        <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-4 text-sm">
          <p className="font-medium text-foreground">
            <FormattedMessage
              {...tmsProviderCredentialPanelMessages.patConnectedTitle}
              values={{ providerName }}
            />
          </p>
          <p className="leading-6 text-muted-foreground">
            <FormattedMessage {...tmsProviderCredentialPanelMessages.patConnectedDescription} />
          </p>
        </div>
      ) : null}

      {isCrowdin && onCrowdinAuthModeChange && crowdinAuthModeFieldId ? (
        <Field className="gap-2">
          <FieldLabel htmlFor={crowdinAuthModeFieldId}>
            {intl.formatMessage(tmsProviderCredentialPanelMessages.authenticationMethodLabel)}
          </FieldLabel>
          <FieldDescription>
            <FormattedMessage
              {...tmsProviderCredentialPanelMessages.authenticationMethodDescription}
            />
          </FieldDescription>
          <Select
            value={crowdinAuthMode}
            onValueChange={(value) => {
              if (value === OAUTH_AUTH_MODE || value === PAT_AUTH_MODE) {
                onCrowdinAuthModeChange(value);
              }
            }}
          >
            <SelectTrigger id={crowdinAuthModeFieldId} className="h-9 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={OAUTH_AUTH_MODE}>
                {intl.formatMessage(tmsProviderCredentialPanelMessages.oauthAppRecommended)}
              </SelectItem>
              <SelectItem value={PAT_AUTH_MODE}>
                {intl.formatMessage(tmsProviderCredentialPanelMessages.personalAccessTokenOption)}
              </SelectItem>
            </SelectContent>
          </Select>
        </Field>
      ) : null}

      {isOAuthProvider && !isOAuthConnected ? (
        <p className="text-sm leading-6 text-muted-foreground">
          <FormattedMessage
            {...tmsProviderCredentialPanelMessages.connectOAuthIntro}
            values={{ providerName }}
          />
        </p>
      ) : isCrowdinPatMode && !isPatConnected ? (
        <p className="text-sm leading-6 text-muted-foreground">
          <FormattedMessage {...tmsProviderCredentialPanelMessages.crowdinPatIntro} />
        </p>
      ) : !isOAuthProvider ? (
        <p className="text-sm leading-6 text-muted-foreground">
          <FormattedMessage
            {...tmsProviderCredentialPanelMessages.saveCredentialsIntro}
            values={{ providerName }}
          />
        </p>
      ) : null}

      <Field className="gap-2">
        <FieldLabel htmlFor={displayNameFieldId}>
          {intl.formatMessage(tmsProviderCredentialPanelMessages.displayNameLabel)}
        </FieldLabel>
        <Input
          id={displayNameFieldId}
          value={displayName}
          onChange={(event) => onDisplayNameChange(event.target.value)}
          placeholder={intl.formatMessage(
            tmsProviderCredentialPanelMessages.displayNamePlaceholder,
          )}
        />
      </Field>

      {isCrowdinPatMode ? (
        <Field className="gap-2">
          <FieldLabel htmlFor={baseUrlFieldId}>
            {intl.formatMessage(tmsProviderCredentialPanelMessages.apiBaseUrlLabel)}
          </FieldLabel>
          <FieldDescription>{getTmsBaseUrlGuidance(intl, providerKind)}</FieldDescription>
          <Input
            id={baseUrlFieldId}
            value={baseUrl}
            onChange={(event) => onBaseUrlChange(event.target.value)}
            placeholder={getTmsBaseUrlPlaceholder(intl, providerKind)}
          />
        </Field>
      ) : null}

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
                {intl.formatMessage(tmsProviderCredentialPanelMessages.reconnectOAuthApp)}
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
              allowExistingCredentials={isOAuthConnected}
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

      {showOrgApiTokenField ? (
        <Field className="gap-2">
          <FieldLabel htmlFor={secretFieldId}>
            {intl.formatMessage(tmsProviderCredentialPanelMessages.apiTokenSecretLabel)}
          </FieldLabel>
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
              placeholder={intl.formatMessage(
                tmsProviderCredentialPanelMessages.apiTokenPlaceholder,
              )}
              className="ps-9 pe-9"
            />
            <button
              type="button"
              onClick={onToggleShowSecret}
              className="absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
              aria-label={intl.formatMessage(
                showSecret
                  ? tmsProviderCredentialPanelMessages.hideSecretAriaLabel
                  : tmsProviderCredentialPanelMessages.showSecretAriaLabel,
              )}
            >
              {showSecret ? <EyeOffIcon size={16} /> : <EyeIcon size={16} />}
            </button>
          </div>
        </Field>
      ) : null}

      {!isCrowdinPatMode ? (
        <Collapsible open={advancedSettingsOpen} onOpenChange={setAdvancedSettingsOpen}>
          <CollapsibleTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 w-full justify-between px-2 text-muted-foreground hover:text-foreground"
              >
                {intl.formatMessage(tmsProviderCredentialPanelMessages.advancedSettings)}
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
              <FieldLabel htmlFor={baseUrlFieldId}>
                {intl.formatMessage(tmsProviderCredentialPanelMessages.baseUrlOptionalLabel)}
              </FieldLabel>
              <FieldDescription>{getTmsBaseUrlGuidance(intl, providerKind)}</FieldDescription>
              <Input
                id={baseUrlFieldId}
                value={baseUrl}
                onChange={(event) => onBaseUrlChange(event.target.value)}
                placeholder={getTmsBaseUrlPlaceholder(intl, providerKind)}
              />
            </Field>
          </CollapsibleContent>
        </Collapsible>
      ) : null}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        {credential && userIsAdmin ? (
          <Button type="button" variant="outline" onClick={onDisconnect} disabled={isDisconnecting}>
            <HugeiconsIcon icon={Delete02Icon} strokeWidth={1.8} />
            {intl.formatMessage(tmsProviderCredentialPanelMessages.disconnect)}
          </Button>
        ) : (
          <div />
        )}
        <Button type="submit" disabled={!canSubmit || isSaving} className="sm:ms-auto">
          <HugeiconsIcon icon={SaveIcon} strokeWidth={1.8} />
          {isSaving
            ? intl.formatMessage(tmsProviderCredentialPanelMessages.saving)
            : isCrowdinPatMode
              ? isPatConnected
                ? intl.formatMessage(tmsProviderCredentialPanelMessages.saveProviderSettings, {
                    providerName,
                  })
                : intl.formatMessage(tmsProviderCredentialPanelMessages.enableProviderTokens, {
                    providerName,
                  })
              : isOAuthProvider
                ? isOAuthConnected && !oauthReconnectOpen
                  ? intl.formatMessage(tmsProviderCredentialPanelMessages.saveProviderSettings, {
                      providerName,
                    })
                  : isOAuthConnected
                    ? intl.formatMessage(tmsProviderCredentialPanelMessages.updateProvider, {
                        providerName,
                      })
                    : intl.formatMessage(tmsProviderCredentialPanelMessages.saveProvider, {
                        providerName,
                      })
                : intl.formatMessage(tmsProviderCredentialPanelMessages.saveProviderGeneric)}
        </Button>
      </div>
    </form>
  );
}
