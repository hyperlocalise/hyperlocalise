import { Button, type ButtonProps } from "@create-figma-plugin/ui";
import type { ComponentChildren } from "preact";

export type TooltipWrapProps = {
  label?: string;
  fullWidth?: boolean;
  children: ComponentChildren;
};

export function TooltipWrap({ label, fullWidth = false, children }: TooltipWrapProps) {
  const trimmed = label?.trim();
  if (!trimmed) {
    return <>{children}</>;
  }

  const className = fullWidth ? "tooltipWrap tooltipWrapFullWidth" : "tooltipWrap";

  return (
    <span className={className} data-tooltip={trimmed} title={trimmed}>
      {children}
    </span>
  );
}

export type TooltipButtonProps = ButtonProps & {
  tooltipLabel?: string;
};

export function TooltipButton({ tooltipLabel, ...buttonProps }: TooltipButtonProps) {
  const fullWidth = Boolean(buttonProps.fullWidth);
  return (
    <TooltipWrap label={tooltipLabel} fullWidth={fullWidth}>
      <Button {...buttonProps} />
    </TooltipWrap>
  );
}
