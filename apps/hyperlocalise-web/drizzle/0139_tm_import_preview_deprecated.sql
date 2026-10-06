UPDATE "memory_import_attempts"
SET
    "status" = 'failed',
    "failure_code" = 'memory_import_preview_deprecated',
    "failure_message" = 'This import used a removed preview step. Upload the file again.',
    "completed_at" = COALESCE("completed_at", now())
WHERE "status" = 'preview_completed';--> statement-breakpoint
UPDATE "memory_import_attempts"
SET "mode" = 'apply'
WHERE "operation" = 'import' AND "mode" = 'preview';
