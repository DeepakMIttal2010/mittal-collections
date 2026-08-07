import mongoose from "mongoose";

const searchLogSchema = new mongoose.Schema(
  {
    query: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },

    resultCount: {
      type: Number,
      required: true,
      min: 0,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  },
);

searchLogSchema.index({ createdAt: -1 });
searchLogSchema.index({ query: 1 });

const SearchLog = mongoose.model("SearchLog", searchLogSchema);

export default SearchLog;
