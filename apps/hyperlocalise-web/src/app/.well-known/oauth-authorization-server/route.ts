import { getMcpAuthorizationServerMetadata } from "../../../api/routes/mcp/mcp.route";

export async function GET(request: Request) {
  const origin = new URL(request.url).origin;

  return Response.json(getMcpAuthorizationServerMetadata(origin, ""));
}
