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

import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Column } from "@/components/ui/layout/column";
import { Columns } from "@/components/ui/layout/columns";
import { Row } from "@/components/ui/layout/row";
import { Rows } from "@/components/ui/layout/rows";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TypographyP } from "@/components/ui/typography";
import type { ExperimentCriterionMatch } from "@/lib/database/schema/experiments";

import { hyperlabMessages as messages } from "./hyperlab.messages";
import {
  attributeValueToInput,
  emptyAttributeRule,
  HYPERLAB_ATTRIBUTE_PRESETS,
  HYPERLAB_MATCH_OPTIONS,
  summarizeCriterion,
  type HyperlabRuleGroup,
} from "./hyperlab-criterion";

const CUSTOM_ATTRIBUTE = "__custom";

export function HyperlabCriterionBuilder({
  group,
  onChange,
  disabled,
}: {
  group: HyperlabRuleGroup;
  onChange: (next: HyperlabRuleGroup) => void;
  disabled?: boolean;
}) {
  const intl = useIntl();
  const combinerItems = [
    { value: "and", label: intl.formatMessage(messages.matchAll) },
    { value: "or", label: intl.formatMessage(messages.matchAny) },
  ];

  return (
    <Rows spacing="2u">
      <Row spacing="1.5u" align="spaceBetween" alignY="center">
        <Select
          value={group.type}
          items={combinerItems}
          onValueChange={(next) => {
            if (next === "and" || next === "or") {
              onChange({ ...group, type: next });
            }
          }}
          disabled={disabled}
        >
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {combinerItems.map((item) => (
                <SelectItem key={item.value} value={item.value} label={item.label}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        {disabled ? null : (
          <Button
            type="button"
            variant="outline"
            onClick={() => onChange({ ...group, rules: [...group.rules, emptyAttributeRule()] })}
          >
            <HugeiconsIcon icon={Add01Icon} strokeWidth={1.8} data-icon="inline-start" />
            <FormattedMessage {...messages.addRule} />
          </Button>
        )}
      </Row>
      {group.rules.length === 0 ? (
        <TypographyP size="small" tone="subtle">
          <FormattedMessage {...messages.noRules} />
        </TypographyP>
      ) : (
        <Rows spacing="1.5u">
          {group.rules.map((rule, index) => {
            const presetNames = HYPERLAB_ATTRIBUTE_PRESETS.map((item) => item.name);
            const isCustom = !presetNames.includes(rule.name as (typeof presetNames)[number]);
            const attributeItems = [
              ...HYPERLAB_ATTRIBUTE_PRESETS.map((item) => ({
                value: item.name,
                label: item.label,
              })),
              { value: CUSTOM_ATTRIBUTE, label: intl.formatMessage(messages.customAttribute) },
            ];
            const matchOption = HYPERLAB_MATCH_OPTIONS.find((item) => item.value === rule.match);
            return (
              <div
                key={`${rule.name}-${index}`}
                className="rounded-xl bg-muted/40 p-4 ring-1 ring-border"
              >
                <FieldGroup>
                  <Columns spacing="1.5u" collapseBelow="small">
                    <Column width="1/3">
                      <Field>
                        <FieldLabel>
                          <FormattedMessage {...messages.ruleAttributeLabel} />
                        </FieldLabel>
                        <Select
                          value={isCustom ? CUSTOM_ATTRIBUTE : rule.name}
                          items={attributeItems}
                          onValueChange={(next) => {
                            const name = next === CUSTOM_ATTRIBUTE ? "" : (next ?? rule.name);
                            const nextRules = group.rules.slice();
                            nextRules[index] = { ...rule, name };
                            onChange({ ...group, rules: nextRules });
                          }}
                          disabled={disabled}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectGroup>
                              {attributeItems.map((item) => (
                                <SelectItem key={item.value} value={item.value} label={item.label}>
                                  {item.label}
                                </SelectItem>
                              ))}
                            </SelectGroup>
                          </SelectContent>
                        </Select>
                      </Field>
                    </Column>
                    <Column width="1/3">
                      <Field>
                        <FieldLabel>
                          <FormattedMessage {...messages.ruleMatchLabel} />
                        </FieldLabel>
                        <Select
                          value={rule.match}
                          items={HYPERLAB_MATCH_OPTIONS.map((item) => ({
                            value: item.value,
                            label: item.label,
                          }))}
                          onValueChange={(next) => {
                            const match = (next ?? rule.match) as ExperimentCriterionMatch;
                            const nextRules = group.rules.slice();
                            nextRules[index] = { ...rule, match };
                            onChange({ ...group, rules: nextRules });
                          }}
                          disabled={disabled}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectGroup>
                              {HYPERLAB_MATCH_OPTIONS.map((item) => (
                                <SelectItem key={item.value} value={item.value} label={item.label}>
                                  {item.label}
                                </SelectItem>
                              ))}
                            </SelectGroup>
                          </SelectContent>
                        </Select>
                      </Field>
                    </Column>
                    <Column width="1/3">
                      {matchOption?.needsValue ? (
                        <Field>
                          <FieldLabel>
                            <FormattedMessage {...messages.ruleValueLabel} />
                          </FieldLabel>
                          <Input
                            value={attributeValueToInput(rule)}
                            disabled={disabled}
                            onChange={(event) => {
                              const nextRules = group.rules.slice();
                              nextRules[index] = { ...rule, value: event.target.value };
                              onChange({ ...group, rules: nextRules });
                            }}
                          />
                          {matchOption.multi ? (
                            <FieldDescription>
                              <FormattedMessage {...messages.ruleValueHint} />
                            </FieldDescription>
                          ) : null}
                        </Field>
                      ) : (
                        <div />
                      )}
                    </Column>
                  </Columns>
                  {isCustom ? (
                    <Field>
                      <FieldLabel htmlFor={`hyperlab-custom-attribute-${index}`}>
                        <FormattedMessage {...messages.ruleAttributeLabel} />
                      </FieldLabel>
                      <Input
                        id={`hyperlab-custom-attribute-${index}`}
                        value={rule.name}
                        disabled={disabled}
                        onChange={(event) => {
                          const nextRules = group.rules.slice();
                          nextRules[index] = { ...rule, name: event.target.value };
                          onChange({ ...group, rules: nextRules });
                        }}
                      />
                    </Field>
                  ) : null}
                  {disabled ? null : (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="w-fit"
                      onClick={() =>
                        onChange({
                          ...group,
                          rules: group.rules.filter((_, ruleIndex) => ruleIndex !== index),
                        })
                      }
                    >
                      <HugeiconsIcon
                        icon={Delete02Icon}
                        strokeWidth={1.8}
                        data-icon="inline-start"
                      />
                      <FormattedMessage {...messages.removeRule} />
                    </Button>
                  )}
                </FieldGroup>
              </div>
            );
          })}
        </Rows>
      )}
      {group.nested.length > 0 ? (
        <Rows spacing="1u">
          <TypographyP size="small" tone="subtle">
            <FormattedMessage {...messages.nestedRulesHint} />
          </TypographyP>
          <TypographyP size="small">{summarizeCriterion({ type: group.type, children: group.nested })}</TypographyP>
        </Rows>
      ) : null}
    </Rows>
  );
}
