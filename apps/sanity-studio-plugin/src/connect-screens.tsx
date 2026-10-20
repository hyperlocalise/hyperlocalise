import { Box, Button, Card, Flex, Select, Stack, Text } from "@sanity/ui";

import type { SanitySessionProject } from "./hyperlocalise-client";
import { HyperlocaliseIcon } from "./hyperlocalise-icon";

export function ConnectScreen({
  error,
  busy,
  onConnect,
}: {
  error: string | null;
  busy: boolean;
  onConnect: () => void;
}) {
  return (
    <Box padding={4} style={{ width: 420, maxWidth: "100%" }}>
      <Stack gap={4}>
        <Flex align="center" gap={2}>
          <HyperlocaliseIcon width={18} height={18} />
          <Text size={2} weight="semibold">
            Connect Hyperlocalise
          </Text>
        </Flex>
        <Text muted size={1}>
          Sign in with OAuth to link this Studio to your workspace. Your org admin must create a
          Studio plugin connection under Integrations first.
        </Text>
        {error ? (
          <Card padding={3} tone="critical">
            <Text size={1}>{error}</Text>
          </Card>
        ) : null}
        <Button
          text="Connect Hyperlocalise"
          tone="primary"
          disabled={busy}
          loading={busy}
          onClick={onConnect}
        />
      </Stack>
    </Box>
  );
}

export function ProjectScreen({
  projectId,
  projects,
  onSelect,
}: {
  projectId: string;
  projects: SanitySessionProject[];
  onSelect: (projectId: string) => void;
}) {
  return (
    <Box padding={4} style={{ width: 420, maxWidth: "100%" }}>
      <Stack gap={4}>
        <Flex align="center" gap={2}>
          <HyperlocaliseIcon width={18} height={18} />
          <Text size={2} weight="semibold">
            Choose project
          </Text>
        </Flex>
        <Select
          value={projectId}
          onChange={(event) => {
            onSelect(event.currentTarget.value);
          }}
        >
          <option value="">Select a Hyperlocalise project</option>
          {projects.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.name}
            </option>
          ))}
        </Select>
      </Stack>
    </Box>
  );
}
