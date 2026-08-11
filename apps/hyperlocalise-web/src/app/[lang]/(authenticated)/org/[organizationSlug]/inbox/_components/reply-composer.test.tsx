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

import { useState, type ReactNode } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IntlProvider } from "react-intl";
import { describe, expect, it, vi } from "vite-plus/test";

import { PromptInputProvider } from "@/components/ai-elements/prompt-input";
import { TooltipProvider } from "@/components/ui/tooltip";

import { repositoriesFixture } from "./inbox.fixture";
import { ReplyComposerView } from "./reply-composer";

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
});
