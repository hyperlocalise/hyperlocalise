import "dotenv/config";

import { backfillAllOrganizationProjectTeams } from "./backfill-project-teams";

await backfillAllOrganizationProjectTeams();
