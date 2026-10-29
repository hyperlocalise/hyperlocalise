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
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { FormattedMessage, useIntl } from "react-intl";

import { Button } from "@/components/ui/button";
import { assertNever } from "@/lib/primitives/assert-never/assert-never";

import { acceptInvitationAction, type AcceptInvitationActionState } from "../actions";
import { acceptInvitationFormMessages as messages } from "./accept-invitation-form.messages";

function AcceptButton({ organizationName }: { organizationName: string }) {
  const intl = useIntl();
  const { pending } = useFormStatus();

  return (
    <Button
      type="submit"
      size="sm"
      disabled={pending}
      aria-label={intl.formatMessage(pending ? messages.acceptingLabel : messages.acceptLabel, {
        name: organizationName,
      })}
    >
      <FormattedMessage {...(pending ? messages.accepting : messages.accept)} />
    </Button>
  );
}

function errorMessage(error: NonNullable<AcceptInvitationActionState["error"]>) {
  switch (error) {
    case "email_not_verified":
      return messages.emailNotVerified;
    case "membership_not_activated":
      return messages.membershipNotActivated;
    case "workos_unavailable":
    case "workos_accept_failed":
      return messages.tryAgain;
    case "invitation_not_found":
      return messages.invitationNotFound;
    default:
      return assertNever(error);
  }
}

/** One pending invitation on the workspace picker, with its own Accept and error. */
export function AcceptInvitationForm({
  organizationName,
  organizationSlug,
}: {
  organizationName: string;
  organizationSlug: string;
}) {
  const [state, formAction] = useActionState(acceptInvitationAction, {});

  return (
    <form
      action={formAction}
      className="flex flex-col gap-2 rounded-lg border border-border px-3 py-2"
    >
      <input type="hidden" name="organizationSlug" value={organizationSlug} />
      <div className="flex items-center justify-between gap-3">
        <span className="min-w-0 truncate text-sm">{organizationName}</span>
        <AcceptButton organizationName={organizationName} />
      </div>
      {state.error ? (
        <p role="alert" className="text-sm text-destructive">
          <FormattedMessage {...errorMessage(state.error)} />
        </p>
      ) : null}
    </form>
  );
}
