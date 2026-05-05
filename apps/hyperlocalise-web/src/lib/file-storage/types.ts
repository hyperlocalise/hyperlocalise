export type FileStorageProvider = "vercel_blob";
export type FileStorageAccess = "private" | "public";

export type PutStoredObjectInput = {
  key: string;
  body: Blob | Buffer | ArrayBuffer | Uint8Array | ReadableStream;
  contentType: string;
  access?: FileStorageAccess;
};

export type PutStoredObjectResult = {
  provider: FileStorageProvider;
  key: string;
  url: string;
  downloadUrl: string | null;
  contentType: string;
  etag: string | null;
};

export type GetStoredObjectInput = {
  keyOrUrl: string;
  access?: FileStorageAccess;
};

export type GetStoredObjectResult = {
  body: ReadableStream;
  contentType: string | null;
  etag: string | null;
};

export type DeleteStoredObjectInput = {
  keyOrUrl: string;
};

export type GetSignedUrlInput = {
  keyOrUrl: string;
  expiresInSeconds?: number;
};

export type FileStorageAdapter = {
  provider: FileStorageProvider;
  put(input: PutStoredObjectInput): Promise<PutStoredObjectResult>;
  get(input: GetStoredObjectInput): Promise<GetStoredObjectResult | null>;
  delete(input: DeleteStoredObjectInput): Promise<void>;
  getSignedUrl(input: GetSignedUrlInput): Promise<string | null>;
};
