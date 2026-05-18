import { db } from "@/lib/database";

export async function ensureGithubRepositoryTables() {
  const client = await db.$client.connect();

  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext('github_repository_test_schema'))");
    await client.query(`
      CREATE TABLE IF NOT EXISTS github_installations (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE cascade,
        github_installation_id bigint NOT NULL,
        github_app_id bigint NOT NULL,
        account_login text,
        account_type text,
        created_at timestamp with time zone DEFAULT now() NOT NULL,
        updated_at timestamp with time zone DEFAULT now() NOT NULL
      );
    `);
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS github_installations_organization_id_key
      ON github_installations (organization_id);
    `);
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS github_installations_github_installation_id_key
      ON github_installations (github_installation_id);
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS github_installation_states (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        nonce text NOT NULL,
        organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE cascade,
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE cascade,
        expires_at timestamp with time zone NOT NULL,
        consumed_at timestamp with time zone,
        created_at timestamp with time zone DEFAULT now() NOT NULL,
        updated_at timestamp with time zone DEFAULT now() NOT NULL
      );
    `);
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS github_installation_states_nonce_key
      ON github_installation_states (nonce);
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS github_installation_repositories (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE cascade,
        github_installation_id bigint NOT NULL REFERENCES github_installations(github_installation_id) ON DELETE cascade,
        github_repository_id bigint NOT NULL,
        owner text NOT NULL,
        name text NOT NULL,
        full_name text NOT NULL,
        private boolean DEFAULT false NOT NULL,
        archived boolean DEFAULT false NOT NULL,
        default_branch text,
        enabled boolean DEFAULT false NOT NULL,
        last_synced_at timestamp with time zone DEFAULT now() NOT NULL,
        created_at timestamp with time zone DEFAULT now() NOT NULL,
        updated_at timestamp with time zone DEFAULT now() NOT NULL
      );
    `);
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS github_installation_repositories_installation_repository_key
      ON github_installation_repositories (github_installation_id, github_repository_id);
    `);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}
