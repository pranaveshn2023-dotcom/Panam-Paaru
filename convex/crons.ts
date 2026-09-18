import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

/**
 * AMC Nightly Mutual Fund NAV Release Window (9:00 PM to 12:00 AM IST)
 * Runs every 30 minutes, 7 days a week (including weekends).
 * AMCs calculate and publish daily NAVs to AMFI in batches between 21:00 and 00:00 IST.
 * Weekends are included as AMCs finalize Friday/Saturday valuations and debt/liquid funds publish daily.
 *
 * IST to UTC conversion (IST = UTC + 5:30):
 * - 21:00 IST (09:00 PM) = 15:30 UTC
 * - 21:30 IST (09:30 PM) = 16:00 UTC
 * - 22:00 IST (10:00 PM) = 16:30 UTC
 * - 22:30 IST (10:30 PM) = 17:00 UTC
 * - 23:00 IST (11:00 PM) = 17:30 UTC
 * - 23:30 IST (11:30 PM) = 18:00 UTC
 * - 00:00 IST (12:00 AM) = 18:30 UTC
 */

crons.cron(
  "amfi-night-sync-2100-ist",
  "30 15 * * *",
  internal.investments.internalVerifyAndCleanMfCacheJob
);

crons.cron(
  "amfi-night-sync-2130-ist",
  "0 16 * * *",
  internal.investments.internalVerifyAndCleanMfCacheJob
);

crons.cron(
  "amfi-night-sync-2200-ist",
  "30 16 * * *",
  internal.investments.internalVerifyAndCleanMfCacheJob
);

crons.cron(
  "amfi-night-sync-2230-ist",
  "0 17 * * *",
  internal.investments.internalVerifyAndCleanMfCacheJob
);

crons.cron(
  "amfi-night-sync-2300-ist",
  "30 17 * * *",
  internal.investments.internalVerifyAndCleanMfCacheJob
);

crons.cron(
  "amfi-night-sync-2330-ist",
  "0 18 * * *",
  internal.investments.internalVerifyAndCleanMfCacheJob
);

crons.cron(
  "amfi-night-sync-0000-ist",
  "30 18 * * *",
  internal.investments.internalVerifyAndCleanMfCacheJob
);

export default crons;
