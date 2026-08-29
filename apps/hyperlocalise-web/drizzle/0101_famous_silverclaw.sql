CREATE INDEX "idx_organization_api_keys_org_owner" ON "organization_api_keys" USING btree ("organization_id","created_by_user_id");--> statement-breakpoint
-- A key with no owner cannot authenticate, because the request middleware
-- resolves the owner's live membership on every call. Record that state so the
-- management API stops listing such keys as active.
UPDATE "organization_api_keys" SET "revoked_at" = now() WHERE "created_by_user_id" IS NULL AND "revoked_at" IS NULL;
