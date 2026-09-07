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
import { Resend } from "resend";

import { err, ok, type Result } from "@/lib/primitives/result/results";

import type { EmailSendError, TransactionalEmailInput } from "./types";

async function sendViaResend(
  input: TransactionalEmailInput,
): Promise<Result<void, EmailSendError>> {
  try {
    const resend = new Resend(input.apiKey);
    const result = await resend.emails.send({
      from: input.from,
      to: input.recipients,
      subject: input.subject,
      text: input.message,
    });

    if (result.error) {
      return err({
        code: "email_send_failed",
        message: result.error.message,
      });
    }

    return ok(undefined);
  } catch (error) {
    return err({
      code: "email_send_failed",
      message: error instanceof Error ? error.message : "Email notification failed.",
    });
  }
}

async function sendViaSendGrid(
  input: TransactionalEmailInput,
): Promise<Result<void, EmailSendError>> {
  try {
    const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        personalizations: [
          {
            to: input.recipients.map((email) => ({ email })),
          },
        ],
        from: { email: input.from },
        subject: input.subject,
        content: [{ type: "text/plain", value: input.message }],
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      return err({
        code: "email_send_failed",
        message: body.trim() || `SendGrid request failed with status ${response.status}.`,
      });
    }

    return ok(undefined);
  } catch (error) {
    return err({
      code: "email_send_failed",
      message: error instanceof Error ? error.message : "Email notification failed.",
    });
  }
}

export async function sendTransactionalEmail(
  input: TransactionalEmailInput,
): Promise<Result<void, EmailSendError>> {
  switch (input.provider) {
    case "resend":
      return sendViaResend(input);
    case "sendgrid":
      return sendViaSendGrid(input);
  }
}
