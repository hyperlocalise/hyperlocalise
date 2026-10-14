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

import { useMemo, useState, type ReactNode } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { observer } from "mobx-react-lite";
import { IntlProvider } from "react-intl";
import { describe, expect, it, vi } from "vite-plus/test";

import { PromptInputProvider } from "@/components/ai-elements/prompt-input";
import { TooltipProvider } from "@/components/ui/tooltip";

import { InboxPageStore } from "../store/inbox-page-store";
import { repositoriesFixture } from "./inbox.fixture";
import { ReplyComposerView } from "./reply-composer";

const projectOptions = [
  {
    id: "proj_website",
    name: "Hyperlocalise Website Localisation",
    source: "native" as const,
    externalProviderKind: null,
  },
  {
    id: "proj_mobile",
    name: "Mobile app",
    source: "native" as const,
    externalProviderKind: null,
  },
];

function DraftBackedComposer({
  initialDraft = "",
  onDraftChange,
}: {
  initialDraft?: string;
  onDraftChange?: (draft: string) => void;
}) {
  const [draft, setDraft] = useState(initialDraft);

  return (
    <PromptInputProvider initialInput={draft}>
      <ReplyComposerView
        disabled={false}
        draft={draft}
        isStreaming={false}
        onDraftChange={(next) => {
          setDraft(next);
          onDraftChange?.(next);
        }}
        onSend={vi.fn()}
        projects={[]}
        projectsIsError={false}
        projectsIsLoading={false}
        repositories={repositoriesFixture}
        repositoriesIsError={false}
        repositoriesIsLoading={false}
      />
    </PromptInputProvider>
  );
}

function renderComposer(ui: ReactNode) {
  return render(
    <IntlProvider locale="en" messages={{}}>
      <TooltipProvider>{ui}</TooltipProvider>
    </IntlProvider>,
  );
}

describe("ReplyComposerView toolbar", () => {
  it("shows the dock toolbar with send, github, and attachments", () => {
    renderComposer(
      <PromptInputProvider>
        <ReplyComposerView
          disabled={false}
          initialProjectId="proj_website"
          isStreaming={false}
          onSend={vi.fn()}
          projects={[
            {
              id: "proj_website",
              name: "Hyperlocalise Website Localisation",
              source: "native",
              externalProviderKind: null,
            },
          ]}
          projectsIsError={false}
          projectsIsLoading={false}
          repositories={repositoriesFixture}
          repositoriesIsError={false}
          repositoriesIsLoading={false}
        />
      </PromptInputProvider>,
    );

    expect(screen.getByRole("button", { name: "Send reply" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send reply" })).toHaveTextContent("Send");
    expect(screen.getByRole("button", { name: "Add photos and files" })).toBeInTheDocument();
    expect(screen.getByText("Repository")).toBeInTheDocument();
    expect(screen.getByText("Hyperlocalise Website Localisation")).toBeInTheDocument();
  });
});

describe("ReplyComposerView draft sync", () => {
  it("keeps typed characters when draft is lifted to parent state", async () => {
    const user = userEvent.setup();
    const onDraftChange = vi.fn();

    renderComposer(<DraftBackedComposer onDraftChange={onDraftChange} />);

    const textarea = screen.getByRole("textbox");
    await user.type(textarea, "Translate the checkout page");

    expect(textarea).toHaveValue("Translate the checkout page");
    expect(onDraftChange).toHaveBeenLastCalledWith("Translate the checkout page");
  });

  it("keeps typed characters when a stale parent draft rerenders the composer", async () => {
    const user = userEvent.setup();
    const onDraftChange = vi.fn();

    function StaleDraftHarness() {
      const [rerenderCount, setRerenderCount] = useState(0);

      return (
        <>
          <div data-testid="rerender-count">{rerenderCount}</div>
          <PromptInputProvider initialInput="">
            <ReplyComposerView
              disabled={false}
              draft=""
              isStreaming={false}
              onDraftChange={(next) => {
                onDraftChange(next);
                setRerenderCount((count) => count + 1);
              }}
              onSend={vi.fn()}
              projects={[]}
              projectsIsError={false}
              projectsIsLoading={false}
              repositories={repositoriesFixture}
              repositoriesIsError={false}
              repositoriesIsLoading={false}
            />
          </PromptInputProvider>
        </>
      );
    }

    renderComposer(<StaleDraftHarness />);

    const textarea = screen.getByRole("textbox");
    await user.type(textarea, "Hello dock");

    expect(screen.getByTestId("rerender-count")).toHaveTextContent("10");
    expect(textarea).toHaveValue("Hello dock");
    expect(onDraftChange).toHaveBeenLastCalledWith("Hello dock");
  });

  it("keeps typed characters when draft is not controlled by a parent", async () => {
    const user = userEvent.setup();

    renderComposer(
      <PromptInputProvider>
        <ReplyComposerView
          disabled={false}
          isStreaming={false}
          onSend={vi.fn()}
          projects={[]}
          projectsIsError={false}
          projectsIsLoading={false}
          repositories={repositoriesFixture}
          repositoriesIsError={false}
          repositoriesIsLoading={false}
        />
      </PromptInputProvider>,
    );

    const textarea = screen.getByRole("textbox");
    await user.type(textarea, "Hello dock");

    expect(textarea).toHaveValue("Hello dock");
  });

  it("applies external draft updates such as suggestion chips", async () => {
    const user = userEvent.setup();

    function Harness() {
      const [draft, setDraft] = useState("");

      return (
        <>
          <button type="button" onClick={() => setDraft("Suggested prompt")}>
            Apply suggestion
          </button>
          <PromptInputProvider initialInput={draft}>
            <ReplyComposerView
              disabled={false}
              draft={draft}
              isStreaming={false}
              onDraftChange={setDraft}
              onSend={vi.fn()}
              projects={[]}
              projectsIsError={false}
              projectsIsLoading={false}
              repositories={repositoriesFixture}
              repositoriesIsError={false}
              repositoriesIsLoading={false}
            />
          </PromptInputProvider>
        </>
      );
    }

    renderComposer(<Harness />);

    await user.click(screen.getByRole("button", { name: "Apply suggestion" }));

    await waitFor(() => {
      expect(screen.getByRole("textbox")).toHaveValue("Suggested prompt");
    });
  });

  it("restores repository and project from a stored reply draft", () => {
    renderComposer(
      <PromptInputProvider initialInput="Follow up on checkout">
        <ReplyComposerView
          disabled={false}
          draft="Follow up on checkout"
          draftProjectId="proj_mobile"
          draftRepositoryKey={repositoriesFixture[1]!.selectionKey}
          isStreaming={false}
          onSend={vi.fn()}
          projects={projectOptions}
          projectsIsError={false}
          projectsIsLoading={false}
          repositories={repositoriesFixture}
          repositoriesIsError={false}
          repositoriesIsLoading={false}
        />
      </PromptInputProvider>,
    );

    expect(screen.getByRole("textbox")).toHaveValue("Follow up on checkout");
    expect(screen.getByText("hyperlocalise/mobile-app")).toBeInTheDocument();
    expect(screen.getByText("Mobile app")).toBeInTheDocument();
  });

  it("does not clear a stored repository while repositories are still loading", () => {
    const onDraftRepositoryChange = vi.fn();

    renderComposer(
      <PromptInputProvider>
        <ReplyComposerView
          disabled={false}
          draftRepositoryKey={repositoriesFixture[1]!.selectionKey}
          isStreaming={false}
          onDraftRepositoryChange={onDraftRepositoryChange}
          onSend={vi.fn()}
          projects={[]}
          projectsIsError={false}
          projectsIsLoading={false}
          repositories={[]}
          repositoriesIsError={false}
          repositoriesIsLoading
        />
      </PromptInputProvider>,
    );

    expect(onDraftRepositoryChange).not.toHaveBeenCalled();
  });

  it("does not clear stored repository or project selections when option queries fail", () => {
    const onDraftRepositoryChange = vi.fn();
    const onDraftProjectChange = vi.fn();

    renderComposer(
      <PromptInputProvider>
        <ReplyComposerView
          disabled={false}
          draftProjectId="proj_mobile"
          draftRepositoryKey={repositoriesFixture[1]!.selectionKey}
          isStreaming={false}
          onDraftProjectChange={onDraftProjectChange}
          onDraftRepositoryChange={onDraftRepositoryChange}
          onSend={vi.fn()}
          projects={[]}
          projectsIsError
          projectsIsLoading={false}
          repositories={[]}
          repositoriesIsError
          repositoriesIsLoading={false}
        />
      </PromptInputProvider>,
    );

    expect(onDraftRepositoryChange).not.toHaveBeenCalled();
    expect(onDraftProjectChange).not.toHaveBeenCalled();
  });

  it("restores stored selections after option queries recover from an error", async () => {
    const user = userEvent.setup();
    const onDraftRepositoryChange = vi.fn();
    const onDraftProjectChange = vi.fn();
    const storedRepositoryKey = repositoriesFixture[1]!.selectionKey;

    function Harness() {
      const [failed, setFailed] = useState(true);

      return (
        <>
          <button type="button" onClick={() => setFailed(false)}>
            Recover
          </button>
          <PromptInputProvider>
            <ReplyComposerView
              disabled={false}
              draftProjectId="proj_mobile"
              draftRepositoryKey={storedRepositoryKey}
              isStreaming={false}
              onDraftProjectChange={onDraftProjectChange}
              onDraftRepositoryChange={onDraftRepositoryChange}
              onSend={vi.fn()}
              projects={failed ? [] : projectOptions}
              projectsIsError={failed}
              projectsIsLoading={false}
              repositories={failed ? [] : repositoriesFixture}
              repositoriesIsError={failed}
              repositoriesIsLoading={false}
            />
          </PromptInputProvider>
        </>
      );
    }

    renderComposer(<Harness />);
    expect(onDraftRepositoryChange).not.toHaveBeenCalled();
    expect(onDraftProjectChange).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Recover" }));

    expect(onDraftRepositoryChange).not.toHaveBeenCalled();
    expect(onDraftProjectChange).not.toHaveBeenCalled();
    expect(screen.getByText("hyperlocalise/mobile-app")).toBeInTheDocument();
    expect(screen.getByText("Mobile app")).toBeInTheDocument();
  });

  it("keeps separate reply drafts when switching conversations", async () => {
    const user = userEvent.setup();
    const firstConversationId = "c-1";
    const secondConversationId = "c-2";

    const StoreBackedComposer = observer(function StoreBackedComposer({
      conversationId,
      store,
    }: {
      conversationId: string;
      store: InboxPageStore;
    }) {
      const draft = store.getReplyDraft(conversationId);
      return (
        <PromptInputProvider key={conversationId} initialInput={draft.text}>
          <ReplyComposerView
            disabled={false}
            draft={draft.text}
            draftProjectId={draft.projectId}
            draftRepositoryKey={draft.repositoryKey}
            isStreaming={false}
            onDraftChange={(text) => store.setReplyDraft(conversationId, { text })}
            onDraftProjectChange={(projectId) => store.setReplyDraft(conversationId, { projectId })}
            onDraftRepositoryChange={(repositoryKey) =>
              store.setReplyDraft(conversationId, { repositoryKey })
            }
            onSend={vi.fn()}
            projects={projectOptions}
            projectsIsError={false}
            projectsIsLoading={false}
            repositories={repositoriesFixture}
            repositoriesIsError={false}
            repositoriesIsLoading={false}
          />
        </PromptInputProvider>
      );
    });

    function Harness() {
      const store = useMemo(() => new InboxPageStore("acme"), []);
      const [conversationId, setConversationId] = useState(firstConversationId);

      return (
        <>
          <button type="button" onClick={() => setConversationId(firstConversationId)}>
            Thread 1
          </button>
          <button type="button" onClick={() => setConversationId(secondConversationId)}>
            Thread 2
          </button>
          <StoreBackedComposer conversationId={conversationId} store={store} />
        </>
      );
    }

    renderComposer(<Harness />);

    const textarea = screen.getByRole("textbox");
    await user.type(textarea, "French follow-up");
    await user.click(screen.getByRole("button", { name: /repository/i }));
    await user.click(await screen.findByText("hyperlocalise/mobile-app"));

    await user.click(screen.getByRole("button", { name: "Thread 2" }));
    expect(screen.getByRole("textbox")).toHaveValue("");
    expect(screen.queryByText("hyperlocalise/mobile-app")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Thread 1" }));
    expect(screen.getByRole("textbox")).toHaveValue("French follow-up");
    expect(screen.getByText("hyperlocalise/mobile-app")).toBeInTheDocument();
  });
});
