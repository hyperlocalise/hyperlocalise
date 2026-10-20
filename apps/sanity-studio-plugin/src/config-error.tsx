import { Card, Stack, Text } from "@sanity/ui";

export function ConfigErrorCard({ message }: { message: string }) {
  return (
    <Card padding={4} tone="critical">
      <Stack gap={3}>
        <Text size={2} weight="semibold">
          Hyperlocalise configuration error
        </Text>
        <Text size={1}>{message}</Text>
      </Stack>
    </Card>
  );
}
