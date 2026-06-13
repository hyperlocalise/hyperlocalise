import { createLogger } from "@/lib/log";
import { err, isErr, ok, type Result } from "@/lib/primitives/result/results";

import { ContentfulManagementClient, type ContentfulClientError } from "./client";
import { loadContentfulConnectionWithToken } from "./contentful-connection-access";
import type { ContentfulDiscoveryError, ContentfulSpaceDiscovery } from "./types";

const logger = createLogger("contentful-discovery");

function mapContentfulClientError(error: ContentfulClientError): ContentfulDiscoveryError {
  if (error.status === 401 || error.status === 403) {
    return {
      code: "contentful_discovery_invalid_credentials",
      message:
        error.message ||
        "Contentful rejected the Management API token. Use a Content Management API personal access token, not Content Delivery or Preview keys.",
      contentfulStatus: error.status,
    };
  }

  if (error.status === 404) {
    return {
      code: "contentful_discovery_space_unavailable",
      message:
        error.message ||
        "Contentful could not find the requested space or environment. Check the Space ID and Environment ID.",
      contentfulStatus: error.status,
    };
  }

  return {
    code: "contentful_discovery_request_failed",
    message: error.message,
    contentfulStatus: error.status,
  };
}

function logDiscoveryFailure(input: {
  organizationId: string;
  spaceId: string;
  environmentId: string;
  credentialSource: "inline_token" | "stored_connection" | "missing";
  connectionId?: string;
  error: ContentfulDiscoveryError;
  contentfulErrorId?: string;
}) {
  logger.warn(
    {
      organizationId: input.organizationId,
      spaceId: input.spaceId,
      environmentId: input.environmentId,
      credentialSource: input.credentialSource,
      connectionId: input.connectionId,
      errorCode: input.error.code,
      contentfulStatus:
        "contentfulStatus" in input.error ? input.error.contentfulStatus : undefined,
      contentfulErrorId: input.contentfulErrorId,
    },
    "contentful space discovery failed",
  );
}

export async function discoverContentfulSpace(input: {
  organizationId: string;
  spaceId: string;
  environmentId: string;
  accessToken?: string;
  connectionId?: string;
}): Promise<Result<ContentfulSpaceDiscovery, ContentfulDiscoveryError>> {
  const spaceId = input.spaceId.trim();
  const environmentId = input.environmentId.trim() || "master";
  let accessToken = input.accessToken?.trim();
  let credentialSource: "inline_token" | "stored_connection" | "missing" = accessToken
    ? "inline_token"
    : "missing";

  if (!accessToken && input.connectionId) {
    const loaded = await loadContentfulConnectionWithToken({
      organizationId: input.organizationId,
      connectionId: input.connectionId,
    });
    if (!loaded) {
      const discoveryError: ContentfulDiscoveryError = {
        code: "contentful_discovery_connection_not_found",
        message: "Contentful connection not found.",
      };
      logDiscoveryFailure({
        organizationId: input.organizationId,
        spaceId,
        environmentId,
        credentialSource: "missing",
        connectionId: input.connectionId,
        error: discoveryError,
      });
      return err(discoveryError);
    }
    accessToken = loaded.token;
    credentialSource = "stored_connection";
  }

  if (!accessToken) {
    const discoveryError: ContentfulDiscoveryError = {
      code: "contentful_discovery_missing_credentials",
      message:
        "A Content Management API token is required to load Contentful metadata. Use a personal access token from Contentful Settings → Content management tokens.",
    };
    logDiscoveryFailure({
      organizationId: input.organizationId,
      spaceId,
      environmentId,
      credentialSource,
      connectionId: input.connectionId,
      error: discoveryError,
    });
    return err(discoveryError);
  }

  logger.info(
    {
      organizationId: input.organizationId,
      spaceId,
      environmentId,
      credentialSource,
      connectionId: input.connectionId,
    },
    "contentful space discovery started",
  );

  const client = new ContentfulManagementClient({
    accessToken,
    spaceId,
    environmentId,
  });

  const [validationResult, contentTypesResult] = await Promise.all([
    client.validateConnection(),
    client.listContentTypes(),
  ]);

  if (isErr(validationResult)) {
    const discoveryError = mapContentfulClientError(validationResult.error);
    logDiscoveryFailure({
      organizationId: input.organizationId,
      spaceId,
      environmentId,
      credentialSource,
      connectionId: input.connectionId,
      error: discoveryError,
      contentfulErrorId: validationResult.error.contentfulErrorId,
    });
    return err(discoveryError);
  }

  if (isErr(contentTypesResult)) {
    const discoveryError = mapContentfulClientError(contentTypesResult.error);
    logDiscoveryFailure({
      organizationId: input.organizationId,
      spaceId,
      environmentId,
      credentialSource,
      connectionId: input.connectionId,
      error: discoveryError,
      contentfulErrorId: contentTypesResult.error.contentfulErrorId,
    });
    return err(discoveryError);
  }

  logger.info(
    {
      organizationId: input.organizationId,
      spaceId,
      environmentId,
      localeCount: validationResult.value.locales.length,
      contentTypeCount: contentTypesResult.value.length,
    },
    "contentful space discovery succeeded",
  );

  return ok({
    environmentId: validationResult.value.environmentId,
    locales: validationResult.value.locales,
    contentTypes: contentTypesResult.value,
  });
}
