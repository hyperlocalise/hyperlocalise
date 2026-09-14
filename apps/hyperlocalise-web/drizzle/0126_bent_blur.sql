-- Drop legacy spellcheck tables from 0124_premium_cerise (often never applied in production).
-- IF EXISTS keeps this safe when 0124 was skipped; 0127 creates spellcheck_word_* tables.
DROP TABLE IF EXISTS "project_spellcheck_dictionaries" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "spellcheck_dictionary_words" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "spellcheck_dictionaries" CASCADE;
