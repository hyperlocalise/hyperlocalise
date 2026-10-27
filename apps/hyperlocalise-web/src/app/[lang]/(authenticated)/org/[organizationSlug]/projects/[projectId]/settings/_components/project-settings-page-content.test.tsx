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
// @vitest-environment happy-dom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { IntlProvider } from "react-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { AppShellHeaderActions } from "@/components/app-shell/store/app-shell-header-actions";
import { AppShellStoreProvider } from "@/components/app-shell/store/app-shell-store-context";

import type { ProjectListRow } from "../../../_components/project-list";

const {
  useProjectPageQueryMock,
  patchMock,
  updateMock,
  toastErrorMock,
  toastSuccessMock,
  searchParamsState,
  routerPushMock,
  routerReplaceMock,
} = vi.hoisted(() => ({
  useProjectPageQueryMock: vi.fn(),
  patchMock: vi.fn(),
  updateMock: vi.fn(),
  toastErrorMock: vi.fn(),
  toastSuccessMock: vi.fn(),
  searchParamsState: { value: new URLSearchParams() },
  routerPushMock: vi.fn(),
  routerReplaceMock: vi.fn(),
}));

// Only the React build that Next bundles has this; the one the tests run on does not.
vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  addTransitionType: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/en/org/acme/projects/project_1/settings",
  useSearchParams: () => searchParamsState.value,
  useRouter: () => ({ push: routerPushMock, replace: routerReplaceMock }),
}));

vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccessMock(...args),
    error: (...args: unknown[]) => toastErrorMock(...args),
  },
}));

vi.mock("../../_components/project-page-shell", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../_components/project-page-shell")>();
  return {
    ...actual,
    useProjectPageQuery: (...args: unknown[]) => useProjectPageQueryMock(...args),
  };
});

vi.mock("@/lib/api-client-instance", () => ({
  apiClient: {
    api: {
      orgs: {
        ":organizationSlug": {
          projects: {
            ":projectId": {
              $patch: (...args: unknown[]) => patchMock(...args),
            },
          },
        },
      },
    },
  },
}));

vi.mock("@/lib/go-svc/use-go-svc-client", () => ({
  useGoSvcClient: () => ({
    client: {
      project: {
        update: (...args: unknown[]) => updateMock(...args),
      },
    },
    loading: false,
  }),
}));

// Stands in for the panel, which keeps its own draft and only reports whether it has changes.
vi.mock("./project-issue-templates-panel", () => ({
  ProjectIssueTemplatesPanel: ({ onDirtyChange }: { onDirtyChange?: (dirty: boolean) => void }) => (
    <button type="button" onClick={() => onDirtyChange?.(true)}>
      Change issue template
    </button>
  ),
}));

vi.mock("./project-native-connect-cli-panel", () => ({
  ProjectNativeConnectCliPanel: () => null,
}));

vi.mock("./project-content-editor-behavior-settings", () => ({
  ProjectContentEditorBehaviorSettings: () => null,
}));

vi.mock("./project-issue-columns-settings", () => ({
  ProjectIssueColumnsSettings: () => null,
}));

vi.mock("@/components/markdown-editor/markdown-editor", () => ({
  MarkdownEditor: ({
    id,
    value,
    onChange,
    ariaLabel,
    disabled,
  }: {
    id?: string;
    value: string;
    onChange: (next: string) => void;
    ariaLabel?: string;
    disabled?: boolean;
  }) => (
    <textarea
      id={id}
      aria-label={ariaLabel}
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.currentTarget.value)}
    />
  ),
}));

import { ProjectSettingsPageContent } from "./project-settings-page-content";

function createProject(overrides: Partial<ProjectListRow> = {}): ProjectListRow {
  return {
    id: "project_1",
    name: "Tourmatic",
    key: "TM",
    identifier: "TM",
    description: "No description",
    descriptionValue: "",
    translationContext: "No translation context",
    translationContextValue: "",
    created: "Apr 29, 2026",
    updated: "Apr 30, 2026",
    source: "native",
    externalProviderKind: null,
    externalProjectId: null,
    sourceLocale: "en-US",
    targetLocales: ["fr-FR", "de-DE"],
    externalProjectUrl: null,
    isActive: true,
    logoUrl: null,
    lastActivityAt: null,
    lastSyncedAt: null,
    lastSyncErrorAt: null,
    lastSyncErrorMessage: null,
    openJobCount: 0,
    ...overrides,
  };
}

function mockProjectQuery(project: ProjectListRow | undefined, options?: { isLoading?: boolean }) {
  useProjectPageQueryMock.mockReturnValue({
    isLoading: options?.isLoading ?? false,
    isError: false,
    isSuccess: Boolean(project),
    data: project,
    error: null,
  });
}

function renderSettings(project: ProjectListRow = createProject()) {
  mockProjectQuery(project);
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <IntlProvider locale="en" messages={{}}>
          <AppShellStoreProvider defaultNavigationGroups={[]}>
            <div data-testid="header-actions">
              <AppShellHeaderActions />
            </div>
            <a href="/org/acme/projects">Projects</a>
            {children}
          </AppShellStoreProvider>
        </IntlProvider>
      </QueryClientProvider>
    );
  }

  return render(
    <ProjectSettingsPageContent
      organizationSlug="acme"
      projectId={project.id}
      canManageCatBehavior
    />,
    { wrapper: Wrapper },
  );
}

async function openSection(user: ReturnType<typeof userEvent.setup>, name: string) {
  const nav = await screen.findByRole("navigation", { name: "Project settings sections" });
  await user.click(within(nav).getByRole("button", { name: new RegExp(`^${name}`) }));
}

afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

beforeEach(() => {
  window.history.replaceState(null, "", "/en/org/acme/projects/project_1/settings");
  searchParamsState.value = new URLSearchParams();
  updateMock.mockResolvedValue({ project: createProject({ identifier: "NEW" }) });
  patchMock.mockResolvedValue({
    ok: true,
    json: async () => ({ project: createProject({ identifier: "NEW" }) }),
  });
});

describe("ProjectSettingsPageContent", () => {
  it("renders when the shared project query returns a raw API row", async () => {
    const user = userEvent.setup();
    renderSettings({
      id: "project_1",
      name: "Tourmatic",
      identifier: "TM",
      description: "Ops notes",
      translationContext: "Keep product names in English.",
      source: "native",
      sourceLocale: "en-US",
      targetLocales: ["fr-FR"],
    } as ProjectListRow);

    expect(await screen.findByRole("heading", { name: "General" })).toBeInTheDocument();
    expect(screen.getByLabelText("Description")).toHaveValue("Ops notes");
    expect(screen.getByRole("button", { name: "Save general settings" })).toBeDisabled();

    await openSection(user, "Style guide");
    expect(screen.getByLabelText("Style guide")).toHaveValue("Keep product names in English.");
  });

  it("opens the section from the section search param on initial load", async () => {
    searchParamsState.value = new URLSearchParams("section=locales");
    renderSettings();

    expect(await screen.findByRole("heading", { name: "Locales" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "General" })).not.toBeInTheDocument();
  });

  it("shows one section at a time and keeps save actions disabled until dirty", async () => {
    const user = userEvent.setup();
    renderSettings();

    expect(await screen.findByRole("button", { name: "Save general settings" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Save settings" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "General" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Locales" })).not.toBeInTheDocument();

    await openSection(user, "Style guide");
    expect(screen.getByRole("heading", { name: "Style guide" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save style guide" })).toBeDisabled();
    expect(screen.queryByRole("heading", { name: "General" })).not.toBeInTheDocument();

    await openSection(user, "Locales");
    expect(screen.getByRole("heading", { name: "Locales" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save locales" })).toBeDisabled();
    expect(new URL(window.location.href).searchParams.get("section")).toBe("locales");
  });

  it("marks sections with unsaved edits in the nav", async () => {
    const user = userEvent.setup();
    renderSettings();

    const nav = await screen.findByRole("navigation", { name: "Project settings sections" });
    expect(within(nav).queryByText("Unsaved changes")).not.toBeInTheDocument();

    const identifier = await screen.findByLabelText("Identifier");
    await user.type(identifier, "x");

    expect(
      within(within(nav).getByRole("button", { name: /^General/ })).getByText("Unsaved changes"),
    ).toBeInTheDocument();

    await openSection(user, "Locales");
    await openSection(user, "General");
    expect(screen.getByLabelText("Identifier")).toHaveValue("TMX");
  });

  it("saves an updated identifier from the general section only", async () => {
    const user = userEvent.setup();
    renderSettings();

    const identifier = await screen.findByLabelText("Identifier");
    await user.clear(identifier);
    await user.type(identifier, "new");

    expect(screen.getByRole("button", { name: "Save general settings" })).toBeEnabled();

    await user.click(screen.getByRole("button", { name: "Save general settings" }));

    await waitFor(() => expect(updateMock).toHaveBeenCalled());
    expect(updateMock).toHaveBeenCalledWith("acme", "project_1", {
      name: "Tourmatic",
      description: "",
      identifier: "NEW",
    });
    expect(patchMock).not.toHaveBeenCalled();
    await waitFor(() => expect(toastSuccessMock).toHaveBeenCalledWith("General settings saved"));
  });

  it("saves locale changes from the locales section", async () => {
    const user = userEvent.setup();
    renderSettings();

    await openSection(user, "Locales");
    await user.click(await screen.findByRole("button", { name: /Japanese \(Japan\) \(ja-JP\)/i }));
    expect(screen.getByRole("button", { name: "Save locales" })).toBeEnabled();

    await user.click(screen.getByRole("button", { name: "Save locales" }));

    await waitFor(() => expect(updateMock).toHaveBeenCalled());
    expect(updateMock).toHaveBeenCalledWith("acme", "project_1", {
      sourceLocale: "en-US",
      targetLocales: ["de-DE", "fr-FR", "ja-JP"],
    });
    await waitFor(() => expect(toastSuccessMock).toHaveBeenCalledWith("Locales saved"));
  });

  it("shows a toast and skips PATCH when the identifier is invalid", async () => {
    const user = userEvent.setup();
    renderSettings();

    const identifier = await screen.findByLabelText("Identifier");
    await user.clear(identifier);
    await user.type(identifier, "123");

    await user.click(screen.getByRole("button", { name: "Save general settings" }));

    await waitFor(() =>
      expect(toastErrorMock).toHaveBeenCalledWith(
        "Use 1–10 letters or numbers, starting with a letter (e.g. HL).",
      ),
    );
    expect(updateMock).not.toHaveBeenCalled();
    expect(patchMock).not.toHaveBeenCalled();
    expect(
      screen.getByText("Use 1–10 letters or numbers, starting with a letter (e.g. HL)."),
    ).toBeInTheDocument();
  });

  it("does not wipe in-progress identifier edits when the same project data is refetched", async () => {
    const user = userEvent.setup();
    const project = createProject();
    const view = renderSettings(project);

    const identifier = await screen.findByLabelText("Identifier");
    await user.clear(identifier);
    await user.type(identifier, "edit");
    expect(identifier).toHaveValue("EDIT");

    mockProjectQuery({ ...project });
    view.rerender(
      <ProjectSettingsPageContent
        organizationSlug="acme"
        projectId={project.id}
        canManageCatBehavior
      />,
    );

    expect(await screen.findByLabelText("Identifier")).toHaveValue("EDIT");
  });

  it("keeps dirty general edits when a newer locale snapshot arrives", async () => {
    const user = userEvent.setup();
    const project = createProject();
    const view = renderSettings(project);

    const identifier = await screen.findByLabelText("Identifier");
    await user.clear(identifier);
    await user.type(identifier, "edit");

    mockProjectQuery({
      ...project,
      updated: "May 1, 2026",
      sourceLocale: "ja-JP",
      targetLocales: ["ko-KR"],
    });
    view.rerender(
      <ProjectSettingsPageContent
        organizationSlug="acme"
        projectId={project.id}
        canManageCatBehavior
      />,
    );

    expect(await screen.findByLabelText("Identifier")).toHaveValue("EDIT");
    expect(screen.getByRole("button", { name: "Save general settings" })).toBeEnabled();

    await openSection(user, "Locales");
    expect(screen.getByRole("button", { name: "Save locales" })).toBeDisabled();
  });

  it("hides section save actions while the project is still loading", () => {
    mockProjectQuery(undefined, { isLoading: true });
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <IntlProvider locale="en" messages={{}}>
          <AppShellStoreProvider defaultNavigationGroups={[]}>
            <AppShellHeaderActions />
            <ProjectSettingsPageContent
              organizationSlug="acme"
              projectId="project_1"
              canManageCatBehavior
            />
          </AppShellStoreProvider>
        </IntlProvider>
      </QueryClientProvider>,
    );

    expect(screen.queryByRole("button", { name: "Save general settings" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save locales" })).not.toBeInTheDocument();
    expect(screen.getByText("Loading project settings...")).toBeInTheDocument();
  });

  it("saves markdown style guide content as translation context", async () => {
    const user = userEvent.setup();
    renderSettings();

    await openSection(user, "Style guide");
    const styleGuide = await screen.findByLabelText("Style guide");
    expect(styleGuide).toHaveAttribute("id", "translation-context");
    await user.clear(styleGuide);
    await user.type(styleGuide, "Keep product names in English.");

    await user.click(screen.getByRole("button", { name: "Save style guide" }));

    await waitFor(() => expect(updateMock).toHaveBeenCalled());
    expect(updateMock).toHaveBeenCalledWith("acme", "project_1", {
      translationContext: "Keep product names in English.",
    });
    await waitFor(() => expect(toastSuccessMock).toHaveBeenCalledWith("Style guide saved"));
  });

  it("keeps a pending general save locked while another section saves", async () => {
    const user = userEvent.setup();
    let resolveGeneral!: (value: unknown) => void;
    let resolveLocales!: (value: unknown) => void;
    const generalSave = new Promise((resolve) => {
      resolveGeneral = resolve;
    });
    const localesSave = new Promise((resolve) => {
      resolveLocales = resolve;
    });
    updateMock.mockImplementation(
      (_organizationSlug: string, _projectId: string, payload: object) => {
        if ("identifier" in payload) {
          return generalSave;
        }
        return localesSave;
      },
    );

    renderSettings();

    const identifier = await screen.findByLabelText("Identifier");
    await user.clear(identifier);
    await user.type(identifier, "new");
    await user.click(screen.getByRole("button", { name: "Save general settings" }));

    expect(identifier).toBeDisabled();

    await openSection(user, "Locales");
    await user.click(await screen.findByRole("button", { name: /Japanese \(Japan\) \(ja-JP\)/i }));
    await user.click(screen.getByRole("button", { name: "Save locales" }));

    expect(updateMock).toHaveBeenCalledTimes(2);

    resolveLocales({
      project: createProject({ identifier: "NEW", targetLocales: ["de-DE", "fr-FR", "ja-JP"] }),
    });
    await waitFor(() => expect(toastSuccessMock).toHaveBeenCalledWith("Locales saved"));
    await openSection(user, "General");
    expect(screen.getByLabelText("Identifier")).toBeDisabled();
    expect(screen.getByLabelText("Identifier")).toHaveValue("NEW");

    resolveGeneral({ project: createProject({ identifier: "NEW" }) });
    await waitFor(() => expect(toastSuccessMock).toHaveBeenCalledWith("General settings saved"));
    expect(screen.getByLabelText("Identifier")).toBeEnabled();
    expect(screen.getByLabelText("Identifier")).toHaveValue("NEW");
  });

  it("saves only the identifier for provider-managed projects", async () => {
    const user = userEvent.setup();
    renderSettings(
      createProject({
        source: "external_tms",
        externalProviderKind: "crowdin",
      }),
    );

    const identifier = await screen.findByLabelText("Identifier");
    await user.clear(identifier);
    await user.type(identifier, "ext");

    const nav = screen.getByRole("navigation", { name: "Project settings sections" });
    expect(within(nav).queryByRole("button", { name: "Style guide" })).not.toBeInTheDocument();
    expect(within(nav).queryByRole("button", { name: "CLI & CI" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Save general settings" }));

    await waitFor(() => expect(patchMock).toHaveBeenCalled());
    expect(patchMock).toHaveBeenCalledWith({
      param: { organizationSlug: "acme", projectId: "project_1" },
      json: { identifier: "EXT" },
    });
    expect(updateMock).not.toHaveBeenCalled();
  });
});

describe("ProjectSettingsPageContent leave guard", () => {
  it("does not interrupt leaving while nothing is changed", async () => {
    renderSettings();
    await screen.findByRole("heading", { name: "General" });

    expect(fireEvent.click(screen.getByRole("link", { name: "Projects" }))).toBe(true);
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("asks before leaving with an unsaved section, and keeps the edit when told to stay", async () => {
    const user = userEvent.setup();
    renderSettings();

    await user.type(await screen.findByLabelText("Description"), "Ops notes");

    expect(fireEvent.click(screen.getByRole("link", { name: "Projects" }))).toBe(false);
    expect(await screen.findByText("Leave without saving?")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Keep editing" }));

    expect(screen.getByLabelText("Description")).toHaveValue("Ops notes");
    expect(routerReplaceMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("link", { name: "Projects" }));
    await user.click(await screen.findByRole("button", { name: "Leave without saving" }));

    expect(routerReplaceMock).toHaveBeenCalledWith("/org/acme/projects", { scroll: undefined });
  });

  it("asks about an unsaved section that is not the one on screen", async () => {
    const user = userEvent.setup();
    renderSettings();

    await user.type(await screen.findByLabelText("Description"), "Ops notes");
    await openSection(user, "Locales");

    expect(fireEvent.click(screen.getByRole("link", { name: "Projects" }))).toBe(false);
    expect(await screen.findByText("Leave without saving?")).toBeInTheDocument();
  });

  it("asks when only the issue templates have unsaved changes", async () => {
    renderSettings();
    await screen.findByRole("heading", { name: "General" });

    // The panel stays mounted but hidden while another section is on screen.
    fireEvent.click(screen.getByRole("button", { name: "Change issue template", hidden: true }));

    expect(fireEvent.click(screen.getByRole("link", { name: "Projects" }))).toBe(false);
    expect(await screen.findByText("Leave without saving?")).toBeInTheDocument();
  });

  it("keeps the section in the address after the last unsaved section is saved", async () => {
    const settingsPath = "/en/org/acme/projects/project_1/settings";
    // Stepping back lands on the entry from before the edit, which has no section in it.
    vi.spyOn(window.history, "back").mockImplementation(() => {
      window.history.replaceState(null, "", settingsPath);
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    const user = userEvent.setup();
    updateMock.mockResolvedValue({ project: createProject({ descriptionValue: "Ops notes" }) });
    renderSettings();

    await user.type(await screen.findByLabelText("Description"), "Ops notes");
    await openSection(user, "Locales");
    await openSection(user, "General");
    expect(window.location.search).toBe("?section=general");

    await user.click(screen.getByRole("button", { name: "Save general settings" }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Save general settings" })).toBeDisabled();
    });

    expect(`${window.location.pathname}${window.location.search}`).toBe(
      `${settingsPath}?section=general`,
    );
  });

  it("stops asking once the section is saved", async () => {
    vi.spyOn(window.history, "back").mockImplementation(() => {});
    const user = userEvent.setup();
    updateMock.mockResolvedValue({ project: createProject({ descriptionValue: "Ops notes" }) });
    renderSettings();

    await user.type(await screen.findByLabelText("Description"), "Ops notes");
    await user.click(screen.getByRole("button", { name: "Save general settings" }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Save general settings" })).toBeDisabled();
    });

    expect(fireEvent.click(screen.getByRole("link", { name: "Projects" }))).toBe(true);
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });
});
