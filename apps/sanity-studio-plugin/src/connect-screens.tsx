import { Button, Card, Flex, Select, Stack, Text } from "@sanity/ui";

import type { SanitySessionProject } from "./hyperlocalise-client";
import { WorkflowHeader, WorkflowPanel } from "./workflow-ui";

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
    <WorkflowPanel>
      <WorkflowHeader title="Connect Hyperlocalise" />
      <Text muted size={1} style={{ textAlign: "center" }}>
        Sign in with OAuth to link this Studio to your Hyperlocalise workspace.
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
    </WorkflowPanel>
  );
}

export function ProjectScreen({
  projectId,
  projects,
  onSelect,
  showCancel,
  onCancel,
  onSwitchAccount,
  disabled = false,
}: {
  projectId: string;
  projects: SanitySessionProject[];
  onSelect: (projectId: string) => void;
  showCancel?: boolean;
  onCancel?: () => void;
  onSwitchAccount?: () => void;
  disabled?: boolean;
}) {
  return (
    <WorkflowPanel>
      <WorkflowHeader title="Choose project" />
      <Stack gap={3}>
        <Select
          value={projectId}
          disabled={disabled}
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
        {showCancel || onSwitchAccount ? (
          <Flex align="center" gap={1} wrap="wrap" justify="center">
            {showCancel && onCancel ? (
              <>
                <Button
                  mode="bleed"
                  padding={2}
                  fontSize={1}
                  text="Cancel"
                  disabled={disabled}
                  onClick={onCancel}
                />
                {onSwitchAccount ? (
                  <Text muted size={1}>
                    ·
                  </Text>
                ) : null}
              </>
            ) : null}
            {onSwitchAccount ? (
              <Button
                mode="bleed"
                padding={2}
                fontSize={1}
                text="Switch Account"
                disabled={disabled}
                onClick={onSwitchAccount}
              />
            ) : null}
          </Flex>
        ) : null}
      </Stack>
    </WorkflowPanel>
  );
}
