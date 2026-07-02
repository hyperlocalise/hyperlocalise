import "dotenv/config";

import { CrowdinApiClient, CrowdinApiError } from "./crowdin-api";
import { CROWDIN_DEFAULT_API_BASE_URL } from "./crowdin-base-url";

type EndpointCheck = {
    label: string;
    path: string;
    run: (client: CrowdinApiClient) => Promise<unknown>;
};

function readFlagValue(flag: string): string | undefined {
    const index = process.argv.indexOf(flag);
    if (index === -1 || index + 1 >= process.argv.length) {
        return undefined;
    }

    return process.argv[index + 1];
}

function printUsage() {
    console.log(`Crowdin PAT smoke test (uses the web CrowdinApiClient)

Usage:
  bun --env-file=.env src/lib/providers/adapters/crowdin/run-crowdin-pat-test.ts [options]

Options:
  --token, -t       Personal access token (default: CROWDIN_PAT env var)
  --base-url        API base URL (default: ${CROWDIN_DEFAULT_API_BASE_URL})
  --project-id      Run project-scoped checks against this numeric project ID
  --help, -h        Show this help
`);
}

function summarizeResult(value: unknown): string {
    if (Array.isArray(value)) {
        return `${value.length} item(s)`;
    }

    if (value && typeof value === "object") {
        const record = value as Record<string, unknown>;
        if (typeof record.id === "number" && typeof record.username === "string") {
            const name = record.fullName ?? record.username;
            return `user ${record.id} (${name})`;
        }
        if (typeof record.id === "number" && typeof record.name === "string") {
            return `project ${record.id} (${record.name})`;
        }
        if (typeof record.id === "number") {
            return `id ${record.id}`;
        }
    }

    return "ok";
}

function formatError(error: unknown): string {
    if (error instanceof CrowdinApiError) {
        const body =
            typeof error.responseBody === "string"
                ? error.responseBody
                : JSON.stringify(error.responseBody);
        return `HTTP ${error.status}: ${error.message}${body ? `\n  body: ${body}` : ""}`;
    }

    return error instanceof Error ? error.message : String(error);
}

async function runCheck(check: EndpointCheck, client: CrowdinApiClient) {
    process.stdout.write(`  ${check.label} (${check.path}) ... `);

    try {
        const result = await check.run(client);
        console.log(`OK — ${summarizeResult(result)}`);
        return true;
    } catch (error) {
        console.log("FAIL");
        console.log(`    ${formatError(error)}`);
        return false;
    }
}

async function main() {
    if (process.argv.includes("--help") || process.argv.includes("-h")) {
        printUsage();
        return;
    }

    const token = readFlagValue("--token") ?? readFlagValue("-t") ?? process.env.CROWDIN_PAT;
    if (!token?.trim()) {
        console.error("Missing Crowdin PAT. Pass --token or set CROWDIN_PAT.");
        printUsage();
        process.exit(1);
    }

    const baseUrl = readFlagValue("--base-url") ?? process.env.CROWDIN_API_BASE_URL;
    const projectIdRaw = readFlagValue("--project-id") ?? process.env.CROWDIN_PROJECT_ID;
    const projectId = projectIdRaw ? Number.parseInt(projectIdRaw, 10) : undefined;

    if (projectIdRaw && (!Number.isFinite(projectId) || projectId! <= 0)) {
        console.error(`Invalid project ID: ${projectIdRaw}`);
        process.exit(1);
    }

    const client = new CrowdinApiClient({
        token: token.trim(),
        baseUrl: baseUrl?.trim() || undefined,
    });

    const checks: EndpointCheck[] = [
        {
            label: "Authenticated user",
            path: "GET /user",
            run: (api) => api.getAuthenticatedUser(),
        },
        {
            label: "Projects",
            path: "GET /projects",
            run: (api) => api.listProjects(),
        },
        {
            label: "Glossaries",
            path: "GET /glossaries",
            run: (api) => api.listGlossaries(),
        },
        {
            label: "Translation memories",
            path: "GET /tms",
            run: (api) => api.listTranslationMemories(),
        },
    ];

    if (projectId !== undefined) {
        checks.push(
            {
                label: "Project",
                path: `GET /projects/${projectId}`,
                run: (api) => api.getProject(projectId),
            },
            {
                label: "Project branches",
                path: `GET /projects/${projectId}/branches`,
                run: (api) => api.listBranches(projectId),
            },
            {
                label: "Project files",
                path: `GET /projects/${projectId}/files`,
                run: (api) => api.listFiles(projectId),
            },
            {
                label: "Project tasks",
                path: `GET /projects/${projectId}/tasks`,
                run: (api) => api.listTasks(projectId),
            },
            {
                label: "Project language progress",
                path: `GET /projects/${projectId}/languages/progress`,
                run: (api) => api.listProjectLanguageProgress(projectId),
            },
        );
    }

    console.log("Crowdin PAT smoke test");
    console.log(`  base URL: ${baseUrl?.trim() || CROWDIN_DEFAULT_API_BASE_URL}`);
    if (projectId !== undefined) {
        console.log(`  project ID: ${projectId}`);
    }
    console.log("");

    let passed = 0;
    for (const check of checks) {
        if (await runCheck(check, client)) {
            passed += 1;
        }
    }

    console.log("");
    console.log(`${passed}/${checks.length} checks passed`);

    if (passed !== checks.length) {
        process.exit(1);
    }
}

main().catch((error) => {
    console.error(formatError(error));
    process.exit(1);
});
