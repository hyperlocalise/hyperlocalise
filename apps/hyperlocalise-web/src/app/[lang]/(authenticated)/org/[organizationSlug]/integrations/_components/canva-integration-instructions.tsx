"use client";

import { useId, useMemo, useState } from "react";
import { Copy01Icon, Tick02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import { IntegrationCategoryLabel } from "./integration-row";

function CopyableUrlField({
  label,
  description,
  value,
  fieldId,
}: {
  label: string;
  description?: string;
  value: string;
  fieldId: string;
}) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success("Copied to clipboard");
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Unable to copy to clipboard");
    }
  }

  return (
    <Field className="gap-2">
      <FieldLabel htmlFor={fieldId}>{label}</FieldLabel>
      {description ? <FieldDescription>{description}</FieldDescription> : null}
      <InputGroup className="h-10 bg-muted/30">
        <InputGroupInput id={fieldId} readOnly value={value} className="font-mono text-xs" />
        <InputGroupAddon align="inline-end">
          <InputGroupButton
            type="button"
            size="icon-xs"
            aria-label={`Copy ${label}`}
            onClick={() => void handleCopy()}
          >
            <HugeiconsIcon icon={copied ? Tick02Icon : Copy01Icon} strokeWidth={1.8} />
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
    </Field>
  );
}

export function CanvaIntegrationInstructions() {
  const authorizeFieldId = useId();
  const tokenFieldId = useId();
  const revokeFieldId = useId();
  const canvaRedirectFieldId = useId();

  const appOrigin = useMemo(() => {
    if (typeof window === "undefined") {
      return "";
    }
    return window.location.origin;
  }, []);

  const oauthEndpoints = useMemo(
    () => ({
      authorize: `${appOrigin}/api/oauth/canva/authorize`,
      token: `${appOrigin}/api/oauth/canva/token`,
      revoke: `${appOrigin}/api/oauth/canva/revoke`,
    }),
    [appOrigin],
  );

  if (!appOrigin) {
    return null;
  }

  return (
    <section className="flex flex-col gap-3">
      <IntegrationCategoryLabel>Design tools</IntegrationCategoryLabel>

      <div className="overflow-hidden rounded-lg border border-border bg-card text-card-foreground">
        <div className="flex items-start gap-4 border-b border-border px-5 py-4">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-border bg-muted text-sm font-semibold text-foreground">
            C
          </div>
          <div className="min-w-0 flex-1 space-y-1">
            <p className="text-base font-medium text-foreground">Canva</p>
            <p className="text-sm leading-6 text-muted-foreground">
              Localize Canva designs with OAuth sign-in. Designers install the Hyperlocalise Canva
              app, sign in with their Hyperlocalise account, then choose a workspace and project
              inside Canva. No connection tokens are required.
            </p>
          </div>
        </div>

        <div className="space-y-5 px-5 py-5">
          <div className="space-y-2 text-sm leading-6 text-muted-foreground">
            <p className="font-medium text-foreground">Hyperlocalise server configuration</p>
            <p>Set these environment variables on your Hyperlocalise deployment:</p>
            <ul className="list-disc space-y-1 ps-5">
              <li>
                <code className="text-foreground">CANVA_OAUTH_CLIENT_ID</code> and{" "}
                <code className="text-foreground">CANVA_OAUTH_CLIENT_SECRET</code> — generate a
                random client id and secret pair for the Canva app OAuth provider.
              </li>
              <li>
                <code className="text-foreground">CANVA_OAUTH_REDIRECT_URIS</code> — include
                Canva&apos;s OAuth callback URL (typically{" "}
                <code className="text-foreground">https://www.canva.com/apps/oauth/authorized</code>
                ).
              </li>
              <li>
                <code className="text-foreground">CANVA_APP_ID</code> — your Canva app ID for JWT
                verification.
              </li>
            </ul>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <CopyableUrlField
              fieldId={authorizeFieldId}
              label="Authorization endpoint"
              description="Use this as the Authorization URL in the Canva Developer Portal OAuth provider settings."
              value={oauthEndpoints.authorize}
            />
            <CopyableUrlField
              fieldId={tokenFieldId}
              label="Token endpoint"
              description="Use this as the Token URL in the Canva Developer Portal."
              value={oauthEndpoints.token}
            />
            <CopyableUrlField
              fieldId={revokeFieldId}
              label="Revocation endpoint"
              description="Optional. Use this as the Revocation URL if Canva asks for one."
              value={oauthEndpoints.revoke}
            />
            <CopyableUrlField
              fieldId={canvaRedirectFieldId}
              label="Canva redirect URI"
              description="Add this exact value to CANVA_OAUTH_REDIRECT_URIS and to the Canva app OAuth redirect allowlist."
              value="https://www.canva.com/apps/oauth/authorized"
            />
          </div>

          <div className="space-y-2 text-sm leading-6 text-muted-foreground">
            <p className="font-medium text-foreground">Canva Developer Portal</p>
            <ol className="list-decimal space-y-1 ps-5">
              <li>Create or open your Canva app and enable OAuth with PKCE (S256).</li>
              <li>Paste the authorization, token, and revocation endpoints from above.</li>
              <li>
                Enter the same client id and secret in both Hyperlocalise (
                <code className="text-foreground">CANVA_OAUTH_CLIENT_*</code>) and the Canva portal.
              </li>
              <li>
                Set scopes to <code className="text-foreground">canva.localize</code> and{" "}
                <code className="text-foreground">offline_access</code>.
              </li>
              <li>
                Point the Canva app <code className="text-foreground">CANVA_BACKEND_HOST</code> to
                this Hyperlocalise origin.
              </li>
            </ol>
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            nativeButton={false}
            render={
              <a
                href="https://hyperlocalise.com/docs/integrations/canva"
                target="_blank"
                rel="noreferrer"
              />
            }
          >
            Read the full setup guide
          </Button>
        </div>
      </div>
    </section>
  );
}
