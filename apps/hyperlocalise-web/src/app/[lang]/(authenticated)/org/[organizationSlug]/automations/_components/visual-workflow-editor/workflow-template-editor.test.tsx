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

import type { Editor } from "@tiptap/core";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vite-plus/test";

import {
  templateToDocument,
  documentToTemplate,
} from "@/lib/visual-workflows/editor/visual-workflow-template-document";
import type { UpstreamField } from "@/lib/visual-workflows/editor/visual-workflow-upstream-fields";

import { WorkflowTemplateEditor, type FieldReferenceDescription } from "./workflow-template-editor";

const FIELDS: UpstreamField[] = [
  {
    nodeId: "http",
    trigger: false,
    path: "json.count",
    type: "number",
    optional: false,
    observed: false,
    sample: 3,
  },
  {
    nodeId: "http",
    trigger: false,
    path: "status",
    type: "number",
    optional: false,
    observed: false,
    sample: 200,
  },
];

const describeReference = (raw: string): FieldReferenceDescription => ({
  step: "HTTP Request",
  field: raw.replace(/[{} ]/g, "").split(".").slice(2).join("."),
  title: raw,
  nodeId: "http",
  broken: false,
});

function Harness({
  initial,
  multiline = false,
  onChange,
}: {
  initial: string;
  multiline?: boolean;
  onChange: (value: string) => void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <span id="label">Message</span>
      <WorkflowTemplateEditor
        id="message"
        labelId="label"
        value={value}
        onChange={(next) => {
          setValue(next);
          onChange(next);
        }}
        multiline={multiline}
        fields={FIELDS}
        stepTitle={() => "HTTP Request"}
        describeReference={describeReference}
        renderField={(field) => <span>{field.path}</span>}
        emptyLabel="No fields"
      />
      <button type="button" onClick={() => setValue("Reset {{ nodes.http.status }}")}>
        Reset
      </button>
    </>
  );
}

function renderEditor(initial: string, options: { multiline?: boolean } = {}) {
  const onChange = vi.fn();
  render(<Harness initial={initial} multiline={options.multiline} onChange={onChange} />);
  const textbox = screen.getByRole("textbox", { name: "Message" });
  const editor = (textbox as HTMLElement & { editor?: Editor }).editor!;
  return { textbox, editor, onChange };
}

const pills = (textbox: HTMLElement) => textbox.querySelectorAll('[data-slot="field-pill"]');

/** Pill views are drawn just after the editor's own update. */
const expectPills = (textbox: HTMLElement, count: number) =>
  waitFor(() => expect(pills(textbox)).toHaveLength(count));

describe("template documents", () => {
  it("reads a setting's text back exactly, references as they were written", () => {
    const { editor } = renderEditor("");
    for (const text of [
      "Hi {{nodes.http.status}} and {{ trigger.user.name }}",
      "{{ nodes.http.json.count }}",
      "plain",
      "",
    ]) {
      act(() => {
        editor.commands.setContent(templateToDocument(text, { multiline: false }));
      });
      expect(documentToTemplate(editor.state.doc)).toBe(text);
    }
  });

  it("keeps the lines of a multi-line setting and flattens a one-line one", () => {
    expect(templateToDocument("a\n\n{{ nodes.x.y }}", { multiline: true }).content).toHaveLength(3);
    expect(templateToDocument("a\nb", { multiline: false })).toEqual({
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "a b" }] }],
    });
  });
});

describe("WorkflowTemplateEditor", () => {
  it("shows the fields a setting reads as pills among its text", async () => {
    const { textbox } = renderEditor("{{ nodes.http.json.count }} new strings");
    await expectPills(textbox, 1);
    expect(textbox).toHaveTextContent("HTTP Request›json.count new strings");
  });

  it("turns a reference typed out in full, or pasted, into a pill", async () => {
    const { textbox, editor, onChange } = renderEditor("Hi ");
    // Typing the closing brace goes through the editor's text input, as a key press does.
    act(() => {
      editor.chain().focus("end").insertContent("{{ nodes.http.status }").run();
    });
    const end = editor.state.selection.from;
    act(() => {
      editor.view.someProp("handleTextInput", (handle) =>
        handle(editor.view, end, end, "}", () => editor.state.tr.insertText("}", end, end)),
      );
    });
    await expectPills(textbox, 1);
    expect(onChange).toHaveBeenLastCalledWith("Hi {{ nodes.http.status }}");

    act(() => {
      editor
        .chain()
        .focus("end")
        .insertContent(" and {{ nodes.http.json.count }}!", { applyPasteRules: true })
        .run();
    });
    await expectPills(textbox, 2);
    expect(onChange).toHaveBeenLastCalledWith(
      "Hi {{ nodes.http.status }} and {{ nodes.http.json.count }}!",
    );
  });

  it("lists fields after {{ and puts the chosen one in as a pill", async () => {
    const { textbox, editor, onChange } = renderEditor("Count: ");
    act(() => {
      editor.chain().focus("end").insertContent("{{cou").run();
    });
    const options = await screen.findAllByRole("option");
    expect(options.map((option) => option.textContent)).toEqual(["json.count"]);

    fireEvent.keyDown(textbox, { key: "Enter" });
    await waitFor(() => expect(screen.queryByRole("listbox")).not.toBeInTheDocument());
    await expectPills(textbox, 1);
    expect(onChange).toHaveBeenLastCalledWith("Count: {{ nodes.http.json.count }}");
  });

  it("closes the field list on Escape and leaves the typed text", async () => {
    const { editor, textbox } = renderEditor("");
    act(() => {
      editor.chain().focus("end").insertContent("{{").run();
    });
    expect(await screen.findAllByRole("option")).toHaveLength(2);
    fireEvent.keyDown(textbox, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("listbox")).not.toBeInTheDocument());
    expect(documentToTemplate(editor.state.doc)).toBe("{{");
  });

  it("deletes a pill as one piece", async () => {
    const { textbox, editor, onChange } = renderEditor("Hi {{ nodes.http.status }}");
    await expectPills(textbox, 1);
    act(() => {
      editor.commands.focus("end");
    });
    fireEvent.keyDown(textbox, { key: "Backspace" });
    await expectPills(textbox, 0);
    expect(onChange).toHaveBeenLastCalledWith("Hi ");

    act(() => {
      editor.commands.setContent(
        templateToDocument("{{ nodes.http.status }}!", { multiline: false }),
      );
      editor.commands.focus("start");
    });
    await expectPills(textbox, 1);
    fireEvent.keyDown(textbox, { key: "Delete" });
    await expectPills(textbox, 0);
    expect(documentToTemplate(editor.state.doc)).toBe("!");
  });

  it("keeps a one-line setting to one line", () => {
    const { textbox, editor } = renderEditor("Hi");
    act(() => {
      editor.commands.focus("end");
    });
    fireEvent.keyDown(textbox, { key: "Enter" });
    expect(editor.state.doc.childCount).toBe(1);
    expect(textbox).toHaveAttribute("aria-multiline", "false");
  });

  function pasteHtml(editor: Editor, html: string, text = "") {
    const clipboardData = new DataTransfer();
    clipboardData.setData("text/html", html);
    clipboardData.setData("text/plain", text);
    const event = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "clipboardData", { value: clipboardData });
    act(() => {
      editor.view.focus();
      editor.view.dom.dispatchEvent(event);
    });
  }

  it("flattens a rich-text paste in a one-line setting", () => {
    const { editor, onChange } = renderEditor("");
    pasteHtml(editor, "<p>first</p><p>second</p>", "from-plain-text");
    expect(editor.state.doc.childCount).toBe(1);
    expect(onChange).toHaveBeenLastCalledWith("first second");
  });

  it("joins extra paragraphs in a one-line setting", () => {
    const { editor, onChange } = renderEditor("");
    act(() => {
      editor.commands.setContent({
        type: "doc",
        content: [
          { type: "paragraph", content: [{ type: "text", text: "first" }] },
          { type: "paragraph", content: [{ type: "text", text: "second" }] },
        ],
      });
    });
    expect(editor.state.doc.childCount).toBe(1);
    expect(onChange).toHaveBeenLastCalledWith("first second");
  });

  it("leaves a multi-line setting's pasted HTML alone", () => {
    const { editor } = renderEditor("", { multiline: true });
    const html = "<p>first</p><p>second</p>";
    expect(editor.view.props.transformPastedHTML?.(html, editor.view)).toBe(html);
  });

  it("keeps lines in a multi-line setting", () => {
    const { textbox, editor, onChange } = renderEditor("Hi", { multiline: true });
    act(() => {
      editor.commands.focus("end");
    });
    fireEvent.keyDown(textbox, { key: "Enter" });
    act(() => {
      editor.commands.insertContent("there");
    });
    expect(onChange).toHaveBeenLastCalledWith("Hi\nthere");
  });

  it("hands undo and redo to the page's undo stack", () => {
    const { textbox } = renderEditor("Hi");
    const inputTypes: string[] = [];
    document.addEventListener("beforeinput", (event) =>
      inputTypes.push((event as InputEvent).inputType),
    );
    fireEvent.keyDown(textbox, { key: "z", ctrlKey: true });
    fireEvent.keyDown(textbox, { key: "z", ctrlKey: true, shiftKey: true });
    expect(inputTypes).toEqual(["historyUndo", "historyRedo"]);
  });

  it("takes a new value from outside, such as an undo", async () => {
    const { textbox, onChange } = renderEditor("Hi");
    fireEvent.click(screen.getByRole("button", { name: "Reset" }));
    await waitFor(() => expect(textbox).toHaveTextContent("Reset HTTP Request›status"));
    expect(onChange).not.toHaveBeenCalled();
  });
});
