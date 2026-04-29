import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";

interface ProjectInfo {
  id: string;
  name: string;
  description: string | null;
}

type SubmitState = "idle" | "loading" | "submitting" | "success" | "error";

export function SubmitPage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();

  const [project, setProject] = useState<ProjectInfo | null>(null);
  const [state, setState] = useState<SubmitState>("loading");
  const [error, setError] = useState("");
  const [taskId, setTaskId] = useState("");

  const titleRef = useRef<HTMLInputElement>(null);
  const descRef = useRef<HTMLTextAreaElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch(`/api/submit/${token}`)
      .then((r) => {
        if (!r.ok) throw new Error("Project not found");
        return r.json();
      })
      .then((data) => {
        setProject(data);
        setState("idle");
      })
      .catch(() => {
        setState("error");
        setError("This link is invalid or has expired.");
      });
  }, [token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setState("submitting");
    setError("");

    const form = new FormData();
    form.append("title", titleRef.current!.value.trim());
    form.append("description", descRef.current!.value.trim());
    if (nameRef.current!.value) form.append("submitter_name", nameRef.current!.value.trim());
    if (emailRef.current!.value) form.append("submitter_email", emailRef.current!.value.trim());
    if (fileRef.current!.files?.[0]) form.append("file", fileRef.current!.files[0]);

    try {
      const res = await fetch(`/api/submit/${token}`, { method: "POST", body: form });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Submission failed");
      }
      const data = await res.json();
      setTaskId(data.id);
      setState("success");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Submission failed");
      setState("idle");
    }
  }

  if (state === "loading") {
    return <PageShell><p className="text-slate-400">Loading...</p></PageShell>;
  }

  if (state === "error" && !project) {
    return (
      <PageShell>
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
          <p className="text-red-700 font-medium">{error}</p>
        </div>
      </PageShell>
    );
  }

  if (state === "success") {
    return (
      <PageShell project={project}>
        <div className="bg-green-50 border border-green-200 rounded-xl p-8 text-center">
          <div className="text-4xl mb-4">✓</div>
          <h2 className="text-xl font-semibold text-green-800 mb-2">Request received</h2>
          <p className="text-green-700 mb-6">
            We're working on it. You'll see updates below as soon as progress is made.
          </p>
          <button
            onClick={() => navigate(`/task/${taskId}`)}
            className="bg-green-600 hover:bg-green-700 text-white font-medium px-6 py-2.5 rounded-lg transition-colors"
          >
            Watch live status →
          </button>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell project={project}>
      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            What's the issue or request? <span className="text-red-500">*</span>
          </label>
          <input
            ref={titleRef}
            type="text"
            required
            maxLength={200}
            placeholder="e.g. Login button broken on mobile"
            className="w-full border border-slate-300 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Describe it in detail <span className="text-red-500">*</span>
          </label>
          <textarea
            ref={descRef}
            required
            rows={5}
            maxLength={5000}
            placeholder="What happened? What did you expect? Steps to reproduce if it's a bug..."
            className="w-full border border-slate-300 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent resize-y"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Attach a file <span className="text-slate-400 font-normal">(optional)</span>
          </label>
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,.docx,.txt,.md,.csv,.json,.png,.jpg,.jpeg,.gif,.webp"
            className="w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-brand-50 file:text-brand-700 hover:file:bg-brand-100"
          />
          <p className="text-xs text-slate-400 mt-1">PDF, Word, images, text — up to 20MB</p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Your name</label>
            <input
              ref={nameRef}
              type="text"
              maxLength={100}
              placeholder="Optional"
              className="w-full border border-slate-300 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Your email</label>
            <input
              ref={emailRef}
              type="email"
              placeholder="Optional"
              className="w-full border border-slate-300 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
            />
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-red-700 text-sm">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={state === "submitting"}
          className="w-full bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white font-semibold py-3 rounded-lg transition-colors"
        >
          {state === "submitting" ? "Submitting..." : "Submit request"}
        </button>
      </form>
    </PageShell>
  );
}

function PageShell({
  children,
  project,
}: {
  children: React.ReactNode;
  project?: ProjectInfo | null;
}) {
  return (
    <div className="min-h-screen flex items-start justify-center pt-16 px-4 pb-16">
      <div className="w-full max-w-lg">
        <div className="mb-8">
          <div className="text-brand-600 font-bold text-lg mb-1">AgentInbox</div>
          {project && (
            <>
              <h1 className="text-2xl font-bold text-slate-900">{project.name}</h1>
              {project.description && (
                <p className="text-slate-500 mt-1">{project.description}</p>
              )}
            </>
          )}
        </div>
        {children}
      </div>
    </div>
  );
}
