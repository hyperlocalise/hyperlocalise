import "dotenv/config";

import { auditProviderWebhookSubscriptions } from "./provider-webhook-subscription-manager";

const organizationId = process.env.ORGANIZATION_ID;

const results = await auditProviderWebhookSubscriptions(organizationId ? { organizationId } : {});

const summary = results.reduce(
  (counts, result) => {
    counts[result.action] += 1;
    return counts;
  },
  {
    unchanged: 0,
    reconciled: 0,
    disabled: 0,
    marked_stale: 0,
  },
);

console.log(
  JSON.stringify({
    audited: results.length,
    summary,
  }),
);
