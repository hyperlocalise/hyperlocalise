CREATE INDEX "idx_organization_api_keys_org_owner" ON "organization_api_keys" USING btree ("organization_id","created_by_user_id");
