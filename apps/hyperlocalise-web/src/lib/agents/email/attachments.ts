import { Resend } from "resend";

import { env } from "@/lib/env";

export async function fetchAttachmentDownloadUrls(
  emailId: string,
  attachments: Array<{ id: string; filename: string | null; contentType: string }>,
): Promise<Array<{ id: string; filename: string; downloadUrl: string; contentType: string }>> {
  if (!env.RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY is not configured");
  }

  const resend = new Resend(env.RESEND_API_KEY);
  const results: Array<{ id: string; filename: string; downloadUrl: string; contentType: string }> =
    [];

  for (const att of attachments) {
    const result = await resend.emails.receiving.attachments.get({
      emailId,
      id: att.id,
    });

    if (result.error || !result.data) {
      throw new Error(
        `Failed to fetch attachment ${att.id}: ${result.error?.message ?? "unknown"}`,
      );
    }

    results.push({
      id: att.id,
      filename: att.filename ?? "attachment",
      downloadUrl: result.data.download_url,
      contentType: att.contentType,
    });
  }

  return results;
}
