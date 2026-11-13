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
import tls from "tls";

import { describe, expect, it } from "vite-plus/test";

import { generateCertificate } from "./ssl";

describe("generateCertificate", () => {
  it("serves a localhost certificate signed by its private key", async () => {
    const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", {
      modulusLength: 2048,
      publicKeyEncoding: { type: "spki", format: "pem" },
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
    });

    const pem = generateCertificate({ publicKey, privateKey });
    const certificate = new crypto.X509Certificate(pem);

    expect(certificate.subject).toContain("CN=localhost");
    expect(certificate.subjectAltName).toBe("DNS:localhost");
    expect(certificate.checkPrivateKey(crypto.createPrivateKey(privateKey))).toBe(true);

    const validFrom = Date.parse(certificate.validFrom);
    const validTo = Date.parse(certificate.validTo);
    expect(validTo - validFrom).toBeGreaterThan(360 * 24 * 60 * 60 * 1000);

    await new Promise<void>((resolve, reject) => {
      const server = tls.createServer({ key: privateKey, cert: pem }, (socket) => {
        socket.end();
      });

      server.on("error", reject);
      server.listen(0, "127.0.0.1", () => {
        const address = server.address();
        if (!address || typeof address === "string") {
          server.close();
          reject(new Error("TLS test server did not bind a port"));
          return;
        }

        const socket = tls.connect(
          {
            host: "127.0.0.1",
            port: address.port,
            servername: "localhost",
            ca: pem,
            rejectUnauthorized: true,
          },
          () => {
            socket.end();
            server.close();
            resolve();
          },
        );
        socket.on("error", (error) => {
          server.close();
          reject(error);
        });
      });
    });
  });
});
