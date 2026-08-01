import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FaQuestionCircle } from "react-icons/fa";

import { useAuth } from "../context/AuthContext";
import {
  getProductQuestions,
  submitQuestion,
} from "../services/questionService";

function ProductQuestions({ productId }) {
  const { isLoggedIn } = useAuth();

  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [questionText, setQuestionText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formMessage, setFormMessage] = useState("");

  const loadQuestions = async () => {
    setLoading(true);

    const response = await getProductQuestions(productId);

    if (response.success) setQuestions(response.questions);

    setLoading(false);
  };

  useEffect(() => {
    loadQuestions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId]);

  const handleSubmit = async (e) => {
    e.preventDefault();

    setSubmitting(true);
    setFormMessage("");

    const response = await submitQuestion({
      productId,
      question: questionText,
    });

    setSubmitting(false);

    if (response.success) {
      setFormMessage(response.message);
      setQuestionText("");
      setShowForm(false);
    } else {
      setFormMessage(response.message || "Unable to submit question");
    }
  };

  if (loading) return null;

  return (
    <div className="mt-12 border-t border-slate-200 pt-10">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h2 className="text-2xl font-bold text-slate-900">
          Questions &amp; Answers
        </h2>

        {isLoggedIn ? (
          <button
            type="button"
            onClick={() => setShowForm((v) => !v)}
            className="border border-blue-900 text-blue-900 hover:bg-blue-50 font-medium px-5 py-2.5 rounded-full transition-colors"
          >
            Ask a Question
          </button>
        ) : (
          <Link
            to={`/login?redirect=/product/${productId}`}
            className="border border-blue-900 text-blue-900 hover:bg-blue-50 font-medium px-5 py-2.5 rounded-full transition-colors"
          >
            Login to Ask
          </Link>
        )}
      </div>

      {formMessage && (
        <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-4 py-3 mb-6">
          {formMessage}
        </p>
      )}

      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="border border-slate-200 rounded-xl p-5 mb-8 bg-white max-w-xl"
        >
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Your Question
          </label>
          <textarea
            required
            rows={3}
            value={questionText}
            onChange={(e) => setQuestionText(e.target.value)}
            placeholder="e.g. What fabric is this made of?"
            className="w-full border border-slate-300 rounded-lg px-3 py-2 mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />

          <button
            type="submit"
            disabled={submitting}
            className="bg-blue-900 hover:bg-blue-950 text-white font-medium px-5 py-2.5 rounded-full transition-colors disabled:opacity-60"
          >
            {submitting ? "Submitting..." : "Submit Question"}
          </button>
        </form>
      )}

      {questions.length === 0 ? (
        <p className="text-slate-500">
          No questions yet. Ask us anything about this product!
        </p>
      ) : (
        <div className="space-y-5">
          {questions.map((q) => (
            <div
              key={q._id}
              className="border-b border-slate-100 pb-5 last:border-b-0"
            >
              <p className="flex items-start gap-2 font-semibold text-slate-800 mb-1.5">
                <FaQuestionCircle className="text-blue-900 mt-0.5 shrink-0" />
                {q.question}
              </p>
              <p className="text-sm text-slate-600 pl-6">{q.answer}</p>
              <p className="text-xs text-slate-400 pl-6 mt-1">
                {q.user?.name || "Anonymous"} ·{" "}
                {new Date(q.createdAt).toLocaleDateString("en-IN", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default ProductQuestions;
