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
 * Most QA findings one request may file as Linear issues, so a slip of "select all" cannot flood
 * a Linear team. Kept apart from the service so browser code can import it.
 */
export const LINEAR_QA_FINDING_ISSUES_MAX = 25;
