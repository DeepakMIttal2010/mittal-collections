import mongoose from "mongoose";

const pageVisitSchema = new mongoose.Schema(
  {
    path: {
      type: String,
      required: true,
    },

    visitorId: {
      type: String,
      required: true,
      index: true,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  },
);

pageVisitSchema.index({ createdAt: -1 });

const PageVisit = mongoose.model("PageVisit", pageVisitSchema);

export default PageVisit;
