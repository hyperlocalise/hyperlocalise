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
import { http, HttpResponse } from "msw";

/** 1x1 PNG used for Storybook proxy-file responses. */
const storybookPngBytes = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
  0xde, 0x00, 0x00, 0x00, 0x0c, 0x49, 0x44, 0x41, 0x54, 0x08, 0xd7, 0x63, 0xf8, 0xcf, 0xc0, 0x00,
  0x00, 0x00, 0x03, 0x00, 0x01, 0x00, 0x05, 0xfe, 0xd4, 0xef, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45,
  0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
]);

export const markdownEditorImageMswHandlers = [
  http.post("/api/orgs/:organizationSlug/files", async ({ params, request }) => {
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return HttpResponse.json({ error: "file_required" }, { status: 400 });
    }

    const organizationSlug = String(params.organizationSlug);
    const id = `file_story_${crypto.randomUUID()}`;
    return HttpResponse.json(
      {
        file: {
          id,
          url: `/api/orgs/${encodeURIComponent(organizationSlug)}/files/${id}`,
          filename: file.name || "image.png",
          contentType: file.type || "image/png",
          byteSize: file.size,
        },
      },
      { status: 201 },
    );
  }),
  http.get("/api/orgs/:organizationSlug/files/:fileId", () => {
    return new HttpResponse(storybookPngBytes, {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        "Content-Disposition": "inline; filename*=UTF-8''story.png",
        "Cache-Control": "private, max-age=60",
      },
    });
  }),
];
