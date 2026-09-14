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

import { Add01Icon, Delete02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { FormattedMessage, useIntl } from "react-intl";

import { srxEditorMessages as messages } from "@/components/srx-editor/srx-editor.messages";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { SrxBuiltinTemplate } from "@/lib/i18n/srx/srx-template-samples";
import {
  createEmptyBreakRule,
  createEmptyLanguageMap,
  createEmptyLanguageRule,
  loadBuiltinSrxDocument,
  type SrxDocumentModel,
  serializeSrxXml,
} from "@/lib/i18n/srx/srx-document";

type SrxEditorProps = {
  model: SrxDocumentModel;
  onChange: (model: SrxDocumentModel) => void;
  disabled?: boolean;
};

export function SrxEditor({ model, onChange, disabled }: SrxEditorProps) {
  const intl = useIntl();

  const languageRuleNames = model.languageRules.map((rule) => rule.languageName).filter(Boolean);

  const updateModel = (next: SrxDocumentModel) => {
    if (!disabled) {
      onChange(next);
    }
  };

  const loadTemplate = (template: SrxBuiltinTemplate) => {
    const loaded = loadBuiltinSrxDocument(template);
    if (loaded.ok) {
      updateModel(loaded.model);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="flex flex-col gap-1">
          <Label>
            <FormattedMessage {...messages.loadTemplateLabel} />
          </Label>
          <Select
            disabled={disabled}
            onValueChange={(value) => loadTemplate(value as SrxBuiltinTemplate)}
          >
            <SelectTrigger className="w-56">
              <SelectValue placeholder={intl.formatMessage(messages.templateDefault)} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="default">
                <FormattedMessage {...messages.templateDefault} />
              </SelectItem>
              <SelectItem value="html">
                <FormattedMessage {...messages.templateHtml} />
              </SelectItem>
              <SelectItem value="markdown">
                <FormattedMessage {...messages.templateMarkdown} />
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex items-start gap-2 rounded-md border p-3">
        <Checkbox
          id="srx-cascade"
          checked={model.cascade === "yes"}
          disabled={disabled}
          onCheckedChange={(checked) =>
            updateModel({ ...model, cascade: checked === true ? "yes" : "no" })
          }
        />
        <div className="flex flex-col gap-0.5">
          <Label htmlFor="srx-cascade" className="font-normal">
            <FormattedMessage {...messages.cascadeLabel} />
          </Label>
          <p className="text-xs text-muted-foreground">
            <FormattedMessage {...messages.cascadeHint} />
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <h4 className="text-sm font-medium">
            <FormattedMessage {...messages.languageRulesHeading} />
          </h4>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled}
            onClick={() =>
              updateModel({
                ...model,
                languageRules: [...model.languageRules, createEmptyLanguageRule()],
              })
            }
          >
            <HugeiconsIcon icon={Add01Icon} strokeWidth={1.8} data-icon="inline-start" />
            <FormattedMessage {...messages.addLanguageRule} />
          </Button>
        </div>

        {model.languageRules.map((languageRule, languageIndex) => (
          <div key={languageRule.id} className="flex flex-col gap-3 rounded-md border p-3">
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-48 flex-1">
                <Label htmlFor={`srx-lang-name-${languageRule.id}`}>
                  <FormattedMessage {...messages.languageNameLabel} />
                </Label>
                <Input
                  id={`srx-lang-name-${languageRule.id}`}
                  className="font-mono text-sm"
                  disabled={disabled}
                  value={languageRule.languageName}
                  onChange={(event) => {
                    const languageRules = model.languageRules.map((item, index) =>
                      index === languageIndex
                        ? { ...item, languageName: event.target.value }
                        : item,
                    );
                    updateModel({ ...model, languageRules });
                  }}
                />
              </div>
              {model.languageRules.length > 1 ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={disabled}
                  onClick={() =>
                    updateModel({
                      ...model,
                      languageRules: model.languageRules.filter(
                        (_, index) => index !== languageIndex,
                      ),
                    })
                  }
                >
                  <HugeiconsIcon icon={Delete02Icon} strokeWidth={1.8} data-icon="inline-start" />
                  <FormattedMessage {...messages.removeLanguageRule} />
                </Button>
              ) : null}
            </div>

            <div className="flex flex-col gap-2">
              <p className="text-xs font-medium text-muted-foreground">
                <FormattedMessage {...messages.rulesHeading} />
              </p>
              {languageRule.rules.map((rule, ruleIndex) => (
                <div
                  key={rule.id}
                  className="grid gap-2 rounded-md bg-muted/40 p-2 sm:grid-cols-[minmax(0,8rem)_1fr_1fr_auto]"
                >
                  <div>
                    <Label className="text-xs">
                      <FormattedMessage {...messages.breakLabel} />
                    </Label>
                    <Select
                      disabled={disabled}
                      value={rule.break}
                      onValueChange={(value) => {
                        const languageRules = model.languageRules.map((item, li) =>
                          li === languageIndex
                            ? {
                                ...item,
                                rules: item.rules.map((r, ri) =>
                                  ri === ruleIndex ? { ...r, break: value as "yes" | "no" } : r,
                                ),
                              }
                            : item,
                        );
                        updateModel({ ...model, languageRules });
                      }}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="yes">
                          <FormattedMessage {...messages.breakYes} />
                        </SelectItem>
                        <SelectItem value="no">
                          <FormattedMessage {...messages.breakNo} />
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">
                      <FormattedMessage {...messages.beforeBreakLabel} />
                    </Label>
                    <Input
                      className="font-mono text-xs"
                      disabled={disabled}
                      spellCheck={false}
                      value={rule.beforeBreak}
                      onChange={(event) => {
                        const languageRules = model.languageRules.map((item, li) =>
                          li === languageIndex
                            ? {
                                ...item,
                                rules: item.rules.map((r, ri) =>
                                  ri === ruleIndex ? { ...r, beforeBreak: event.target.value } : r,
                                ),
                              }
                            : item,
                        );
                        updateModel({ ...model, languageRules });
                      }}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">
                      <FormattedMessage {...messages.afterBreakLabel} />
                    </Label>
                    <Input
                      className="font-mono text-xs"
                      disabled={disabled}
                      spellCheck={false}
                      value={rule.afterBreak}
                      onChange={(event) => {
                        const languageRules = model.languageRules.map((item, li) =>
                          li === languageIndex
                            ? {
                                ...item,
                                rules: item.rules.map((r, ri) =>
                                  ri === ruleIndex ? { ...r, afterBreak: event.target.value } : r,
                                ),
                              }
                            : item,
                        );
                        updateModel({ ...model, languageRules });
                      }}
                    />
                  </div>
                  <div className="flex items-end">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      disabled={disabled || languageRule.rules.length <= 1}
                      aria-label={intl.formatMessage(messages.removeRule)}
                      onClick={() => {
                        const languageRules = model.languageRules.map((item, li) =>
                          li === languageIndex
                            ? {
                                ...item,
                                rules: item.rules.filter((_, ri) => ri !== ruleIndex),
                              }
                            : item,
                        );
                        updateModel({ ...model, languageRules });
                      }}
                    >
                      <HugeiconsIcon icon={Delete02Icon} strokeWidth={1.8} className="size-4" />
                    </Button>
                  </div>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="self-start"
                disabled={disabled}
                onClick={() => {
                  const languageRules = model.languageRules.map((item, li) =>
                    li === languageIndex
                      ? { ...item, rules: [...item.rules, createEmptyBreakRule()] }
                      : item,
                  );
                  updateModel({ ...model, languageRules });
                }}
              >
                <HugeiconsIcon icon={Add01Icon} strokeWidth={1.8} data-icon="inline-start" />
                <FormattedMessage {...messages.addRule} />
              </Button>
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-3">
        <div>
          <h4 className="text-sm font-medium">
            <FormattedMessage {...messages.mapsHeading} />
          </h4>
          <p className="text-xs text-muted-foreground">
            <FormattedMessage {...messages.mapsHint} />
          </p>
        </div>
        {model.languageMaps.map((map, mapIndex) => (
          <div
            key={map.id}
            className="grid gap-2 rounded-md border p-2 sm:grid-cols-[1fr_1fr_auto]"
          >
            <div>
              <Label className="text-xs">
                <FormattedMessage {...messages.patternLabel} />
              </Label>
              <Input
                className="font-mono text-xs"
                disabled={disabled}
                spellCheck={false}
                value={map.languagePattern}
                onChange={(event) => {
                  const languageMaps = model.languageMaps.map((item, index) =>
                    index === mapIndex ? { ...item, languagePattern: event.target.value } : item,
                  );
                  updateModel({ ...model, languageMaps });
                }}
              />
            </div>
            <div>
              <Label className="text-xs">
                <FormattedMessage {...messages.targetRuleLabel} />
              </Label>
              <Select
                disabled={disabled}
                value={map.languageRuleName || undefined}
                onValueChange={(value) => {
                  const languageMaps = model.languageMaps.map((item, index) =>
                    index === mapIndex ? { ...item, languageRuleName: value ?? "" } : item,
                  );
                  updateModel({ ...model, languageMaps });
                }}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {languageRuleNames.map((name) => (
                    <SelectItem key={name} value={name}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                disabled={disabled}
                aria-label={intl.formatMessage(messages.removeMap)}
                onClick={() =>
                  updateModel({
                    ...model,
                    languageMaps: model.languageMaps.filter((_, index) => index !== mapIndex),
                  })
                }
              >
                <HugeiconsIcon icon={Delete02Icon} strokeWidth={1.8} className="size-4" />
              </Button>
            </div>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="self-start"
          disabled={disabled}
          onClick={() =>
            updateModel({
              ...model,
              languageMaps: [
                ...model.languageMaps,
                createEmptyLanguageMap(languageRuleNames[0] ?? "Default"),
              ],
            })
          }
        >
          <HugeiconsIcon icon={Add01Icon} strokeWidth={1.8} data-icon="inline-start" />
          <FormattedMessage {...messages.addMap} />
        </Button>
      </div>

      <Collapsible>
        <CollapsibleTrigger
          render={
            <Button type="button" variant="ghost" size="sm" className="self-start px-0">
              <FormattedMessage {...messages.viewXml} />
            </Button>
          }
        />
        <CollapsibleContent>
          <Textarea
            readOnly
            className="mt-2 min-h-40 font-mono text-xs"
            value={serializeSrxXml(model)}
            spellCheck={false}
          />
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
