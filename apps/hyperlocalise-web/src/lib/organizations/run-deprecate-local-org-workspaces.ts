import "dotenv/config";

import {
  countActiveLocalOrgWorkspaces,
  deprecateLocalOrgWorkspaces,
} from "./deprecate-local-org-workspaces";

const remainingBefore = await countActiveLocalOrgWorkspaces();
const deprecatedCount = await deprecateLocalOrgWorkspaces();
const remainingAfter = await countActiveLocalOrgWorkspaces();

console.log(
  `Deprecated ${deprecatedCount} local_org workspace(s); ${remainingBefore} active before, ${remainingAfter} active after.`,
);
