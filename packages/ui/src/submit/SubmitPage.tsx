import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";

interface CustomField {
  name: string;
  type: "dropdown" | "text";
  options?: string[];
  required?: boolean;
}

interface ProjectInfo {
  id: string;
  name: string;
  description: string | null;
  requires_otp: boolean;
  brand_color: string | null;
  brand_logo_url: string | null;
  brand_name: string | null;
  custom_fields: CustomField[];
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
  const [customFieldValues, setCustomFieldValues] = useState<Record<string, string>>({});
  const [taskType, setTaskType] = useState<"bug" | "feature" | "other">("bug");
  const [priority, setPriority] = useState<"low" | "medium" | "high">("medium");
  const [dragActive, setDragActive] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [requireScreenshot, setRequireScreenshot] = useState(false);

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
    const typePrefix = `[${taskType.toUpperCase()}] `;
    form.append("description", typePrefix + descRef.current!.value.trim());
    form.append("priority", priority);
    if (nameRef.current!.value) form.append("submitter_name", nameRef.current!.value.trim());
    if (emailRef.current!.value) form.append("submitter_email", emailRef.current!.value.trim());
    if (fileRef.current?.files?.[0]) form.append("file", fileRef.current.files[0]);
    if (Object.keys(customFieldValues).length > 0) {
      form.append("custom_field_values", JSON.stringify(customFieldValues));
    }
    if (requireScreenshot) form.append("require_verification", "true");

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

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    setDragActive(true);
  }
  function handleDragLeave() {
    setDragActive(false);
  }
  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file && fileRef.current) {
      const dt = new DataTransfer();
      dt.items.add(file);
      fileRef.current.files = dt.files;
      setFileName(file.name);
    }
  }

  const accentColor = project?.brand_color || "#6366f1";

  if (step === "loading") {
    return (
      <Shell project={null} accentColor={accentColor}>
        <p className="text-slate-400">Loading...</p>
      </Shell>
    );
  }

  if (step === "error") {
    return (
      <Shell project={null} accentColor={accentColor}>
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-6 text-center">
          <p className="text-red-400 font-medium">{error}</p>
        </div>
      </Shell>
    );
  }

  if (step === "otp-email") {
    return (
      <Shell project={project} accentColor={accentColor}>
        <div className="space-y-5">
          <div>
            <h2 className="text-lg font-semibold text-white mb-1">Verify your email</h2>
            <p className="text-slate-400 text-sm">Enter your work email to receive a one-time access code.</p>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-widest mb-1.5">Work email</label>
            <input
              type="email"
              value={otpEmail}
              onChange={(e) => setOtpEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && requestOtp()}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-shadow"
              placeholder="you@company.com"
            />
          </div>
          {error && <p className="text-red-600 text-sm">{error}</p>}
          <button
            onClick={requestOtp}
            disabled={submitting || !otpEmail}
            className="w-full bg-indigo-500 hover:bg-indigo-600 disabled:opacity-60 text-white font-semibold py-3.5 rounded-xl transition-colors"
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
            <h2 className="text-lg font-semibold text-white mb-1">Enter your code</h2>
            <p className="text-slate-400 text-sm">We sent a 6-digit code to <strong>{otpEmail}</strong>.</p>
          </div>
          <div>
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={otpCode}
              onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ""))}
              onKeyDown={(e) => e.key === "Enter" && otpCode.length === 6 && verifyOtp()}
              className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-center text-3xl font-bold tracking-widest text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-shadow"
              placeholder="······"
            />
          </div>
          {error && <p className="text-red-600 text-sm">{error}</p>}
          <button
            onClick={verifyOtp}
            disabled={submitting || otpCode.length !== 6}
            className="w-full bg-indigo-500 hover:bg-indigo-600 disabled:opacity-60 text-white font-semibold py-3.5 rounded-xl transition-colors"
          >
            {submitting ? "Verifying..." : "Continue"}
          </button>
          <button
            onClick={() => { setStep("otp-email"); setError(""); setOtpCode(""); }}
            className="w-full text-slate-400 text-sm hover:text-slate-700 transition-colors"
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
        <div className="py-8 text-center">
          {/* Animated checkmark */}
          <div className="flex items-center justify-center mb-6">
            <div className="w-20 h-20 rounded-full bg-green-500/20 border border-green-500/30 flex items-center justify-center">
              <svg
                className="w-10 h-10 text-green-400 checkmark-draw"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <style>{`
                  .checkmark-draw {
                    stroke-dasharray: 30;
                    stroke-dashoffset: 30;
                    animation: draw 0.45s ease forwards 0.1s;
                  }
                  @keyframes draw {
                    to { stroke-dashoffset: 0; }
                  }
                `}</style>
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">Request received</h2>
          <p className="text-slate-500 mb-8 max-w-sm mx-auto">
            We're on it. You'll see live updates as soon as progress is made.
          </p>
          <button
            onClick={() => navigate(`/task/${taskId}`)}
            className="inline-flex items-center gap-2 bg-indigo-500 hover:bg-indigo-600 text-white font-semibold px-7 py-3.5 rounded-xl transition-colors"
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
          <label className="block text-xs font-semibold text-slate-500 uppercase tracking-widest mb-1.5">
            What's the issue or request? <span className="text-red-500">*</span>
          </label>
          <input
            ref={titleRef}
            type="text"
            required
            maxLength={200}
            placeholder="e.g. Login button broken on mobile"
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-shadow shadow-sm"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-500 uppercase tracking-widest mb-1.5">
            Describe it in detail <span className="text-red-500">*</span>
          </label>
          <textarea
            ref={descRef}
            required
            rows={5}
            maxLength={5000}
            placeholder="Bug: what happened, what you expected, steps to reproduce. Feature: what to build, attach a spec doc or screenshot for details."
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-shadow shadow-sm resize-y"
          />
        </div>

        {/* Task type */}
        <div>
          <label className="block text-xs font-semibold text-slate-500 uppercase tracking-widest mb-1.5">Type</label>
          <div className="flex gap-2">
            {([
              { value: "bug",     label: "🐛 Bug",     desc: "Something is broken" },
              { value: "feature", label: "✨ Feature",  desc: "New functionality" },
              { value: "other",   label: "💬 Other",   desc: "Question or request" },
            ] as const).map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => setTaskType(t.value)}
                className={`flex-1 py-2.5 px-3 rounded-xl text-sm font-medium border transition-colors text-left ${
                  taskType === t.value
                    ? "bg-indigo-500/20 border-indigo-500/50 text-indigo-300"
                    : "bg-white/5 border-white/10 text-slate-500 hover:border-white/20 hover:text-slate-400"
                }`}
              >
                <div>{t.label}</div>
                <div className="text-xs font-normal opacity-60 mt-0.5">{t.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Priority */}
        <div>
          <label className="block text-xs font-semibold text-slate-500 uppercase tracking-widest mb-1.5">Priority</label>
          <div className="flex gap-2">
            {(["low", "medium", "high"] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPriority(p)}
                className={`flex-1 py-2.5 rounded-xl text-sm font-medium border transition-colors capitalize ${
                  priority === p
                    ? p === "high" ? "bg-red-500/20 border-red-500/50 text-red-300"
                    : p === "low" ? "bg-white/10 border-white/20 text-slate-300"
                    : "bg-indigo-500/20 border-indigo-500/50 text-indigo-300"
                    : "bg-white/5 border-white/10 text-slate-500 hover:border-white/20 hover:text-slate-400"
                }`}
              >{p}</button>
            ))}
          </div>
        </div>

        {/* File upload */}
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-1.5">
            Attach a file <span className="text-slate-400 font-normal normal-case">(optional)</span>
          </p>
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-xl px-4 py-6 text-center transition-colors ${
              dragActive ? "border-indigo-500/50 bg-indigo-500/10" : "border-white/10 bg-white/5"
            }`}
          >
            {fileName ? (
              <div className="flex items-center justify-center gap-2 text-sm text-indigo-300 font-medium">
                <span>📎</span>
                <span className="truncate max-w-xs">{fileName}</span>
                <button
                  type="button"
                  onClick={() => { setFileName(null); if (fileRef.current) fileRef.current.value = ""; }}
                  className="text-slate-500 hover:text-red-400 ml-1 font-bold"
                >×</button>
              </div>
            ) : (
              <div>
                <p className="text-sm text-slate-500 mb-3">Drag and drop, or browse</p>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".pdf,.docx,.txt,.md,.csv,.json,.png,.jpg,.jpeg,.gif,.webp"
                  onChange={(e) => setFileName(e.target.files?.[0]?.name || null)}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="text-xs font-medium bg-indigo-500/20 text-indigo-300 hover:bg-indigo-500/30 px-4 py-1.5 rounded-lg transition-colors cursor-pointer"
                >
                  Choose File
                </button>
                <p className="text-xs text-slate-600 mt-2">PDF, Word, images, text — up to 20MB</p>
              </div>
            )}
          </div>
        </div>

        {project?.custom_fields && project.custom_fields.length > 0 && project.custom_fields.map((field) => (
          <div key={field.name}>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-widest mb-1.5">
              {field.name} {field.required && <span className="text-red-500">*</span>}
            </label>
            {field.type === "dropdown" && field.options && field.options.length > 0 ? (
              <select
                required={field.required}
                value={customFieldValues[field.name] || ""}
                onChange={(e) => setCustomFieldValues((prev) => ({ ...prev, [field.name]: e.target.value }))}
                className="w-full bg-[#1a1d2e] border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all appearance-none"
                style={{ colorScheme: "dark" }}
              >
                <option value="" className="bg-[#1a1d2e]">Select {field.name}...</option>
                {field.options.map((opt) => (
                  <option key={opt} value={opt} className="bg-[#1a1d2e]">{opt}</option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                required={field.required}
                value={customFieldValues[field.name] || ""}
                onChange={(e) => setCustomFieldValues((prev) => ({ ...prev, [field.name]: e.target.value }))}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent shadow-sm transition-shadow"
                placeholder={`Enter ${field.name}`}
              />
            )}
          </div>
        ))}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-widest mb-1.5">Your name</label>
            <input
              ref={nameRef}
              type="text"
              maxLength={100}
              placeholder="Optional"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent shadow-sm transition-shadow"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-widest mb-1.5">Your email</label>
            <input
              ref={emailRef}
              type="email"
              defaultValue={otpEmail || ""}
              placeholder="Optional"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent shadow-sm transition-shadow"
            />
          </div>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-red-400 text-sm">
            {error}
          </div>
        )}

        <label className="flex items-center gap-3 cursor-pointer select-none">
          <div
            onClick={() => setRequireScreenshot((v) => !v)}
            className={`relative w-10 h-6 rounded-full transition-colors ${requireScreenshot ? "bg-indigo-500" : "bg-slate-700"}`}
          >
            <span
              className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${requireScreenshot ? "translate-x-4" : ""}`}
            />
          </div>
          <span className="text-sm text-slate-300">
            Take screenshot after fix for proof
          </span>
        </label>

        <button
          type="submit"
          disabled={submitting}
          className="w-full bg-indigo-500 hover:bg-indigo-600 disabled:opacity-60 text-white font-semibold py-3.5 rounded-xl transition-colors shadow-md shadow-indigo-500/20"
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
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;
    const stars: { x: number; y: number; r: number; o: number; speed: number }[] = [];

    function resize() {
      canvas!.width = canvas!.offsetWidth;
      canvas!.height = canvas!.offsetHeight;
    }
    resize();
    window.addEventListener("resize", resize);

    for (let i = 0; i < 120; i++) {
      stars.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        r: Math.random() * 1.5 + 0.3,
        o: Math.random() * 0.7 + 0.1,
        speed: Math.random() * 0.003 + 0.001,
      });
    }

    let t = 0;
    function draw() {
      ctx!.clearRect(0, 0, canvas!.width, canvas!.height);
      t += 0.01;
      stars.forEach((s) => {
        const opacity = s.o * (0.6 + 0.4 * Math.sin(t * s.speed * 100));
        ctx!.beginPath();
        ctx!.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx!.fillStyle = `rgba(255,255,255,${opacity})`;
        ctx!.fill();
      });
      animId = requestAnimationFrame(draw);
    }
    draw();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <div className="min-h-screen bg-[#06080f] flex flex-col md:flex-row">
      {/* Left panel — dark with constellation + brand */}
      <div className="md:w-[42%] shrink-0 relative flex flex-col items-start justify-center px-12 py-16 md:py-0 md:min-h-screen overflow-hidden">
        {/* Dark gradient background */}
        <div className="absolute inset-0" style={{ background: `linear-gradient(135deg, #0d0f1a 0%, #06080f 100%)` }} />
        {/* Subtle color glow */}
        <div className="absolute inset-0" style={{ background: `radial-gradient(ellipse at 30% 50%, ${accentColor}18 0%, transparent 70%)` }} />
        {/* Constellation canvas */}
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />

        {/* Content */}
        <div className="relative z-10">
          {project?.brand_logo_url && (
            <img src={project.brand_logo_url} alt="logo" className="h-10 w-auto mb-8" />
          )}
          <div className="inline-flex items-center gap-2 bg-white/5 border border-white/10 rounded-full px-3 py-1.5 mb-6">
            <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            <span className="text-xs text-slate-400 font-medium">Claude is ready</span>
          </div>
          <h1 className="text-4xl font-bold text-white leading-tight mb-4">
            {project?.brand_name || project?.name || "AgentInbox"}
          </h1>
          <p className="text-slate-400 text-sm leading-relaxed max-w-xs">
            {project?.description || "Submit a bug or feature request and we'll handle the rest."}
          </p>

          <div className="mt-10 space-y-3">
            {[
              { icon: "⚡", text: "Claude picks it up instantly" },
              { icon: "🔒", text: "You approve before any code changes" },
              { icon: "✅", text: "Screenshot proof when it's done" },
            ].map((item) => (
              <div key={item.text} className="flex items-center gap-3">
                <span className="text-base">{item.icon}</span>
                <span className="text-xs text-slate-500">{item.text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right panel — dark form */}
      <div className="flex-1 flex items-start md:items-center justify-center px-6 py-12 overflow-y-auto bg-[#0a0c12]">
        <div className="w-full max-w-lg">
          {localStorage.getItem("auth_token") && (
            <a href="/pm" className="inline-flex items-center gap-1.5 text-slate-500 hover:text-slate-300 text-xs mb-6 transition-colors">
              <span>←</span> PM Dashboard
            </a>
          )}
          {children}
        </div>
      </div>
    </div>
  );
}
