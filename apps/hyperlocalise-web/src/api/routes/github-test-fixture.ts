import { db } from "@/lib/database";

export async function ensureGithubRepositoryTables() {
  await db.$client.query("select 1");
}
