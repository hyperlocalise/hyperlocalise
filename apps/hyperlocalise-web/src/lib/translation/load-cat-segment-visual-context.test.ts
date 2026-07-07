import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const {
  crowdinClientOptions,
  loadCrowdinCatVisualContextMock,
  loadLokaliseCatVisualContextMock,
  loadPhraseCatVisualContextMock,
  loadSmartlingCatVisualContextMock,
  lokaliseClientOptions,
  phraseClientOptions,
  smartlingClientOptions,
  tryLoadActiveTmsProviderContextMock,
} = vi.hoisted(() => ({
  crowdinClientOptions: [] as unknown[],
  loadCrowdinCatVisualContextMock: vi.fn(),
  loadLokaliseCatVisualContextMock: vi.fn(),
  loadPhraseCatVisualContextMock: vi.fn(),
  loadSmartlingCatVisualContextMock: vi.fn(),
  lokaliseClientOptions: [] as unknown[],
  phraseClientOptions: [] as unknown[],
  smartlingClientOptions: [] as unknown[],
  tryLoadActiveTmsProviderContextMock: vi.fn(),
}));

vi.mock("@/lib/providers/jobs/tms-provider-live", () => ({
  tryLoadActiveTmsProviderContext: (...args: unknown[]) =>
    tryLoadActiveTmsProviderContextMock(...args),
}));

vi.mock("@/lib/providers/adapters/crowdin/crowdin-api", () => ({
  CrowdinApiClient: class MockCrowdinApiClient {
    constructor(options: unknown) {
      crowdinClientOptions.push(options);
    }
  },
}));

vi.mock("@/lib/providers/adapters/lokalise/lokalise-api", () => ({
  LokaliseApiClient: class MockLokaliseApiClient {
    constructor(options: unknown) {
      lokaliseClientOptions.push(options);
    }
  },
}));

vi.mock("@/lib/providers/adapters/crowdin/crowdin-provider", () => ({
  crowdinTmsProvider: {
    loadCatVisualContext: (...args: unknown[]) => loadCrowdinCatVisualContextMock(...args),
  },
}));

vi.mock("@/lib/providers/adapters/lokalise/lokalise-provider", () => ({
  lokaliseTmsProvider: {
    loadCatVisualContext: (...args: unknown[]) => loadLokaliseCatVisualContextMock(...args),
  },
}));

vi.mock("@/lib/providers/adapters/phrase/phrase-api", () => ({
  PhraseApiClient: class MockPhraseApiClient {
    constructor(options: unknown) {
      phraseClientOptions.push(options);
    }
  },
}));

vi.mock("@/lib/providers/adapters/phrase/phrase-provider", () => ({
  phraseTmsProvider: {
    loadCatVisualContext: (...args: unknown[]) => loadPhraseCatVisualContextMock(...args),
  },
}));

vi.mock("@/lib/providers/adapters/smartling/smartling-api", () => ({
  SmartlingApiClient: class MockSmartlingApiClient {
    constructor(options: unknown) {
      smartlingClientOptions.push(options);
    }
  },
}));

vi.mock("@/lib/providers/adapters/smartling/smartling-provider", () => ({
  smartlingTmsProvider: {
    loadCatVisualContext: (...args: unknown[]) => loadSmartlingCatVisualContextMock(...args),
  },
}));

import { loadCatSegmentVisualContext } from "./cat";

describe("loadCatSegmentVisualContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    crowdinClientOptions.length = 0;
    lokaliseClientOptions.length = 0;
    phraseClientOptions.length = 0;
    smartlingClientOptions.length = 0;
  });

  it("returns empty visual context when no active provider credential is available", async () => {
    tryLoadActiveTmsProviderContextMock.mockResolvedValue(null);

    await expect(
      loadCatSegmentVisualContext({
        organizationId: "org_1",
        providerKind: "crowdin",
        externalProjectId: "project_1",
        externalStringId: "string_1",
        actorUserId: "user_1",
      }),
    ).resolves.toEqual({ screenshots: [] });

    expect(tryLoadActiveTmsProviderContextMock).toHaveBeenCalledWith("org_1", {
      actorUserId: "user_1",
    });
    expect(loadCrowdinCatVisualContextMock).not.toHaveBeenCalled();
    expect(loadLokaliseCatVisualContextMock).not.toHaveBeenCalled();
    expect(loadPhraseCatVisualContextMock).not.toHaveBeenCalled();
  });

  it("returns empty visual context when the active credential belongs to another provider", async () => {
    tryLoadActiveTmsProviderContextMock.mockResolvedValue({
      providerKind: "lokalise",
      secretMaterial: "lokalise-token",
      credential: {
        baseUrl: "https://lokalise.example",
        region: null,
      },
    });

    await expect(
      loadCatSegmentVisualContext({
        organizationId: "org_1",
        providerKind: "crowdin",
        externalProjectId: "project_1",
        externalStringId: "string_1",
      }),
    ).resolves.toEqual({ screenshots: [] });

    expect(loadCrowdinCatVisualContextMock).not.toHaveBeenCalled();
    expect(loadLokaliseCatVisualContextMock).not.toHaveBeenCalled();
    expect(loadPhraseCatVisualContextMock).not.toHaveBeenCalled();
  });

  it("dispatches Crowdin visual context with the active credential material", async () => {
    tryLoadActiveTmsProviderContextMock.mockResolvedValue({
      providerKind: "crowdin",
      secretMaterial: "crowdin-token",
      credential: {
        baseUrl: "https://crowdin.example",
        region: null,
      },
    });
    loadCrowdinCatVisualContextMock.mockResolvedValue({
      screenshots: [{ id: "screen_1", name: "Checkout", imageUrl: "https://example.com/s.png" }],
    });

    const visualContext = await loadCatSegmentVisualContext({
      organizationId: "org_1",
      providerKind: "crowdin",
      externalProjectId: "project_1",
      externalStringId: "string_1",
    });

    expect(visualContext.screenshots).toHaveLength(1);
    expect(crowdinClientOptions).toEqual([
      {
        token: "crowdin-token",
        baseUrl: "https://crowdin.example",
      },
    ]);
    expect(loadCrowdinCatVisualContextMock).toHaveBeenCalledWith({
      client: expect.any(Object),
      externalProjectId: "project_1",
      externalStringId: "string_1",
    });
  });

  it("dispatches Lokalise visual context with the active credential material", async () => {
    tryLoadActiveTmsProviderContextMock.mockResolvedValue({
      providerKind: "lokalise",
      secretMaterial: "lokalise-token",
      credential: {
        baseUrl: "https://lokalise.example",
        region: null,
      },
    });
    loadLokaliseCatVisualContextMock.mockResolvedValue({
      screenshots: [{ id: "screen_1", name: "Checkout", imageUrl: "https://example.com/s.png" }],
    });

    const visualContext = await loadCatSegmentVisualContext({
      organizationId: "org_1",
      providerKind: "lokalise",
      externalProjectId: "project_1",
      externalStringId: "string_1",
    });

    expect(visualContext.screenshots).toHaveLength(1);
    expect(lokaliseClientOptions).toEqual([
      {
        token: "lokalise-token",
        baseUrl: "https://lokalise.example",
      },
    ]);
    expect(loadLokaliseCatVisualContextMock).toHaveBeenCalledWith({
      client: expect.any(Object),
      externalProjectId: "project_1",
      externalStringId: "string_1",
    });
  });

  it("dispatches Phrase visual context with token, region, and external identifiers", async () => {
    tryLoadActiveTmsProviderContextMock.mockResolvedValue({
      providerKind: "phrase",
      secretMaterial: "phrase-token",
      credential: {
        baseUrl: "https://phrase.example",
        region: "us",
      },
    });
    loadPhraseCatVisualContextMock.mockResolvedValue({ screenshots: [] });

    await loadCatSegmentVisualContext({
      organizationId: "org_1",
      providerKind: "phrase",
      externalProjectId: "project_1",
      externalStringId: "string_1",
    });

    expect(loadPhraseCatVisualContextMock).toHaveBeenCalledWith({
      client: expect.any(Object),
      externalProjectId: "project_1",
      externalStringId: "string_1",
    });
    expect(phraseClientOptions).toEqual([
      {
        token: "phrase-token",
        region: "us",
        baseUrl: "https://phrase.example",
      },
    ]);
  });

  it("dispatches Smartling visual context with the active credential material", async () => {
    tryLoadActiveTmsProviderContextMock.mockResolvedValue({
      providerKind: "smartling",
      secretMaterial: "user:secret",
      credential: {
        baseUrl: "https://api.smartling.com/auth-api/v2",
        region: null,
      },
    });
    loadSmartlingCatVisualContextMock.mockResolvedValue({
      screenshots: [{ id: "ctx-1", name: "Checkout", imageUrl: "data:image/png;base64,abc" }],
    });

    const visualContext = await loadCatSegmentVisualContext({
      organizationId: "org_1",
      providerKind: "smartling",
      externalProjectId: "project_1",
      externalStringId: "hash-1",
    });

    expect(visualContext.screenshots).toHaveLength(1);
    expect(smartlingClientOptions).toEqual([
      {
        credentials: "user:secret",
        authBaseUrl: "https://api.smartling.com/auth-api/v2",
      },
    ]);
    expect(loadSmartlingCatVisualContextMock).toHaveBeenCalledWith({
      client: expect.any(Object),
      externalProjectId: "project_1",
      externalStringId: "hash-1",
    });
  });
});
