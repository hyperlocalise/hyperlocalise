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
import crypto from "crypto";
import fs from "fs/promises";
import path from "path";

const SSL_CERT_DIR = path.resolve(process.cwd(), ".ssl");
const CERT_FILE = path.resolve(SSL_CERT_DIR, "certificate.pem");
const KEY_FILE = path.resolve(SSL_CERT_DIR, "private-key.pem");

export interface Certificate {
  keyFile: string;
  certFile: string;
}

const CERT_ATTRS: { name: string; value: string }[] = [
  {
    name: "commonName",
    value: "localhost",
  },
  {
    name: "countryName",
    value: "AU",
  },
  {
    name: "stateOrProvinceName",
    value: "New South Wales",
  },
  {
    name: "localityName",
    value: "Sydney",
  },
  {
    name: "organizationName",
    value: "Test",
  },
  {
    name: "organizationalUnitName",
    value: "Test",
  },
];

const generateRsaKeys = async (): Promise<{
  publicKey: string;
  privateKey: string;
}> =>
  new Promise((resolve, reject) => {
    crypto.generateKeyPair(
      "rsa",
      {
        modulusLength: 2048,
        publicKeyEncoding: {
          type: "spki",
          format: "pem",
        },
        privateKeyEncoding: {
          type: "pkcs8",
          format: "pem",
        },
      },
      (err, publicKey, privateKey) => {
        if (err) {
          reject(err);
        } else {
          resolve({ publicKey, privateKey });
        }
      },
    );
  });

const ATTRIBUTE_TYPE_OIDS: Record<string, string> = {
  commonName: "2.5.4.3",
  countryName: "2.5.4.6",
  stateOrProvinceName: "2.5.4.8",
  localityName: "2.5.4.7",
  organizationName: "2.5.4.10",
  organizationalUnitName: "2.5.4.11",
};

const SHA256_WITH_RSA_ENCRYPTION = "1.2.840.113549.1.1.11";
const SUBJECT_ALT_NAME = "2.5.29.17";
const PRINTABLE_STRING = /^[A-Za-z0-9 '()+,\-./:=?]+$/;

const derLength = (length: number): Buffer => {
  if (length < 0x80) {
    return Buffer.from([length]);
  }

  const bytes: number[] = [];
  let remaining = length;
  while (remaining > 0) {
    bytes.unshift(remaining & 0xff);
    remaining >>= 8;
  }

  return Buffer.from([0x80 | bytes.length, ...bytes]);
};

const derTag = (tag: number, content: Buffer): Buffer =>
  Buffer.concat([Buffer.from([tag]), derLength(content.length), content]);

const derSequence = (...parts: Buffer[]): Buffer => derTag(0x30, Buffer.concat(parts));

const derOid = (dotted: string): Buffer => {
  const parts = dotted.split(".").map((part) => Number(part));
  const first = parts[0];
  const second = parts[1];
  if (first === undefined || second === undefined || parts.some((part) => Number.isNaN(part))) {
    throw new Error(`Invalid OID: ${dotted}`);
  }

  const bytes = [40 * first + second];
  for (const part of parts.slice(2)) {
    const encoded = [part & 0x7f];
    let value = part >> 7;
    while (value > 0) {
      encoded.unshift((value & 0x7f) | 0x80);
      value >>= 7;
    }
    bytes.push(...encoded);
  }

  return derTag(0x06, Buffer.from(bytes));
};

const derDirectoryString = (value: string): Buffer => {
  if (PRINTABLE_STRING.test(value)) {
    return derTag(0x13, Buffer.from(value, "ascii"));
  }

  return derTag(0x0c, Buffer.from(value, "utf8"));
};

const derName = (attrs: { name: string; value: string }[]): Buffer =>
  derSequence(
    ...attrs.map((attr) => {
      const oid = ATTRIBUTE_TYPE_OIDS[attr.name];
      if (!oid) {
        throw new Error(`Unknown certificate attribute: ${attr.name}`);
      }

      return derTag(0x31, derSequence(derOid(oid), derDirectoryString(attr.value)));
    }),
  );

const derUtcTime = (date: Date): Buffer => {
  const year = String(date.getUTCFullYear() % 100).padStart(2, "0");
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  const hours = String(date.getUTCHours()).padStart(2, "0");
  const minutes = String(date.getUTCMinutes()).padStart(2, "0");
  const seconds = String(date.getUTCSeconds()).padStart(2, "0");

  return derTag(0x17, Buffer.from(`${year}${month}${day}${hours}${minutes}${seconds}Z`, "ascii"));
};

const derBitString = (payload: Buffer): Buffer =>
  derTag(0x03, Buffer.concat([Buffer.from([0x00]), payload]));

const pemBody = (pem: string): Buffer => {
  const body = pem
    .replace(/-----BEGIN [^-]+-----/, "")
    .replace(/-----END [^-]+-----/, "")
    .replace(/\s+/g, "");
  return Buffer.from(body, "base64");
};

const toPem = (label: string, der: Buffer): string => {
  const lines = der.toString("base64").match(/.{1,64}/g) ?? [];
  return `-----BEGIN ${label}-----\n${lines.join("\n")}\n-----END ${label}-----\n`;
};

export const generateCertificate = (opts: { privateKey: string; publicKey: string }): string => {
  const notBefore = new Date();
  const notAfter = new Date(notBefore);
  notAfter.setUTCFullYear(notAfter.getUTCFullYear() + 1);

  const serial = crypto.randomBytes(16);
  serial[0] = (serial[0] ?? 0) & 0x7f || 0x01;

  const signatureAlgorithm = derSequence(
    derOid(SHA256_WITH_RSA_ENCRYPTION),
    derTag(0x05, Buffer.alloc(0)),
  );
  const subjectAltName = derSequence(
    derOid(SUBJECT_ALT_NAME),
    derTag(0x04, derSequence(derTag(0x82, Buffer.from("localhost", "ascii")))),
  );
  const tbsCertificate = derSequence(
    derTag(0xa0, derTag(0x02, Buffer.from([0x02]))),
    derTag(0x02, serial),
    signatureAlgorithm,
    derName(CERT_ATTRS),
    derSequence(derUtcTime(notBefore), derUtcTime(notAfter)),
    derName(CERT_ATTRS),
    pemBody(opts.publicKey),
    derTag(0xa3, derSequence(subjectAltName)),
  );
  const signature = crypto.sign("sha256", tbsCertificate, opts.privateKey);

  return toPem(
    "CERTIFICATE",
    derSequence(tbsCertificate, signatureAlgorithm, derBitString(signature)),
  );
};

const writeCertFiles = async (opts: { cert: string; privateKey: string }): Promise<void> => {
  const { cert, privateKey } = opts;

  await fs.mkdir(SSL_CERT_DIR, { recursive: true });
  await Promise.all([
    fs.writeFile(CERT_FILE, cert, { encoding: "utf8" }),
    fs.writeFile(KEY_FILE, privateKey, { encoding: "utf8" }),
  ]);
};

const cerfFilesExist = async (): Promise<boolean> => {
  try {
    await Promise.all([
      fs.access(CERT_FILE, fs.constants.R_OK | fs.constants.W_OK),
      fs.access(KEY_FILE, fs.constants.R_OK | fs.constants.W_OK),
    ]);
    return true;
  } catch {
    return false;
  }
};

export const createOrRetrieveCertificate = async (): Promise<Certificate> => {
  if (!(await cerfFilesExist())) {
    const keys = await generateRsaKeys();
    const cert = generateCertificate(keys);
    await writeCertFiles({ cert, privateKey: keys.privateKey });
  }

  return {
    certFile: CERT_FILE,
    keyFile: KEY_FILE,
  };
};
