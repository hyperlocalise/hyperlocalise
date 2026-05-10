ALTER TABLE "organization_api_keys" ALTER COLUMN "permissions" SET DEFAULT '["jobs:read", "jobs:write", "files:read", "files:write"]'::jsonb;
