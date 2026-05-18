import { db } from "@/lib/database";

type QueryClient = {
  query<T>(text: string, values?: unknown[]): Promise<{ rows: T[] }>;
};

async function idsForWorkosIds(
  client: QueryClient,
  table: "organizations" | "users",
  column: string,
  values: string[],
) {
  if (values.length === 0) return [];

  const result = await client.query<{ id: string }>(
    `SELECT id FROM ${table} WHERE ${column} = ANY($1::text[]) FOR UPDATE`,
    [values],
  );

  return result.rows.map((row) => row.id);
}

export async function cleanupWorkosTestRecords(input: {
  workosOrganizationIds: Iterable<string>;
  workosUserIds: Iterable<string>;
}) {
  const workosOrganizationIds = [...input.workosOrganizationIds];
  const workosUserIds = [...input.workosUserIds];

  const client = await db.$client.connect();

  try {
    await client.query("BEGIN");

    const organizationIds = await idsForWorkosIds(
      client,
      "organizations",
      "workos_organization_id",
      workosOrganizationIds,
    );
    const userIds = await idsForWorkosIds(client, "users", "workos_user_id", workosUserIds);

    if (organizationIds.length > 0) {
      const orgParams = [organizationIds];
      const githubInstallationIdResult = await client.query<{ github_installation_id: string }>(
        "SELECT github_installation_id FROM github_installations WHERE organization_id = ANY($1::uuid[])",
        orgParams,
      );
      const githubInstallationIds = githubInstallationIdResult.rows.map(
        (row) => row.github_installation_id,
      );

      await client.query(
        "DELETE FROM translation_job_details WHERE job_id IN (SELECT id FROM jobs WHERE organization_id = ANY($1::uuid[]))",
        orgParams,
      );
      await client.query(
        "DELETE FROM review_job_details WHERE job_id IN (SELECT id FROM jobs WHERE organization_id = ANY($1::uuid[]))",
        orgParams,
      );
      await client.query(
        "DELETE FROM sync_job_details WHERE job_id IN (SELECT id FROM jobs WHERE organization_id = ANY($1::uuid[]))",
        orgParams,
      );
      await client.query(
        "DELETE FROM asset_management_job_details WHERE job_id IN (SELECT id FROM jobs WHERE organization_id = ANY($1::uuid[]))",
        orgParams,
      );
      await client.query(
        "DELETE FROM stored_files WHERE organization_id = ANY($1::uuid[])",
        orgParams,
      );
      await client.query("DELETE FROM jobs WHERE organization_id = ANY($1::uuid[])", orgParams);
      await client.query(
        "DELETE FROM interaction_messages WHERE interaction_id IN (SELECT id FROM interactions WHERE organization_id = ANY($1::uuid[]))",
        orgParams,
      );
      await client.query(
        "DELETE FROM inbox_items WHERE organization_id = ANY($1::uuid[])",
        orgParams,
      );
      await client.query(
        "DELETE FROM interactions WHERE organization_id = ANY($1::uuid[])",
        orgParams,
      );
      await client.query(
        "DELETE FROM project_glossaries WHERE organization_id = ANY($1::uuid[])",
        orgParams,
      );
      await client.query(
        "DELETE FROM project_memories WHERE organization_id = ANY($1::uuid[])",
        orgParams,
      );
      await client.query("DELETE FROM projects WHERE organization_id = ANY($1::uuid[])", orgParams);
      await client.query(
        "DELETE FROM glossary_terms WHERE glossary_id IN (SELECT id FROM glossaries WHERE organization_id = ANY($1::uuid[]))",
        orgParams,
      );
      await client.query(
        "DELETE FROM glossaries WHERE organization_id = ANY($1::uuid[])",
        orgParams,
      );
      await client.query(
        "DELETE FROM memory_entries WHERE memory_id IN (SELECT id FROM memories WHERE organization_id = ANY($1::uuid[]))",
        orgParams,
      );
      await client.query("DELETE FROM memories WHERE organization_id = ANY($1::uuid[])", orgParams);
      await client.query(
        "DELETE FROM github_installation_repositories WHERE organization_id = ANY($1::uuid[])",
        orgParams,
      );
      await client.query(
        "DELETE FROM github_installation_states WHERE organization_id = ANY($1::uuid[])",
        orgParams,
      );
      if (githubInstallationIds.length > 0) {
        await client.query(
          "DELETE FROM github_agent_requests WHERE github_installation_id = ANY($1::bigint[])",
          [githubInstallationIds],
        );
      }
      await client.query(
        "DELETE FROM github_installations WHERE organization_id = ANY($1::uuid[])",
        orgParams,
      );
      await client.query(
        "DELETE FROM connectors WHERE organization_id = ANY($1::uuid[])",
        orgParams,
      );
      await client.query(
        "DELETE FROM tms_links WHERE organization_id = ANY($1::uuid[])",
        orgParams,
      );
      await client.query(
        "DELETE FROM team_memberships WHERE team_id IN (SELECT id FROM teams WHERE organization_id = ANY($1::uuid[]))",
        orgParams,
      );
      await client.query("DELETE FROM teams WHERE organization_id = ANY($1::uuid[])", orgParams);
      await client.query(
        "DELETE FROM mcp_sessions WHERE organization_id = ANY($1::uuid[])",
        orgParams,
      );
      await client.query(
        "DELETE FROM organization_api_keys WHERE organization_id = ANY($1::uuid[])",
        orgParams,
      );
      await client.query(
        "DELETE FROM organization_llm_provider_credentials WHERE organization_id = ANY($1::uuid[])",
        orgParams,
      );
      await client.query(
        "DELETE FROM organization_memberships WHERE organization_id = ANY($1::uuid[])",
        orgParams,
      );
      await client.query("DELETE FROM organizations WHERE id = ANY($1::uuid[])", orgParams);
    }

    if (userIds.length > 0) {
      const userParams = [userIds];

      await client.query(
        "DELETE FROM team_memberships WHERE user_id = ANY($1::uuid[])",
        userParams,
      );
      await client.query("DELETE FROM mcp_sessions WHERE user_id = ANY($1::uuid[])", userParams);
      await client.query(
        "DELETE FROM github_installation_states WHERE user_id = ANY($1::uuid[])",
        userParams,
      );
      await client.query(
        "DELETE FROM organization_memberships WHERE user_id = ANY($1::uuid[])",
        userParams,
      );
      await client.query("DELETE FROM users WHERE id = ANY($1::uuid[])", userParams);
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}
