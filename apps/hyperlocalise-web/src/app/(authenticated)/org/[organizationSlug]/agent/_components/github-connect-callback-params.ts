/** Survives React Strict Mode remounts after the URL is cleaned with replaceState. */
let cachedGithubConnectError: string | null = null;
let cachedGithubConnected = false;

const acknowledgedGithubConnectErrors = new Set<string>();
const acknowledgedGithubConnectedSuccess = new Set<string>();

export function resolveGithubConnectErrorCode(searchParams: URLSearchParams): string | null {
  const fromSearchParams = searchParams.get("error");
  if (fromSearchParams) {
    cachedGithubConnectError = fromSearchParams;
    return fromSearchParams;
  }

  if (typeof window !== "undefined") {
    const fromLocation = new URLSearchParams(window.location.search).get("error");
    if (fromLocation) {
      cachedGithubConnectError = fromLocation;
      return fromLocation;
    }
  }

  return cachedGithubConnectError;
}

export function isGithubConnectedCallback(searchParams: URLSearchParams): boolean {
  if (searchParams.get("github_connected") === "1") {
    cachedGithubConnected = true;
    return true;
  }

  if (typeof window !== "undefined") {
    const fromLocation = new URLSearchParams(window.location.search).get("github_connected");
    if (fromLocation === "1") {
      cachedGithubConnected = true;
      return true;
    }
  }

  return cachedGithubConnected;
}

export function shouldShowGithubConnectErrorToast(
  organizationSlug: string,
  errorCode: string,
): boolean {
  const key = `${organizationSlug}:${errorCode}`;
  if (acknowledgedGithubConnectErrors.has(key)) {
    return false;
  }

  acknowledgedGithubConnectErrors.add(key);
  return true;
}

export function shouldHandleGithubConnectedSuccess(organizationSlug: string): boolean {
  if (acknowledgedGithubConnectedSuccess.has(organizationSlug)) {
    return false;
  }

  acknowledgedGithubConnectedSuccess.add(organizationSlug);
  return true;
}

export function stripGithubConnectCallbackParamsFromUrl(): void {
  if (typeof window === "undefined") {
    return;
  }

  const url = new URL(window.location.href);
  let changed = false;

  if (url.searchParams.has("error")) {
    url.searchParams.delete("error");
    changed = true;
  }

  if (url.searchParams.has("github_connected")) {
    url.searchParams.delete("github_connected");
    changed = true;
  }

  if (changed) {
    window.history.replaceState(null, "", url.toString());
  }
}

/** Test-only reset for module-level callback caches. */
export function resetGithubConnectCallbackParamsForTests(): void {
  cachedGithubConnectError = null;
  cachedGithubConnected = false;
  acknowledgedGithubConnectErrors.clear();
  acknowledgedGithubConnectedSuccess.clear();
}
