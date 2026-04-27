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
  return Promise.all(
    attachments.map(async (att) => {
      const result = await resend.emails.receiving.attachments.get({
        emailId,
        id: att.id,
      });

      if (result.data) {
        return {
          id: result.data.id,
          filename: result.data.filename ?? att.filename ?? "attachment",
          downloadUrl: result.data.download_url,
          contentType: result.data.content_type,
        };
      }

      if (result.error) {
        const listResult = await resend.emails.receiving.attachments.list({ emailId });
        const fallback = listResult.data?.data.find(
          (candidate) =>
            candidate.id === att.id ||
            (candidate.filename === att.filename && candidate.content_type === att.contentType),
        );
        if (!fallback) {
          throw new Error(
            `Failed to fetch attachment ${att.id}: ${result.error?.message ?? "unknown"}`,
          );
        }

        return {
          id: fallback.id,
          filename: fallback.filename ?? att.filename ?? "attachment",
          downloadUrl: fallback.download_url,
          contentType: fallback.content_type,
        };
      }

      throw new Error(`Failed to fetch attachment ${att.id}: unknown`);
    }),
  );
}
