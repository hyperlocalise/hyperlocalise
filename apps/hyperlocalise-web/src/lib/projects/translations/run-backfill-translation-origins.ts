/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in this application's LICENSE file.
 *
 * Change Date: Four years after publication of the applicable version.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
/**
 * Labels translations written before `origin` existed. Run once after deploying migration 0177:
 *
 *   vp run translations:backfill-origin [--batch-size 2000]
 */
import { backfillTranslationOrigins } from "./backfill-translation-origins";

const index = process.argv.indexOf("--batch-size");
const batchSize = index === -1 ? undefined : Number(process.argv[index + 1]);
if (batchSize !== undefined && (!Number.isInteger(batchSize) || batchSize < 1)) {
  throw new Error("--batch-size must be a positive integer");
}

const result = await backfillTranslationOrigins({ batchSize });
console.log(JSON.stringify(result));
process.exit(0);
