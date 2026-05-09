import { encryptProviderCredential, decryptProviderCredential } from "./apps/hyperlocalise-web/src/lib/security/provider-credential-crypto";
import { env } from "./apps/hyperlocalise-web/src/lib/env";

// We need to set the environment variable for the test to work
process.env.PROVIDER_CREDENTIALS_MASTER_KEY = "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=";
process.env.DATABASE_URL = "postgres://localhost:5432/test";
process.env.NEXT_PUBLIC_WAITLIST_URL = "https://example.com";

try {
  const encrypted = encryptProviderCredential("sensitive-data");
  console.log("Original ciphertext:", encrypted.ciphertext);

  const tamperedCiphertext = encrypted.ciphertext.replace(/^[a-zA-Z]/, (c) => (c === "A" ? "B" : "A"));
  console.log("Tampered ciphertext:", tamperedCiphertext);

  if (tamperedCiphertext === encrypted.ciphertext) {
      console.log("FAILED TO TAMPER!");
  } else {
      console.log("Tampered successfully.");
  }
} catch (e) {
  console.error(e);
}
