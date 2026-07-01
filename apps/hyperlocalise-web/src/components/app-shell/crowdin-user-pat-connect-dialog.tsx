"use client";

import { useId, useState } from "react";
import { Key01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { EyeIcon, EyeOffIcon } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { tmsUserConnectCtaQueryKey } from "@/app/[lang]/(authenticated)/org/[organizationSlug]/_hooks/use-tms-user-connect-cta";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { apiClient } from "@/lib/api-client-instance";

type CrowdinUserPatConnectDialogProps = {
  organizationSlug: string;
  providerDisplayName?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function CrowdinUserPatConnectDialog({
  organizationSlug,
  providerDisplayName = "Crowdin",
  open,
  onOpenChange,
}: CrowdinUserPatConnectDialogProps) {
  const tokenFieldId = useId();
  const [personalAccessToken, setPersonalAccessToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const queryClient = useQueryClient();

  async function handleConnect() {
    const token = personalAccessToken.trim();
    if (!token || isPending) {
      return;
    }

    setIsPending(true);
    try {
      const response = await apiClient.api.orgs[":organizationSlug"][
        "external-tms-provider-credential"
      ].crowdin.user.pat.$post({
        param: { organizationSlug },
        json: { personalAccessToken: token },
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: string;
          message?: string;
        } | null;
        throw new Error(body?.message ?? body?.error ?? "Failed to connect Crowdin");
      }

      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["crowdin-user-connection", organizationSlug],
        }),
        queryClient.invalidateQueries({
          queryKey: tmsUserConnectCtaQueryKey(organizationSlug),
        }),
        queryClient.invalidateQueries({
          queryKey: ["tms-provider-connection", organizationSlug],
        }),
      ]);

      setPersonalAccessToken("");
      setShowToken(false);
      onOpenChange(false);
      toast.success(`${providerDisplayName} connected`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to connect Crowdin");
    } finally {
      setIsPending(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!isPending) {
          onOpenChange(nextOpen);
          if (!nextOpen) {
            setPersonalAccessToken("");
            setShowToken(false);
          }
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Connect {providerDisplayName}</DialogTitle>
          <DialogDescription>
            Paste your personal access token from Crowdin. Your admin already configured the API
            base URL for this workspace—you only need your token.
          </DialogDescription>
        </DialogHeader>

        <Field className="gap-2">
          <FieldLabel htmlFor={tokenFieldId}>Personal access token</FieldLabel>
          <FieldDescription>
            Create a token in Crowdin under Account Settings → API, or in Crowdin Enterprise under
            your account or Organization Settings → User Access Tokens.
          </FieldDescription>
          <div className="relative">
            <HugeiconsIcon
              icon={Key01Icon}
              strokeWidth={1.8}
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              id={tokenFieldId}
              type={showToken ? "text" : "password"}
              autoComplete="off"
              value={personalAccessToken}
              onChange={(event) => setPersonalAccessToken(event.target.value)}
              placeholder="Paste your Crowdin token"
              className="ps-9 pe-9"
            />
            <button
              type="button"
              onClick={() => setShowToken((current) => !current)}
              className="absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
              aria-label={showToken ? "Hide token" : "Show token"}
            >
              {showToken ? <EyeOffIcon size={16} /> : <EyeIcon size={16} />}
            </button>
          </div>
        </Field>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => {
              void handleConnect();
            }}
            disabled={!personalAccessToken.trim() || isPending}
          >
            {isPending ? "Connecting..." : "Connect"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
