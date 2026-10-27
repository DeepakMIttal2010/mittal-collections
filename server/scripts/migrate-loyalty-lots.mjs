// Splits pre-batch loyalty balances into 365-day lots — see
// utils/loyaltyMigration.js for the rule. Dry run by default.
//
//   node scripts/migrate-loyalty-lots.mjs                 # dry run, prints totals
//   node scripts/migrate-loyalty-lots.mjs --out report.json
//   node scripts/migrate-loyalty-lots.mjs --apply --out applied.json
//
// Uses MONGODB_URI from the environment (or server/.env — an environment
// value always wins). Take a backup first. --apply is safe to rerun and to
// run from more than one place at once (see loyaltyMigration.js).
//
// Dry run is read-only (see utils/readOnlyGuard.js): no collection or index
// creation, Mongoose writes blocked before they're sent, and any write
// command the driver still sends makes the run exit with code 2. Run it with
// read-only database credentials for the hard guarantee.

import "dotenv/config";
import fs from "fs";
import mongoose from "mongoose";
import {
  MIGRATION_CONNECT_OPTIONS,
  readOnlyGuard,
  watchForWrites,
} from "../utils/readOnlyGuard.js";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const outIndex = args.indexOf("--out");
const outFile = outIndex >= 0 ? args[outIndex + 1] : null;

if (!process.env.MONGODB_URI) {
  console.error("MONGODB_URI is not set");
  process.exit(1);
}

// Must be registered before any model is compiled, hence the dynamic import.
if (!apply) mongoose.plugin(readOnlyGuard);
const { migrateLegacyBalances } = await import("../utils/loyaltyMigration.js");

await mongoose.connect(process.env.MONGODB_URI, {
  ...MIGRATION_CONNECT_OPTIONS,
  monitorCommands: true,
});
const writesSeen = watchForWrites(mongoose.connection.getClient());

console.log(`Connected to database "${mongoose.connection.name}" — mode: ${apply ? "APPLY" : "dry run"}`);

try {
  const report = await migrateLegacyBalances({ apply });
  report.writeCommandsObserved = apply ? undefined : writesSeen;

  console.log(
    JSON.stringify(
      {
        mode: report.mode,
        settings: report.settings,
        totals: report.totals,
        writeCommandsObserved: report.writeCommandsObserved,
      },
      null,
      2,
    ),
  );

  if (outFile) {
    fs.writeFileSync(outFile, JSON.stringify(report, null, 2));
    console.log(`Per-customer report written to ${outFile}`);
  }

  if (!apply && writesSeen.length > 0) {
    console.error(`DRY RUN SENT WRITE COMMANDS: ${writesSeen.join(", ")}`);
    process.exitCode = 2;
  }
  if (apply && report.totals.usersFailed > 0) process.exitCode = 3;
} finally {
  await mongoose.disconnect();
}
