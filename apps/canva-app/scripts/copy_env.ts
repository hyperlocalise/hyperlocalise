#!/usr/bin/env node
/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file and at https://mariadb.com/bsl11/.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
/* eslint-disable no-console */
import fs from "fs";
import path from "path";

const envPath = path.resolve(__dirname, "..", ".env");
const templatePath = path.resolve(__dirname, "..", ".env.template");

if (!fs.existsSync(templatePath)) {
  console.warn(".env.template file does not exist, skipping copy of .env file");
} else if (!fs.existsSync(envPath)) {
  fs.copyFileSync(templatePath, envPath);
}
