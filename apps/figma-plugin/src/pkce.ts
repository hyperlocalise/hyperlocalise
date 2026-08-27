const PKCE_CHARSET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";

function randomUnreserved(length: number): string {
    const bytes = crypto.getRandomValues(new Uint8Array(length));
    return Array.from(bytes, (byte) => PKCE_CHARSET[byte % PKCE_CHARSET.length]).join("");
}

function bytesToBase64Url(bytes: Uint8Array): string {
    let binary = "";
    for (const byte of bytes) {
        binary += String.fromCharCode(byte);
    }
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export async function createPkcePair(): Promise<{
    codeVerifier: string;
    codeChallenge: string;
    state: string;
}> {
    const codeVerifier = randomUnreserved(64);
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(codeVerifier));
    return {
        codeVerifier,
        codeChallenge: bytesToBase64Url(new Uint8Array(digest)),
        state: randomUnreserved(24),
    };
}
