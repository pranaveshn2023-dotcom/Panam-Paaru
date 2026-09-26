import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

/**
 * 6x Daily Indian Mutual Fund Sync (mfapi.in Schedule)
 * Triggered exactly 5 minutes after mfapi's 6 daily publishing updates:
 * 1. 10:05 AM IST + 5m = 10:10 AM IST (04:40 UTC) -> "40 4 * * *"
 * 2. 02:05 PM IST + 5m = 02:10 PM IST (08:40 UTC) -> "40 8 * * *"
 * 3. 06:05 PM IST + 5m = 06:10 PM IST (12:40 UTC) -> "40 12 * * *"
 * 4. 09:05 PM IST + 5m = 09:10 PM IST (15:40 UTC) -> "40 15 * * *"
 * 5. 03:09 AM IST + 5m = 03:14 AM IST (21:44 UTC) -> "44 21 * * *"
 * 6. 05:05 AM IST + 5m = 05:10 AM IST (23:40 UTC) -> "40 23 * * *"
 */
crons.cron(
  "mfapi-sync-1010-ist",
  "40 4 * * *",
  internal.investments.internalSyncMfApi6xDailyJob
);

crons.cron(
  "mfapi-sync-1410-ist",
  "40 8 * * *",
  internal.investments.internalSyncMfApi6xDailyJob
);

crons.cron(
  "mfapi-sync-1810-ist",
  "40 12 * * *",
  internal.investments.internalSyncMfApi6xDailyJob
);

crons.cron(
  "mfapi-sync-2110-ist",
  "40 15 * * *",
  internal.investments.internalSyncMfApi6xDailyJob
);

crons.cron(
  "mfapi-sync-0314-ist",
  "44 21 * * *",
  internal.investments.internalSyncMfApi6xDailyJob
);

crons.cron(
  "mfapi-sync-0510-ist",
  "40 23 * * *",
  internal.investments.internalSyncMfApi6xDailyJob
);

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

/**
 * Mid-Day Mutual Fund NAV Release Window (12:00 PM to 12:30 PM IST)
 * Runs on trading weekdays (Monday through Friday, 1-5).
 * - 12:00 PM IST (06:30 UTC): Stage 1 - Fetches latest AMFI NAVs. If no change detected vs DB, terminates 12:15 & 12:30 PM crons and proceeds straight to night job.
 * - 12:15 PM IST (06:45 UTC): Stage 2 - Verifies if fetched AMFI NAV matches DB. If matched, terminates 12:30 PM cron and moves to night job.
 * - 12:30 PM IST (07:00 UTC): Stage 3 - Final midday sync (only runs if 12:15 PM detected further movement).
 * Automatically skips on weekends and public market holidays.
 */
crons.cron(
  "amfi-midday-sync-1200-ist",
  "30 6 * * 1-5",
  internal.investments.internalSyncMfMidday1200Job
);

crons.cron(
  "amfi-midday-sync-1215-ist",
  "45 6 * * 1-5",
  internal.investments.internalSyncMfMidday1215Job
);

crons.cron(
  "amfi-midday-sync-1230-ist",
  "0 7 * * 1-5",
  internal.investments.internalSyncMfMidday1230Job
);

export default crons;

