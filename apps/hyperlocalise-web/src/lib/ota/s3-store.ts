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
import { CreateInvalidationCommand, CloudFrontClient } from "@aws-sdk/client-cloudfront";
import {
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadBucketCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
  type S3ClientConfig,
} from "@aws-sdk/client-s3";

import { env } from "@/lib/env";
import { createLogger, serializeErrorForLog } from "@/lib/log";

import type { OtaObjectStore, OtaStoredObject } from "./store";

const logger = createLogger("ota-s3");

export type OtaS3Credentials = {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
};

export type OtaS3Location = {
  bucket: string;
  region: string;
  endpoint?: string | null;
  usePathStyle?: boolean;
  credentials?: OtaS3Credentials;
};

function createS3Client(location: OtaS3Location): S3Client {
  const config: S3ClientConfig = {
    region: location.region,
    forcePathStyle: location.usePathStyle === true,
  };
  if (location.endpoint) {
    config.endpoint = location.endpoint;
  }
  if (location.credentials) {
    config.credentials = {
      accessKeyId: location.credentials.accessKeyId,
      secretAccessKey: location.credentials.secretAccessKey,
      sessionToken: location.credentials.sessionToken,
    };
  }
  return new S3Client(config);
}

async function collectPrefixKeys(
  client: S3Client,
  bucket: string,
  prefix: string,
): Promise<string[]> {
  const keys: string[] = [];
  let continuationToken: string | undefined;
  do {
    const listed = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      }),
    );
    for (const object of listed.Contents ?? []) {
      if (object.Key) {
        keys.push(object.Key);
      }
    }
    continuationToken = listed.IsTruncated ? listed.NextContinuationToken : undefined;
  } while (continuationToken);
  return keys;
}

export function createS3OtaObjectStore(location: OtaS3Location): OtaObjectStore {
  const client = createS3Client(location);

  return {
    async put(input) {
      await client.send(
        new PutObjectCommand({
          Bucket: location.bucket,
          Key: input.key,
          Body: input.body,
          ContentType: input.contentType,
          CacheControl: input.cacheControl,
        }),
      );
    },
    async get(key): Promise<OtaStoredObject | null> {
      try {
        const response = await client.send(
          new GetObjectCommand({
            Bucket: location.bucket,
            Key: key,
          }),
        );
        const bytes = await response.Body?.transformToByteArray();
        if (!bytes) {
          return null;
        }
        return {
          body: Buffer.from(bytes),
          contentType: response.ContentType ?? "application/octet-stream",
          cacheControl: response.CacheControl ?? "public, max-age=3600",
        };
      } catch (error) {
        if (typeof error === "object" && error && "name" in error && error.name === "NoSuchKey") {
          return null;
        }
        if (typeof error === "object" && error && "$metadata" in error) {
          const metadata = error.$metadata as { httpStatusCode?: number };
          if (metadata.httpStatusCode === 404) {
            return null;
          }
        }
        throw error;
      }
    },
    async deletePrefix(prefix) {
      const keys = await collectPrefixKeys(client, location.bucket, prefix);
      for (let index = 0; index < keys.length; index += 1000) {
        const chunk = keys.slice(index, index + 1000);
        if (chunk.length === 0) {
          continue;
        }
        await client.send(
          new DeleteObjectsCommand({
            Bucket: location.bucket,
            Delete: { Objects: chunk.map((Key) => ({ Key })), Quiet: true },
          }),
        );
      }
    },
  };
}

export async function probeS3Location(location: OtaS3Location): Promise<void> {
  const client = createS3Client(location);
  await client.send(new HeadBucketCommand({ Bucket: location.bucket }));
  const probeKey = `hyperlocalise-ota-probe/${crypto.randomUUID()}`;
  await client.send(
    new PutObjectCommand({
      Bucket: location.bucket,
      Key: probeKey,
      Body: Buffer.from("ok", "utf8"),
      ContentType: "text/plain",
    }),
  );
  await client.send(
    new DeleteObjectsCommand({
      Bucket: location.bucket,
      Delete: { Objects: [{ Key: probeKey }], Quiet: true },
    }),
  );
}

export function hostedOtaS3Location(): OtaS3Location | null {
  const bucket = env.OTA_S3_BUCKET?.trim();
  if (!bucket) {
    return null;
  }
  return {
    bucket,
    region: env.OTA_S3_REGION?.trim() || env.AWS_REGION,
    endpoint: env.OTA_S3_ENDPOINT?.trim() || null,
    usePathStyle: env.OTA_S3_FORCE_PATH_STYLE === "true",
  };
}

export async function invalidateOtaCloudFront(hashes: readonly string[]): Promise<void> {
  const distributionId = env.OTA_CLOUDFRONT_DISTRIBUTION_ID?.trim();
  if (!distributionId || hashes.length === 0) {
    return;
  }

  try {
    const client = new CloudFrontClient({ region: env.AWS_REGION });
    const paths = hashes.flatMap((hash) => [`/${hash}`, `/${hash}/*`]);
    await client.send(
      new CreateInvalidationCommand({
        DistributionId: distributionId,
        InvalidationBatch: {
          CallerReference: `${Date.now()}-${hashes.join("-")}`,
          Paths: { Quantity: paths.length, Items: paths },
        },
      }),
    );
  } catch (error) {
    logger.error("cloudfront_invalidation_failed", {
      error: serializeErrorForLog(error),
    });
  }
}
