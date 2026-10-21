import { Card, Stack, Text } from "@sanity/ui";

import { WorkflowPanel } from "./workflow-ui";

export function ConfigErrorCard({ message }: { message: string }) {
  return (
    <WorkflowPanel>
      <Card padding={4} tone="critical">
        <Stack gap={3} style={{ textAlign: "center" }}>
          <Text size={2} weight="semibold">
            Hyperlocalise configuration error
          </Text>
          <Text size={1}>{message}</Text>
        </Stack>
      </Card>
    </WorkflowPanel>
  );
}
