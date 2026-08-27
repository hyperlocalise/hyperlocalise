export type FigmaSegment = {
    key: string;
    nodeId: string;
    regionIndex: number;
    text: string;
};

export type FigmaFileInfo = {
    fileKey: string;
    fileName: string;
    pageId: string;
    pageName: string;
};

export type PluginSettings = {
    appUrl: string;
    sealedSession: string | null;
    userEmail: string | null;
    organizationSlug: string;
    projectId: string;
    sourceLocale: string;
    targetLocales: string[];
    preserveFormatting: boolean;
    lastJobId: string | null;
};

export type UiToSandboxMessage =
    | { type: "boot" }
    | { type: "storage-set"; settings: PluginSettings }
    | { type: "extract"; preserveFormatting: boolean }
    | { type: "apply"; translations: Record<string, string>; preserveFormatting: boolean }
    | { type: "cancel" };

export type SandboxToUiMessage =
    | { type: "ready"; settings: PluginSettings; file: FigmaFileInfo }
    | { type: "extracted"; segments: FigmaSegment[]; file: FigmaFileInfo }
    | { type: "applied"; count: number }
    | { type: "error"; message: string };

export const SETTINGS_STORAGE_KEY = "hyperlocalise:figma-plugin:settings:v1";
export const FIGMA_OAUTH_MESSAGE_TYPE = "hyperlocalise-figma-oauth";
