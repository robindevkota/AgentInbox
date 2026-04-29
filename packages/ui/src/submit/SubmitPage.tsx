import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";

interface ProjectInfo {
  id: string;
  name: string;
  description: string | null;
  requires_otp: boolean;
  brand_color: string | null;
  brand_logo_url: string | null;
}

type Step = "loading" | "otp-email" | "otp-verify" | "form" | "success" | "error";

export function SubmitPage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();

  const [project, setProject] = useState<ProjectInfo | null>(null);
  const [step, setStep] = useState<Step>("loading");
  const [error, setError] = useState("");
  const [taskId, setTaskId] = useState("");
  const [otpEmail, setOtpEmail] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [otpSession, setOtpSession] = useState("");
  const [submitting, setSubmitting] = useState(false);

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
      .then((data: ProjectInfo) => {
        setProject(data);
        setStep(data.requires_otp ? "otp-email" : "form");
      })
      .catch(() => {
        setStep("error");
        setError("This link is invalid or has expired.");
      });
  }, [token]);

  async function requestOtp() {
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch(`/api/submit/${token}/request-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: otpEmail }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setStep("otp-verify");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send code");
    } finally {
      setSubmitting(false);
    }
  }

  async function verifyOtp() {
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch(`/api/submit/${token}/verify-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: otpEmail, otp: otpCode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setOtpSession(data.session);
      setStep("form");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid code");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError("");

    const form = new FormData();
    form.append("title", titleRef.current!.value.trim());
    form.append("description", descRef.current!.value.trim());
    if (nameRef.current!.value) form.append("submitter_name", nameRef.current!.value.trim());
    if (emailRef.current!.value) form.append("submitter_email", emailRef.current!.value.trim());
    if (fileRef.current!.files?.[0]) form.append("file", fileRef.current!.files[0]);

    const headers: Record<string, string> = {};
    if (otpSession) headers["x-otp-session"] = otpSession;

    try {
      const res = await fetch(`/api/submit/${token}`, { method: "POST", body: form, headers });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Submission failed");
      }
      const data = await res.json();
      setTaskId(data.id);
      setStep("success");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Submission failed");
    } finally {
      setSubmitting(false);
    }
  }

  const accentColor = project?.brand_color || "#0284c7";

  if (step === "loading") {
    return <Shell project={null} accentColor={accentColor}><p className="text-slate-400">Loading...</p></Shell>;
  }

  if (step === "error") {
    return (
      <Shell project={null} accentColor={accentColor}>
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
          <p className="text-red-700 font-medium">{error}</p>
        </div>
      </Shell>
    );
  }

  if (step === "otp-email") {
    return (
      <Shell project={project} accentColor={accentColor}>
        <div className="space-y-5">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 mb-1">Verify your email</h2>
            <p className="text-slate-500 text-sm">Enter your work email to receive a one-time access code.</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Work email</label>
            <input
              type="email"
              value={otpEmail}
              onChange={(e) => setOtpEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && requestOtp()}
              className="w-full border border-slate-300 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:border-transparent"
              style={{ "--tw-ring-color": accentColor } as React.CSSProperties}
              placeholder="you@company.com"
            />
          </div>
          {error && <p className="text-red-600 text-sm">{error}</p>}
          <button
            onClick={requestOtp}
            disabled={submitting || !otpEmail}
            className="w-full text-white font-semibold py-3 rounded-lg transition-opacity disabled:opacity-60"
            style={{ backgroundColor: accentColor }}
          >
            {submitting ? "Sending..." : "Send code"}
          </button>
        </div>
      </Shell>
    );
  }

  if (step === "otp-verify") {
    return (
      <Shell project={project} accentColor={accentColor}>
        <div className="space-y-5">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 mb-1">Enter your code</h2>
            <p className="text-slate-500 text-sm">We sent a 6-digit code to <strong>{otpEmail}</strong>.</p>
          </div>
          <div>
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={otpCode}
              onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ""))}
              onKeyDown={(e) => e.key === "Enter" && otpCode.length === 6 && verifyOtp()}
              className="w-full border border-slate-300 rounded-lg px-4 py-3 text-center text-3xl font-bold tracking-widest focus:outline-none focus:ring-2 focus:border-transparent"
              placeholder="······"
            />
          </div>
          {error && <p className="text-red-600 text-sm">{error}</p>}
          <button
            onClick={verifyOtp}
            disabled={submitting || otpCode.length !== 6}
            className="w-full text-white font-semibold py-3 rounded-lg transition-opacity disabled:opacity-60"
            style={{ backgroundColor: accentColor }}
          >
            {submitting ? "Verifying..." : "Continue"}
          </button>
          <button
            onClick={() => { setStep("otp-email"); setError(""); setOtpCode(""); }}
            className="w-full text-slate-500 text-sm hover:underline"
          >
            Use a different email
          </button>
        </div>
      </Shell>
    );
  }

  if (step === "success") {
    return (
      <Shell project={project} accentColor={accentColor}>
        <div className="bg-green-50 border border-green-200 rounded-xl p-8 text-center">
          <div className="text-4xl mb-4">✓</div>
          <h2 className="text-xl font-semibold text-green-800 mb-2">Request received</h2>
          <p className="text-green-700 mb-6">
            We're on it. You'll see live updates as soon as progress is made.
          </p>
          <button
            onClick={() => navigate(`/task/${taskId}`)}
            className="text-white font-medium px-6 py-2.5 rounded-lg transition-colors"
            style={{ backgroundColor: accentColor }}
          >
            Watch live status →
          </button>
        </div>
      </Shell>
    );
  }

  return (
    <Shell project={project} accentColor={accentColor}>
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
            className="w-full border border-slate-300 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:border-transparent"
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
            className="w-full border border-slate-300 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:border-transparent resize-y"
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
            className="w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-slate-100 file:text-slate-700 hover:file:bg-slate-200"
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
              className="w-full border border-slate-300 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Your email</label>
            <input
              ref={emailRef}
              type="email"
              defaultValue={otpEmail || ""}
              placeholder="Optional"
              className="w-full border border-slate-300 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:border-transparent"
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
          disabled={submitting}
          className="w-full text-white font-semibold py-3 rounded-lg transition-opacity disabled:opacity-60"
          style={{ backgroundColor: accentColor }}
        >
          {submitting ? "Submitting..." : "Submit request"}
        </button>
      </form>
    </Shell>
  );
}

function Shell({
  children,
  project,
  accentColor,
}: {
  children: React.ReactNode;
  project: ProjectInfo | null;
  accentColor: string;
}) {
  return (
    <div className="min-h-screen flex items-start justify-center pt-12 px-4 pb-16">
      <div className="w-full max-w-lg">
        <div className="mb-8 flex items-center gap-3">
          {project?.brand_logo_url ? (
            <img src={project.brand_logo_url} alt="logo" className="h-8 w-auto" />
          ) : (
            <div className="font-bold text-lg" style={{ color: accentColor }}>
              {project?.name || "AgentInbox"}
            </div>
          )}
        </div>
        {project && (
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-slate-900">{project.name}</h1>
            {project.description && (
              <p className="text-slate-500 mt-1 text-sm">{project.description}</p>
            )}
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
