import { Bold, Muted, Text, VerticalSpace } from "@create-figma-plugin/ui";
import type { ComponentChildren } from "preact";

type FormFieldProps = {
  label: string;
  children: ComponentChildren;
  hint?: string;
};

export function FormField({ label, children, hint }: FormFieldProps) {
  return (
    <div>
      <Text>
        <Bold>{label}</Bold>
      </Text>
      <VerticalSpace space="extraSmall" />
      {children}
      {hint ? (
        <div className="formFieldHint">
          <VerticalSpace space="extraSmall" />
          <Text>
            <Muted>{hint}</Muted>
          </Text>
        </div>
      ) : null}
    </div>
  );
}
