import mongoose from "mongoose";

const stateSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, "State name is required"],
    unique: true,
    trim: true,
  },

  type: {
    type: String,
    enum: ["State", "Union Territory"],
    default: "State",
  },

  displayOrder: {
    type: Number,
    default: 0,
  },
});

const State = mongoose.model("State", stateSchema);

export default State;
