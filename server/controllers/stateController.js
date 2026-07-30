import State from "../models/State.js";

// ============================
// GET ALL STATES
// ============================
export const getStates = async (req, res) => {
  try {
    const states = await State.find().sort({ name: 1 });

    res.status(200).json({
      success: true,
      states,
    });
  } catch (error) {
    console.error("Get States Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};
