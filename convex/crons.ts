import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

/**
 * AMC Nightly Mutual Fund NAV Release Window (9:00 PM to 12:00 AM IST)
 * Runs at 1-hour intervals on regular trading weekdays (Monday through Friday, 1-5).
 * AMCs calculate and publish daily NAVs to AMFI in batches between 21:00 and 00:00 IST.
 *
 * Weekends (Saturday & Sunday) and official NSE/BSE public holidays have NO NAV releases;
 * crons do not run on weekends and the action immediately skips on market holidays.
 *
 * IST to UTC conversion (IST = UTC + 5:30):
 * - 21:00 IST (09:00 PM) = 15:30 UTC
 * - 22:00 IST (10:00 PM) = 16:30 UTC
 * - 23:00 IST (11:00 PM) = 17:30 UTC
 * - 00:00 IST (12:00 AM) = 18:30 UTC
 */

crons.cron(
  "amfi-night-sync-2100-ist",
  "30 15 * * 1-5",
  internal.investments.internalVerifyAndCleanMfCacheJob
);

crons.cron(
  "amfi-night-sync-2200-ist",
  "30 16 * * 1-5",
  internal.investments.internalVerifyAndCleanMfCacheJob
);

crons.cron(
  "amfi-night-sync-2300-ist",
  "30 17 * * 1-5",
  internal.investments.internalVerifyAndCleanMfCacheJob
);

crons.cron(
  "amfi-night-sync-0000-ist",
  "30 18 * * 1-5",
  internal.investments.internalVerifyAndCleanMfCacheJob
);

/**
 * Market Ending Stock & Index Sync Schedule (Mon-Fri):
 * - 3:15 PM IST (15:15 IST = 09:45 UTC): Stage 1 - Initial capture, properly updates cache DB.
 * - 3:25 PM IST (15:25 IST = 09:55 UTC): Stage 2 - Verifies cache DB matches live API. If so, skips 3:30 PM run.
 * - 3:30 PM IST (15:30 IST = 10:00 UTC): Stage 3 - Final close sync (only runs if 3:25 PM detected price movement).
 * Automatically skips on weekends and public market holidays.
 */
crons.cron(
  "stock-market-ending-sync-1515-ist",
  "45 9 * * 1-5",
  internal.investments.internalSyncMarketClose315Job
);

crons.cron(
  "stock-market-ending-sync-1525-ist",
  "55 9 * * 1-5",
  internal.investments.internalSyncMarketClose325Job
);

crons.cron(
  "stock-market-close-sync-1530-ist",
  "0 10 * * 1-5",
  internal.investments.internalSyncMarketClose330Job
);

export default crons;

