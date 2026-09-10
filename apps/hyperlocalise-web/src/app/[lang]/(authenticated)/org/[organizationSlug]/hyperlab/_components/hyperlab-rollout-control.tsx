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
import type { ReactNode } from "react";
import { FormattedMessage } from "react-intl";

import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Row } from "@/components/ui/layout/row";

import { hyperlabMessages as messages } from "./hyperlab.messages";
import { percentToRollout, rolloutToPercent } from "./hyperlab-schedule";

export function HyperlabRolloutControl({
  id,
  value,
  onChange,
  disabled,
  label,
}: {
  id: string;
  value: number;
  onChange: (next: number) => void;
  disabled?: boolean;
  label?: ReactNode;
}) {
  const percent = rolloutToPercent(value);
  return (
    <Field>
      <FieldLabel htmlFor={id}>
        {label ?? <FormattedMessage {...messages.rolloutLabel} />}
      </FieldLabel>
      <Row spacing="1.5u" alignY="center">
        <input
          id={id}
          type="range"
          min={0}
          max={10000}
          step={100}
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(Number(event.target.value))}
          className="h-2 w-full flex-1 cursor-pointer appearance-none rounded-full bg-muted accent-primary disabled:cursor-not-allowed"
        />
        <Input
          type="number"
          min={0}
          max={100}
          step={1}
          value={percent}
          disabled={disabled}
          onChange={(event) => onChange(percentToRollout(Number(event.target.value)))}
          className="w-20"
          inputMode="decimal"
          aria-label={id}
        />
        <span className="text-sm text-muted-foreground">%</span>
      </Row>
    </Field>
  );
}
