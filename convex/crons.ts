import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// 1. Hourly verification during the critical AMC nightly NAV release window (9:00 PM to 12:00 AM IST Mon-Fri)
// AMCs publish updated daily NAVs in batches during this window.
// 21:30 IST = 16:00 UTC, 22:30 IST = 17:00 UTC, 23:30 IST = 18:00 UTC, 00:30 IST = 19:00 UTC
crons.cron(
  "amfi-night-sync-2130-ist",
  "0 16 * * 1-5",
  internal.investments.internalVerifyAndCleanMfCacheJob
);
crons.cron(
  "amfi-night-sync-2230-ist",
  "0 17 * * 1-5",
  internal.investments.internalVerifyAndCleanMfCacheJob
);
crons.cron(
  "amfi-night-sync-2330-ist",
  "0 18 * * 1-5",
  internal.investments.internalVerifyAndCleanMfCacheJob
);
crons.cron(
  "amfi-night-sync-0030-ist",
  "0 19 * * 1-5",
  internal.investments.internalVerifyAndCleanMfCacheJob
);

// 2. Regular background AMFI Cache verification and daily maintenance
// Runs every 6 hours during non-peak times to verify against AMFI and purge records older than 30 days.
crons.interval(
  "regular-amfi-cache-verification",
  { hours: 6 },
  internal.investments.internalVerifyAndCleanMfCacheJob
);

export default crons;
