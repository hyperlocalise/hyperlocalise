const installDocsUrl = "https://hyperlocalise.dev/getting-started/install";
const installScriptUrl =
  "https://raw.githubusercontent.com/hyperlocalise/hyperlocalise/main/install.sh";

function prefersHtml(acceptHeader: string | null): boolean {
  return acceptHeader?.toLowerCase().includes("text/html") ?? false;
}

export function GET(request: Request): Response {
  const destination = prefersHtml(request.headers.get("accept"))
    ? installDocsUrl
    : installScriptUrl;
  return new Response(null, {
    status: 308,
    headers: {
      Location: destination,
      Vary: "Accept",
    },
  });
}
