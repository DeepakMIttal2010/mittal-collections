// Guards for a script run that must not write to the database (the loyalty
// migration's dry run). Three layers, so one mistake can't slip through:
//   1. connect with MIGRATION_CONNECT_OPTIONS — Mongoose then never creates
//      collections or indexes on its own;
//   2. readOnlyGuard — a Mongoose plugin rejecting every write a model can
//      issue, before it is sent. It only covers schemas compiled after
//      mongoose.plugin(readOnlyGuard), so register it before importing any
//      model;
//   3. watchForWrites — records any write-type command the driver actually
//      sends (catches anything that bypasses Mongoose), so the run can fail
//      loudly.
// The hard guarantee is still read-only database credentials.

export const MIGRATION_CONNECT_OPTIONS = { autoIndex: false, autoCreate: false };

export class ReadOnlyViolationError extends Error {
  constructor(operation) {
    super(`Write blocked in read-only mode: ${operation}`);
    this.code = "READ_ONLY_VIOLATION";
  }
}

const QUERY_WRITES = [
  "updateOne",
  "updateMany",
  "findOneAndUpdate",
  "findOneAndDelete",
  "findOneAndReplace",
  "replaceOne",
  "deleteOne",
  "deleteMany",
];

export const readOnlyGuard = (schema) => {
  schema.pre("save", function blockSave() {
    throw new ReadOnlyViolationError(`save ${this.constructor.modelName}`);
  });
  schema.pre(QUERY_WRITES, { query: true, document: false }, function blockQueryWrite() {
    throw new ReadOnlyViolationError(`${this.op} ${this.model?.modelName}`);
  });
  schema.pre("insertMany", function blockInsertMany() {
    throw new ReadOnlyViolationError(`insertMany ${this.modelName}`);
  });
  schema.pre("bulkWrite", function blockBulkWrite() {
    throw new ReadOnlyViolationError(`bulkWrite ${this.modelName}`);
  });
  schema.pre("aggregate", function blockOutStages() {
    const writesOut = this.pipeline().some((stage) => "$out" in stage || "$merge" in stage);
    if (writesOut) throw new ReadOnlyViolationError("aggregate with $out/$merge");
  });
};

const WRITE_COMMANDS = new Set([
  "insert",
  "update",
  "delete",
  "findAndModify",
  "create",
  "createIndexes",
  "drop",
  "dropIndexes",
  "dropDatabase",
  "collMod",
  "renameCollection",
  "commitTransaction",
]);

// Needs a client connected with { monitorCommands: true }. Returns the
// (live) list of write commands seen, e.g. ["insert mydb.loyaltylots"].
export const watchForWrites = (client) => {
  const seen = [];

  client.on("commandStarted", (event) => {
    const command = event.command || {};
    const isOutAggregate =
      event.commandName === "aggregate" &&
      (command.pipeline || []).some((stage) => "$out" in stage || "$merge" in stage);

    if (WRITE_COMMANDS.has(event.commandName) || isOutAggregate) {
      const target = command[event.commandName];
      seen.push(`${event.commandName} ${event.databaseName}${typeof target === "string" ? `.${target}` : ""}`);
    }
  });

  return seen;
};
