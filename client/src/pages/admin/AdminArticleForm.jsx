import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import ReactQuill from "react-quill-new";
import "react-quill-new/dist/quill.snow.css";

import { imgUrl } from "../../services/api";
import {
  addArticle,
  updateArticle,
  getArticleByIdAdmin,
  uploadArticleImage,
} from "../../services/adminArticleService";

function AdminArticleForm() {
  const { id } = useParams();
  const isEditing = Boolean(id);
  const navigate = useNavigate();
  const quillRef = useRef(null);

  const [loading, setLoading] = useState(isEditing);
  const [saving, setSaving] = useState(false);
  const [coverUploading, setCoverUploading] = useState(false);

  const [title, setTitle] = useState("");
  const [excerpt, setExcerpt] = useState("");
  const [content, setContent] = useState("");
  const [coverImage, setCoverImage] = useState("");
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    if (!isEditing) return;

    const load = async () => {
      const response = await getArticleByIdAdmin(id);

      if (response.success) {
        setTitle(response.article.title);
        setExcerpt(response.article.excerpt || "");
        setContent(response.article.content);
        setCoverImage(response.article.coverImage || "");
        setIsActive(response.article.isActive);
      } else {
        alert(response.message || "Unable to load article");
        navigate("/admin/articles");
      }

      setLoading(false);
    };

    load();
  }, [id, isEditing, navigate]);

  const handleCoverUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setCoverUploading(true);
    const response = await uploadArticleImage(file);
    setCoverUploading(false);

    if (response.success) {
      setCoverImage(response.url);
    } else {
      alert(response.message || "Unable to upload cover image");
    }
  };

  const handleContentImageButton = () => {
    const input = document.createElement("input");
    input.setAttribute("type", "file");
    input.setAttribute("accept", "image/*");
    input.click();

    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;

      const editor = quillRef.current?.getEditor();
      const range = editor?.getSelection(true);

      const response = await uploadArticleImage(file);

      if (response.success) {
        editor.insertEmbed(range?.index ?? 0, "image", response.url);
        editor.setSelection((range?.index ?? 0) + 1);
      } else {
        alert(response.message || "Unable to upload image");
      }
    };
  };

  const modules = useMemo(
    () => ({
      toolbar: {
        container: [
          [{ header: [2, 3, false] }],
          ["bold", "italic", "underline"],
          [{ list: "ordered" }, { list: "bullet" }],
          ["link", "image"],
          ["clean"],
        ],
        handlers: {
          image: handleContentImageButton,
        },
      },
    }),
    [],
  );

  const handleSubmit = async (e) => {
    e.preventDefault();

    setSaving(true);

    const payload = { title, excerpt, content, coverImage, isActive };
    const response = isEditing
      ? await updateArticle(id, payload)
      : await addArticle(payload);

    setSaving(false);

    if (response.success) {
      navigate("/admin/articles");
    } else {
      alert(response.message || "Unable to save article");
    }
  };

  if (loading) {
    return <div className="p-6 text-center text-slate-500">Loading...</div>;
  }

  return (
    <div className="p-6">
      <h2 className="text-2xl font-bold text-slate-800 mb-6">
        {isEditing ? "Edit Article" : "Add Article"}
      </h2>

      <form
        onSubmit={handleSubmit}
        className="bg-white border border-slate-200 rounded-xl p-6 max-w-2xl space-y-4"
      >
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Title
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="How to Choose the Right Curtains for Your Home"
            required
            className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Excerpt
          </label>
          <textarea
            rows={2}
            value={excerpt}
            onChange={(e) => setExcerpt(e.target.value)}
            placeholder="A short summary shown on the articles list and used as the meta description."
            className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Cover Image
          </label>
          {coverImage && (
            <img
              src={imgUrl(coverImage)}
              alt="Cover"
              className="w-full max-w-xs h-40 object-cover rounded-lg mb-2 border border-slate-200"
            />
          )}
          <input
            type="file"
            accept="image/*"
            onChange={handleCoverUpload}
            className="text-sm"
          />
          {coverUploading && (
            <p className="text-xs text-slate-500 mt-1">Uploading...</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Content
          </label>
          <ReactQuill
            ref={quillRef}
            theme="snow"
            value={content}
            onChange={setContent}
            modules={modules}
            placeholder="Write the article here."
            className="bg-white [&_.ql-editor]:min-h-[280px]"
          />
        </div>

        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
          />
          Published (visible on the site)
        </label>

        <button
          type="submit"
          disabled={saving}
          className="bg-blue-700 hover:bg-blue-800 text-white font-medium px-5 py-2.5 rounded-lg transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {saving ? "Saving..." : isEditing ? "Update Article" : "Create Article"}
        </button>
      </form>
    </div>
  );
}

export default AdminArticleForm;
