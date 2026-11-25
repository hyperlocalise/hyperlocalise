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
import { useState } from "react";
import { CheckCircleIcon, MinusCircleIcon, PlusIcon, XIcon } from "@phosphor-icons/react";
import { FormattedMessage, useIntl, type MessageDescriptor } from "react-intl";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/primitives/cn";
import {
  MAX_SOURCE_PATH_PATTERNS,
  sourcePathMatches,
  sourcePathPatternError,
  type SourcePathMatchSyntax,
  type SourcePathPatternError,
} from "@/lib/visual-workflows/dispatch/source-path-filter";
import type { VisualWorkflowSourceUploadTriggerConfig } from "@/lib/visual-workflows/schema/types";

import { sourceUploadTriggerFieldsMessages as messages } from "./source-upload-trigger-fields.messages";

const EXAMPLES: Record<SourcePathMatchSyntax, readonly string[]> = {
  glob: ["**/*.json", "locales/en/**", "*.{md,mdx}", "docs/**/*.md"],
  regex: ["^locales/en/.*\\.json$", "\\.(md|mdx)$", "^content/(blog|docs)/"],
};

const PATTERN_ERROR_MESSAGES: Record<SourcePathPatternError, MessageDescriptor> = {
  empty: messages.patternEmpty,
  too_long: messages.patternTooLong,
  invalid: messages.patternInvalid,
  unsafe: messages.patternUnsafe,
};

/**
 * Which uploads start a Source upload workflow: new files or updates too, and which paths. The
 * "Try a path" box runs the same matcher as the dispatcher, so what it shows is what runs.
 */
export function SourceUploadTriggerFields({
  config,
  onChangeConfig,
}: {
  config: VisualWorkflowSourceUploadTriggerConfig;
  onChangeConfig: (config: VisualWorkflowSourceUploadTriggerConfig) => void;
}) {
  const intl = useIntl();
  const [testPath, setTestPath] = useState("");
  const syntax = config.pathSyntax ?? "glob";
  const patterns = config.pathPatterns ?? [];
  const usablePatterns = patterns.filter((pattern) => !sourcePathPatternError(pattern, syntax));
  const canAddPattern = patterns.length < MAX_SOURCE_PATH_PATTERNS;

  const setPatterns = (next: string[]) =>
    onChangeConfig({ ...config, pathPatterns: next.length > 0 ? next : undefined });
  const addPattern = (pattern: string) => {
    if (!canAddPattern || patterns.includes(pattern)) return;
    // Fill an empty row before adding another.
    const emptyIndex = patterns.findIndex((existing) => !existing.trim());
    setPatterns(
      emptyIndex >= 0
        ? patterns.map((existing, index) => (index === emptyIndex ? pattern : existing))
        : [...patterns, pattern],
    );
  };

  const trimmedTestPath = testPath.trim();
  const testMatches = sourcePathMatches(trimmedTestPath, { syntax, patterns });

  return (
    <div className="grid gap-5">
      <div className="grid gap-1.5">
        <Label id="vw-source-uploads-label">
          <FormattedMessage {...messages.uploadsLabel} />
        </Label>
        <Tabs
          value={config.uploads ?? "new_and_updated"}
          onValueChange={(value) =>
            onChangeConfig({
              ...config,
              uploads: value === "new" ? "new" : undefined,
            })
          }
        >
          <TabsList aria-labelledby="vw-source-uploads-label" className="w-full">
            <TabsTrigger value="new_and_updated" className="flex-1">
              <FormattedMessage {...messages.uploadsNewAndUpdated} />
            </TabsTrigger>
            <TabsTrigger value="new" className="flex-1">
              <FormattedMessage {...messages.uploadsNewOnly} />
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <fieldset className="grid gap-3">
        <div className="flex items-center justify-between gap-3">
          <legend className="text-sm font-medium text-foreground">
            <FormattedMessage {...messages.filterLabel} />
          </legend>
          <Tabs
            value={syntax}
            onValueChange={(value) =>
              onChangeConfig({ ...config, pathSyntax: value === "regex" ? "regex" : undefined })
            }
          >
            <TabsList aria-label={intl.formatMessage(messages.syntaxLabel)}>
              <TabsTrigger value="glob">
                <FormattedMessage {...messages.syntaxGlob} />
              </TabsTrigger>
              <TabsTrigger value="regex">
                <FormattedMessage {...messages.syntaxRegex} />
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {patterns.length > 0 ? (
          <ul className="grid gap-2">
            {patterns.map((pattern, index) => {
              const error = sourcePathPatternError(pattern, syntax);
              const errorId = `vw-source-pattern-${index}-error`;
              return (
                <li key={index} className="grid gap-1">
                  <div className="flex items-center gap-2">
                    <Input
                      value={pattern}
                      autoFocus={!pattern && index === patterns.length - 1}
                      className="font-mono text-sm"
                      spellCheck={false}
                      aria-label={intl.formatMessage(messages.patternLabel, { number: index + 1 })}
                      aria-invalid={error ? true : undefined}
                      aria-describedby={error ? errorId : undefined}
                      placeholder={EXAMPLES[syntax][0]}
                      onChange={(event) =>
                        setPatterns(
                          patterns.map((existing, at) =>
                            at === index ? event.target.value : existing,
                          ),
                        )
                      }
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={intl.formatMessage(messages.removePattern, {
                        number: index + 1,
                      })}
                      onClick={() => setPatterns(patterns.filter((_, at) => at !== index))}
                    >
                      <XIcon aria-hidden />
                    </Button>
                  </div>
                  {error ? (
                    <p id={errorId} className="text-xs text-destructive">
                      <FormattedMessage {...PATTERN_ERROR_MESSAGES[error]} />
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-xs text-muted-foreground">
            <FormattedMessage {...messages.filterEmptyHint} />
          </p>
        )}

        <div className="flex flex-wrap items-center gap-1.5">
          <Button
            type="button"
            variant="outline"
            size="xs"
            disabled={!canAddPattern}
            onClick={() => setPatterns([...patterns, ""])}
          >
            <PlusIcon aria-hidden data-icon="inline-start" />
            <FormattedMessage {...messages.addPattern} />
          </Button>
          <span className="ms-1 text-xs text-muted-foreground">
            <FormattedMessage {...messages.examplesLabel} />
          </span>
          {EXAMPLES[syntax].map((example) => (
            <Button
              key={example}
              type="button"
              variant="ghost"
              size="xs"
              className="font-mono"
              disabled={!canAddPattern || patterns.includes(example)}
              aria-label={intl.formatMessage(messages.addExample, { pattern: example })}
              onClick={() => addPattern(example)}
            >
              {example}
            </Button>
          ))}
        </div>

        <p className="text-xs text-muted-foreground">
          <FormattedMessage {...(syntax === "glob" ? messages.globHint : messages.regexHint)} />
        </p>
      </fieldset>

      {usablePatterns.length > 0 ? (
        <div className="grid gap-1.5">
          <Label htmlFor="vw-source-test-path">
            <FormattedMessage {...messages.testLabel} />
          </Label>
          <Input
            id="vw-source-test-path"
            value={testPath}
            className="font-mono text-sm"
            spellCheck={false}
            placeholder="locales/en/app.json"
            onChange={(event) => setTestPath(event.target.value)}
          />
          <p
            aria-live="polite"
            className={cn(
              "flex min-h-5 items-center gap-1.5 text-xs",
              testMatches ? "text-success" : "text-muted-foreground",
            )}
          >
            {trimmedTestPath ? (
              testMatches ? (
                <>
                  <CheckCircleIcon aria-hidden className="size-4" />
                  <FormattedMessage {...messages.testMatches} />
                </>
              ) : (
                <>
                  <MinusCircleIcon aria-hidden className="size-4" />
                  <FormattedMessage {...messages.testSkipped} />
                </>
              )
            ) : null}
          </p>
        </div>
      ) : null}
    </div>
  );
}
