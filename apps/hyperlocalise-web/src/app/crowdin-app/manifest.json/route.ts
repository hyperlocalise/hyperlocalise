import { NextResponse } from "next/server";

import { buildCrowdinAppManifest } from "@/lib/crowdin-app/manifest";

export function GET() {
  return NextResponse.json(buildCrowdinAppManifest(), {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
