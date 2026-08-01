import { useEffect, useState } from "react";

import {
  getAllQuestionsAdmin,
  answerQuestion,
  deleteQuestion,
} from "../../services/adminQuestionService";

function QuestionCard({ item, onSaved }) {
  const [answerText, setAnswerText] = useState(item.answer || "");
  const [saving, setSaving] = useState(false);

  const handleSave = async (isPublished) => {
    setSaving(true);

    const response = await answerQuestion(item._id, {
      answer: answerText,
      isPublished,
    });

    setSaving(false);

    if (response.success) onSaved();
    else alert(response.message);
  };

  const handleDelete = async () => {
    if (!window.confirm("Delete this question?")) return;

    const response = await deleteQuestion(item._id);

    if (response.success) onSaved();
    else alert(response.message);
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-2">
        <div>
          <p className="text-xs text-slate-500">
            {item.product?.name || "Deleted product"}
          </p>
          <h4 className="font-semibold text-slate-800 mt-0.5">
            {item.question}
          </h4>
        </div>

        <span
          className={`text-xs font-semibold px-2.5 py-1 rounded-full shrink-0 ${
            item.isPublished
              ? "bg-green-100 text-green-700"
              : "bg-amber-100 text-amber-700"
          }`}
        >
          {item.isPublished ? "Published" : "Unanswered"}
        </span>
      </div>

      <p className="text-xs text-slate-400 mb-3">
        {item.user?.name} ({item.user?.email}) ·{" "}
        {new Date(item.createdAt).toLocaleDateString("en-IN")}
      </p>

      <textarea
        rows={2}
        value={answerText}
        onChange={(e) => setAnswerText(e.target.value)}
        placeholder="Write an answer..."
        className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
      />

      <div className="flex items-center gap-2">
        <button
          onClick={() => handleSave(true)}
          disabled={saving || !answerText.trim()}
          className="text-xs font-medium px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save & Publish"}
        </button>
        {item.isPublished && (
          <button
            onClick={() => handleSave(false)}
            disabled={saving}
            className="text-xs font-medium px-3 py-1.5 rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50"
          >
            Unpublish
          </button>
        )}
        <button
          onClick={handleDelete}
          className="text-xs font-medium px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white"
        >
          Delete
        </button>
      </div>
    </div>
  );
}

function AdminQuestions() {
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    setLoading(true);

    const response = await getAllQuestionsAdmin();

    if (response.success) setQuestions(response.questions);

    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  if (loading) {
    return <div className="p-8 text-center text-slate-500">Loading...</div>;
  }

  return (
    <div className="p-6">
      <h2 className="text-2xl font-bold text-slate-800 mb-2">
        Questions &amp; Answers
      </h2>
      <p className="text-sm text-slate-500 mb-6">
        Answer a question and publish it to show it on the product page.
      </p>

      {questions.length === 0 ? (
        <div className="text-center text-slate-500 py-12 bg-white rounded-lg border border-slate-200">
          No Questions Yet
        </div>
      ) : (
        <div className="space-y-4">
          {questions.map((item) => (
            <QuestionCard key={item._id} item={item} onSaved={loadData} />
          ))}
        </div>
      )}
    </div>
  );
}

export default AdminQuestions;
