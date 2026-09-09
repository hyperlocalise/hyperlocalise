"use client";

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
import { useId } from "react";
import { useIntl } from "react-intl";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldDescription,
  FieldContent,
} from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import { Empty, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import {
  MAX_VIDEO_TEXT_ELEMENTS,
  videoTimecode,
  type VideoRefinements,
  type VideoTextElement,
} from "@/lib/projects/files/video-refinements";
import { videoWorkspaceMessages as messages } from "./content-editor-video-workspace.messages";

export function ContentEditorVideoInspector({
  draft,
  onChange,
  selectedId,
  onSelect,
  onExtract,
  canExtract,
  frameReady,
  extracting,
  canEdit,
  targetLocale,
  timestamp,
  tab,
  onTabChange,
}: {
  draft: VideoRefinements;
  onChange: (draft: VideoRefinements) => void;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onExtract: () => void;
  canExtract: boolean;
  frameReady: boolean;
  extracting: boolean;
  canEdit: boolean;
  targetLocale: string;
  timestamp: number;
  tab: string;
  onTabChange: (tab: string) => void;
}) {
  const intl = useIntl();
  const id = useId();
  const selected = draft.elements.find((element) => element.id === selectedId);
  const full = draft.elements.length >= MAX_VIDEO_TEXT_ELEMENTS;
  function editElement(update: Partial<VideoTextElement>) {
    if (!selected) return;
    onChange({
      ...draft,
      elements: draft.elements.map((element) =>
        element.id === selected.id ? { ...element, ...update } : element,
      ),
    });
  }
  return (
    <Tabs
      value={tab}
      onValueChange={(value) => onTabChange(String(value))}
      className="min-h-0 flex-1 gap-0"
    >
      <TabsList variant="line" className="mx-4 my-3 w-auto">
        <TabsTrigger value="sound">{intl.formatMessage(messages.sound)}</TabsTrigger>
        <TabsTrigger value="text">
          {intl.formatMessage(messages.text)}
          {draft.elements.length ? ` · ${draft.elements.length}` : ""}
        </TabsTrigger>
      </TabsList>
      <Separator />
      <TabsContent value="sound" className="overflow-y-auto p-5">
        <FieldGroup>
          <p className="text-pretty text-sm leading-relaxed text-muted-foreground">
            {intl.formatMessage(messages.soundHint)}
          </p>
          <Field orientation="horizontal">
            <FieldContent>
              <FieldLabel htmlFor={`${id}-speech`}>
                {intl.formatMessage(messages.preserveSpeech)}
              </FieldLabel>
              <FieldDescription>{intl.formatMessage(messages.preserveHint)}</FieldDescription>
            </FieldContent>
            <Switch
              id={`${id}-speech`}
              checked={draft.preserveSpeech}
              disabled={!canEdit}
              onCheckedChange={(preserveSpeech) => onChange({ ...draft, preserveSpeech })}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor={`${id}-voice`}>{intl.formatMessage(messages.voice)}</FieldLabel>
            <Textarea
              id={`${id}-voice`}
              rows={4}
              maxLength={2000}
              disabled={!canEdit || draft.preserveSpeech}
              value={draft.voice}
              placeholder={intl.formatMessage(messages.voicePlaceholder)}
              onChange={(event) => onChange({ ...draft, voice: event.target.value })}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor={`${id}-background`}>
              {intl.formatMessage(messages.background)}
            </FieldLabel>
            <Textarea
              id={`${id}-background`}
              rows={4}
              maxLength={2000}
              disabled={!canEdit}
              value={draft.background}
              placeholder={intl.formatMessage(messages.backgroundPlaceholder)}
              onChange={(event) => onChange({ ...draft, background: event.target.value })}
            />
          </Field>
        </FieldGroup>
      </TabsContent>
      <TabsContent value="text" className="flex flex-col gap-4 overflow-y-auto p-5">
        <p className="text-pretty text-sm leading-relaxed text-muted-foreground">
          {intl.formatMessage(messages.textHint)}
        </p>
        <Button
          variant="outline"
          disabled={!canEdit || !canExtract || !frameReady || extracting || full}
          onClick={onExtract}
        >
          {extracting ? <Spinner /> : null}
          {intl.formatMessage(extracting ? messages.extracting : messages.extract)}
        </Button>
        <p className="text-pretty text-xs leading-relaxed text-muted-foreground">
          {intl.formatMessage(canExtract ? messages.frameHint : messages.external)}
        </p>
        {draft.elements.length ? (
          <div
            className="flex max-h-44 flex-col gap-1 overflow-y-auto"
            aria-label={intl.formatMessage(messages.text)}
          >
            {draft.elements.map((element, index) => (
              <Button
                key={element.id}
                variant={element.id === selectedId ? "secondary" : "ghost"}
                className="justify-start"
                onClick={() => onSelect(element.id)}
                aria-pressed={element.id === selectedId}
              >
                <span className="shrink-0 tabular-nums">{videoTimecode(element.timestamp)}</span>
                <span className="truncate">
                  {element.text || intl.formatMessage(messages.element, { index: index + 1 })}
                </span>
              </Button>
            ))}
          </div>
        ) : (
          <Empty className="px-2 py-5">
            <EmptyHeader>
              <EmptyTitle>{intl.formatMessage(messages.emptyText)}</EmptyTitle>
            </EmptyHeader>
          </Empty>
        )}
        <Button
          variant="ghost"
          size="sm"
          disabled={!canEdit || full}
          onClick={() => {
            const element: VideoTextElement = {
              id: crypto.randomUUID(),
              timestamp,
              text: "",
              replacement: "",
              keepOriginal: false,
            };
            onChange({ ...draft, elements: [...draft.elements, element] });
            onSelect(element.id);
          }}
        >
          {intl.formatMessage(messages.add)}
        </Button>
        {full ? (
          <p role="status" className="text-xs text-muted-foreground">
            {intl.formatMessage(messages.limit, { count: MAX_VIDEO_TEXT_ELEMENTS })}
          </p>
        ) : null}
        {selected ? (
          <>
            <Separator />
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor={`${id}-source`}>
                  {intl.formatMessage(messages.sourceText)}
                </FieldLabel>
                <Textarea
                  id={`${id}-source`}
                  dir="auto"
                  maxLength={4000}
                  rows={2}
                  value={selected.text}
                  disabled={!canEdit}
                  onChange={(event) => editElement({ text: event.target.value })}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor={`${id}-replacement`}>
                  {intl.formatMessage(messages.replacement, { locale: targetLocale })}
                </FieldLabel>
                <Textarea
                  id={`${id}-replacement`}
                  dir="auto"
                  maxLength={4000}
                  rows={2}
                  value={selected.replacement}
                  disabled={!canEdit || selected.keepOriginal}
                  onChange={(event) => editElement({ replacement: event.target.value })}
                />
                <FieldDescription>{intl.formatMessage(messages.replacementHint)}</FieldDescription>
              </Field>
              <Field orientation="horizontal">
                <FieldLabel htmlFor={`${id}-keep`}>{intl.formatMessage(messages.keep)}</FieldLabel>
                <Switch
                  id={`${id}-keep`}
                  checked={selected.keepOriginal}
                  disabled={!canEdit}
                  onCheckedChange={(keepOriginal) => editElement({ keepOriginal })}
                />
              </Field>
            </FieldGroup>
            <Button
              variant="ghost"
              size="sm"
              disabled={!canEdit}
              onClick={() =>
                onChange({
                  ...draft,
                  elements: draft.elements.filter((element) => element.id !== selected.id),
                })
              }
            >
              {intl.formatMessage(messages.remove)}
            </Button>
          </>
        ) : null}
      </TabsContent>
    </Tabs>
  );
}
