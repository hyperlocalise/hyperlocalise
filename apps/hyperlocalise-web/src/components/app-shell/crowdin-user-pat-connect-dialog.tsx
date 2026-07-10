"use client";

import { useId, useState } from "react";
import { Key01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { EyeIcon, EyeOffIcon } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { FormattedMessage, useIntl } from "react-intl";
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

import { crowdinUserPatConnectDialogMessages } from "./crowdin-user-pat-connect-dialog.messages";

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
  const intl = useIntl();
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
        throw new Error(
          body?.message ??
            body?.error ??
            intl.formatMessage(crowdinUserPatConnectDialogMessages.connectFailed),
        );
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
      toast.success(
        intl.formatMessage(crowdinUserPatConnectDialogMessages.connected, {
          provider: providerDisplayName,
        }),
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : intl.formatMessage(crowdinUserPatConnectDialogMessages.connectFailed),
      );
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
          <DialogTitle>
            <FormattedMessage
              {...crowdinUserPatConnectDialogMessages.title}
              values={{ provider: providerDisplayName }}
            />
          </DialogTitle>
          <DialogDescription>
            <FormattedMessage {...crowdinUserPatConnectDialogMessages.description} />
          </DialogDescription>
        </DialogHeader>

        <Field className="gap-2">
          <FieldLabel htmlFor={tokenFieldId}>
            <FormattedMessage {...crowdinUserPatConnectDialogMessages.tokenLabel} />
          </FieldLabel>
          <FieldDescription>
            <FormattedMessage {...crowdinUserPatConnectDialogMessages.tokenHelp} />
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
              placeholder={intl.formatMessage(crowdinUserPatConnectDialogMessages.tokenPlaceholder)}
              className="ps-9 pe-9"
            />
            <button
              type="button"
              onClick={() => setShowToken((current) => !current)}
              className="absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
              aria-label={intl.formatMessage(
                showToken
                  ? crowdinUserPatConnectDialogMessages.hideToken
                  : crowdinUserPatConnectDialogMessages.showToken,
              )}
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
            <FormattedMessage {...crowdinUserPatConnectDialogMessages.cancel} />
          </Button>
          <Button
            type="button"
            onClick={() => {
              void handleConnect();
            }}
            disabled={!personalAccessToken.trim() || isPending}
          >
            {isPending ? (
              <FormattedMessage {...crowdinUserPatConnectDialogMessages.connecting} />
            ) : (
              <FormattedMessage {...crowdinUserPatConnectDialogMessages.connect} />
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
