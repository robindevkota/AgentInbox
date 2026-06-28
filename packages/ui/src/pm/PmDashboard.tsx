import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { io, Socket } from "socket.io-client";

interface Task {
  id: string;
  project_id: string;
  title: string;
  description: string;
  status: string;
  priority: "low" | "medium" | "high";
  submitter_name: string | null;
  submitter_email: string | null;
  file_name: string | null;
  proposed_plan: string | null;
  approved_at: number | null;
  approved_by: string | null;
  rejected_reason: string | null;
  summary_technical: string | null;
  summary_plain: string | null;
  pr_link: string | null;
  screenshot_path: string | null;
  screenshot_base64: string | null;
  escalation_reason: string | null;
  custom_field_values: string | null;
  audit: AuditEntry[];
  created_at: number;
  updated_at: number;
}

interface TaskComment {
  id: string;
  author: string;
  body: string;
  created_at: number;
}

interface AuditEntry {
  id: string;
  action: string;
  actor: string | null;
  detail: string | null;
  created_at: number;
}

interface CustomField {
  name: string;
  type: "dropdown" | "text";
  options?: string[];
  required?: boolean;
}

interface Project {
  id: string;
  name: string;
  token: string;
  require_approval: number;
  require_verification: number;
  notify_email: string | null;
  brand_name: string | null;
  brand_color: string | null;
  custom_fields: string | null; // JSON: CustomField[]
}

interface Stats {
  total_tasks: number;
  done: number;
  in_progress: number;
  pending: number;
  escalated: number;
  projects: number;
  plan?: string;
  task_count_this_month?: number;
  free_task_limit?: number;
}

type Screen = "onboarding" | "login" | "dashboard";

interface Toast {
  id: number;
  type: "done" | "escalated" | "submitted" | "approval";
  title: string;
  body: string;
  taskId?: string;
}

function playSound(type: "done" | "escalated" | "submitted" | "approval") {
  const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);

  if (type === "done") {
    // Two rising tones — success
    osc.frequency.setValueAtTime(440, ctx.currentTime);
    osc.frequency.setValueAtTime(660, ctx.currentTime + 0.12);
    gain.gain.setValueAtTime(0.18, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.35);
  } else if (type === "escalated") {
    // Low descending tone — warning
    osc.frequency.setValueAtTime(330, ctx.currentTime);
    osc.frequency.setValueAtTime(220, ctx.currentTime + 0.15);
    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.4);
  } else {
    // Single soft ping — neutral
    osc.frequency.setValueAtTime(520, ctx.currentTime);
    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.25);
  }
}

// ── Top-level router ─────────────────────────────────────────────────────────

export function PmDashboard() {
  const navigate = useNavigate();
  const workspaceId = localStorage.getItem("pm_workspace_id") || "";

  function handleLogout() {
    localStorage.removeItem("auth_token");
    localStorage.removeItem("pm_workspace_id");
    localStorage.removeItem("pm_api_key");
    navigate("/login");
  }

  return (
    <DashboardScreen
      workspaceId={workspaceId}
      initialProjects={[]}
      onLogout={handleLogout}
    />
  );
}

// ── Onboarding: create workspace + first project ─────────────────────────────

function OnboardingScreen({
  onDone,
}: {
  onDone: (wsId: string, key: string, projects: Project[]) => void;
}) {
  const [step, setStep] = useState<"workspace" | "project" | "done">("workspace");
  const [wsName, setWsName]       = useState("");
  const [wsId, setWsId]           = useState("");
  const [projName, setProjName]   = useState("");
  const [projDesc, setProjDesc]   = useState("");
  const [notifyEmail, setNotifyEmail] = useState("");
  const [approval, setApproval]   = useState(false);
  const [brandColor, setBrandColor] = useState("#6366f1");
  const [createdProject, setCreatedProject] = useState<Project | null>(null);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState("");

  async function createWorkspace() {
    if (!wsName.trim()) return;
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/workspaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: wsName.trim() }),
      });
      if (!res.ok) throw new Error("Failed to create workspace");
      const data = await res.json();
      setWsId(data.id);
      setStep("project");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  async function createProject() {
    if (!projName.trim()) return;
    setLoading(true); setError("");
    try {
      const res = await fetch(`/api/workspaces/${wsId}/projects`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: projName.trim(),
          description: projDesc.trim() || undefined,
          notify_email: notifyEmail.trim() || undefined,
          require_approval: approval,
          brand_color: brandColor,
        }),
      });
      if (!res.ok) throw new Error("Failed to create project");
      const proj = await res.json();
      setCreatedProject(proj);
      setStep("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  function finish() {
    onDone(wsId, "", createdProject ? [createdProject] : []);
  }

  const submitUrl = createdProject
    ? `${window.location.origin}/submit/${createdProject.token}`
    : "";

  const stepIdx = step === "workspace" ? 0 : step === "project" ? 1 : 2;

  return (
    <div className="min-h-screen bg-[#0f1117] flex items-center justify-center px-4 py-16">
      <div className="w-full max-w-lg">

        {/* Header */}
        <div className="text-center mb-10">
          <div className="text-indigo-500 font-extrabold text-2xl tracking-tight mb-2">AgentInbox</div>
          <p className="text-slate-500 text-sm">Set up your workspace in 2 steps</p>
        </div>

        {/* Step indicator */}
        <div className="flex items-center justify-center gap-3 mb-8">
          {["Create workspace", "Add first project", "Get your link"].map((label, i) => (
            <div key={label} className="flex items-center gap-3">
              <div className="flex items-center gap-2 text-sm font-medium">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                  stepIdx === i
                    ? "bg-indigo-500 text-white"
                    : stepIdx > i
                    ? "bg-green-100 text-green-700"
                    : "bg-slate-200 text-slate-400"
                }`}>
                  {stepIdx > i ? "✓" : i + 1}
                </div>
                <span className={`hidden sm:inline text-sm ${stepIdx === i ? "text-indigo-600 font-semibold" : stepIdx > i ? "text-green-600" : "text-slate-400"}`}>
                  {label}
                </span>
              </div>
              {i < 2 && <div className="w-8 h-px bg-slate-200" />}
            </div>
          ))}
        </div>

        {/* Card with indigo gradient header strip */}
        <div className="bg-[#1a1d2e] border border-[#2a2d3e] rounded-2xl shadow-sm overflow-hidden">
          <div className="h-1.5 bg-gradient-to-r from-indigo-500 to-indigo-400" />
          <div className="p-8">

            {/* Step 1: Workspace */}
            {step === "workspace" && (
              <div className="space-y-5">
                <div>
                  <h2 className="text-xl font-bold text-white mb-1">Name your workspace</h2>
                  <p className="text-slate-500 text-sm">This is your agency or company — you'll run multiple client projects under it.</p>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Workspace name</label>
                  <input
                    type="text"
                    value={wsName}
                    onChange={(e) => setWsName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && createWorkspace()}
                    className="w-full bg-[#1a1d2e] border border-[#2a2d3e] rounded-xl px-4 py-3 text-lg text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent shadow-sm"
                    placeholder="e.g. Acme Agency"
                    autoFocus
                  />
                </div>
                {error && <p className="text-red-600 text-sm">{error}</p>}
                <button
                  onClick={createWorkspace}
                  disabled={loading || !wsName.trim()}
                  className="w-full bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 text-white font-semibold py-3.5 rounded-xl transition-colors"
                >
                  {loading ? "Creating..." : "Continue →"}
                </button>
              </div>
            )}

            {/* Step 2: Project */}
            {step === "project" && (
              <div className="space-y-4">
                <div>
                  <h2 className="text-xl font-bold text-white mb-1">Add your first project</h2>
                  <p className="text-slate-500 text-sm">Each project gets its own submission link for a client or codebase.</p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Project name <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    value={projName}
                    onChange={(e) => setProjName(e.target.value)}
                    className="w-full bg-[#1a1d2e] border border-[#2a2d3e] rounded-xl px-4 py-3 text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent shadow-sm"
                    placeholder="e.g. form-gen-mbl"
                    autoFocus
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Description <span className="text-slate-400 font-normal normal-case">(optional)</span></label>
                  <input
                    type="text"
                    value={projDesc}
                    onChange={(e) => setProjDesc(e.target.value)}
                    className="w-full bg-[#1a1d2e] border border-[#2a2d3e] rounded-xl px-4 py-3 text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent shadow-sm"
                    placeholder="e.g. Mobile form generation app"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Notification email <span className="text-slate-400 font-normal normal-case">(optional)</span></label>
                  <input
                    type="email"
                    value={notifyEmail}
                    onChange={(e) => setNotifyEmail(e.target.value)}
                    className="w-full bg-[#1a1d2e] border border-[#2a2d3e] rounded-xl px-4 py-3 text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent shadow-sm"
                    placeholder="you@email.com — get notified on task events"
                  />
                </div>

                <div className="flex items-center justify-between py-3 border-t border-[#2a2d3e]">
                  <div>
                    <p className="text-sm font-medium text-slate-300">Require PM approval</p>
                    <p className="text-xs text-slate-400">Claude proposes a plan, you approve before any code runs</p>
                  </div>
                  <div
                    onClick={() => setApproval(!approval)}
                    className={`relative w-10 h-6 rounded-full transition-colors cursor-pointer ${approval ? "bg-indigo-500" : "bg-slate-300"}`}
                  >
                    <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${approval ? "translate-x-5" : "translate-x-1"}`} />
                  </div>
                </div>

                <div className="flex items-center gap-3 py-3 border-t border-[#2a2d3e]">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-slate-300">Brand color</p>
                    <p className="text-xs text-slate-400">Shown on the client submission form</p>
                  </div>
                  <input
                    type="color"
                    value={brandColor}
                    onChange={(e) => setBrandColor(e.target.value)}
                    className="h-9 w-14 rounded cursor-pointer border border-slate-300"
                  />
                </div>

                {error && <p className="text-red-600 text-sm">{error}</p>}

                <button
                  onClick={createProject}
                  disabled={loading || !projName.trim()}
                  className="w-full bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 text-white font-semibold py-3.5 rounded-xl transition-colors"
                >
                  {loading ? "Creating..." : "Create project →"}
                </button>
              </div>
            )}

            {/* Step 3: Done — show link */}
            {step === "done" && createdProject && (
              <div className="space-y-6">
                <div className="text-center">
                  <div className="text-5xl mb-3">🎉</div>
                  <h2 className="text-xl font-bold text-white mb-1">You're all set!</h2>
                  <p className="text-slate-500 text-sm">Send this link to your client. That's all they need.</p>
                </div>

                <div className="bg-[#0f1117] border border-[#2a2d3e] rounded-xl p-4">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Client submission link</p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 text-sm text-indigo-700 bg-indigo-50 rounded-lg px-3 py-2 break-all">
                      {submitUrl}
                    </code>
                    <button
                      onClick={() => navigator.clipboard.writeText(submitUrl)}
                      className="shrink-0 bg-indigo-500 hover:bg-indigo-600 text-white text-xs font-medium px-3 py-2 rounded-lg transition-colors"
                    >
                      Copy
                    </button>
                  </div>
                </div>

                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                  <p className="text-xs font-semibold text-amber-700 uppercase tracking-wider mb-2">Save your workspace ID</p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 text-sm text-amber-900 bg-amber-100 rounded-lg px-3 py-2 break-all">{wsId}</code>
                    <button
                      onClick={() => navigator.clipboard.writeText(wsId)}
                      className="shrink-0 bg-amber-600 hover:bg-amber-700 text-white text-xs font-medium px-3 py-2 rounded-lg transition-colors"
                    >
                      Copy
                    </button>
                  </div>
                  <p className="text-xs text-amber-600 mt-2">You'll need this to log back into the dashboard.</p>
                </div>

                <div className="bg-[#0f1117] border border-[#2a2d3e] rounded-xl p-4">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Connect Claude</p>
                  <pre className="text-xs text-slate-300 overflow-x-auto">{`{
  "mcpServers": {
    "agentinbox": {
      "url": "${window.location.origin}/mcp"
    }
  }
}`}</pre>
                </div>

                <button
                  onClick={finish}
                  className="w-full bg-indigo-500 hover:bg-indigo-600 text-white font-semibold py-3.5 rounded-xl transition-colors"
                >
                  Go to dashboard →
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Login screen ─────────────────────────────────────────────────────────────

function LoginScreen({
  defaultWsId,
  defaultKey,
  onDone,
  onNewWorkspace,
}: {
  defaultWsId: string;
  defaultKey: string;
  onDone: (wsId: string, key: string, projects: Project[]) => void;
  onNewWorkspace: () => void;
}) {
  const [wsId, setWsId]   = useState(defaultWsId);
  const [key, setKey]     = useState(defaultKey);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function login() {
    if (!wsId.trim()) { setError("Workspace ID is required"); return; }
    setLoading(true); setError("");
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (key.trim()) headers["x-api-key"] = key.trim();
    const res = await fetch(`/api/workspaces/${wsId}/projects`, { headers });
    if (!res.ok) { setError("Workspace not found or invalid API key"); setLoading(false); return; }
    const projects = await res.json();
    setLoading(false);
    onDone(wsId.trim(), key.trim(), projects);
  }

  return (
    <div className="min-h-screen bg-[#0f1117] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-indigo-500 font-extrabold text-2xl tracking-tight mb-1">AgentInbox</div>
          <p className="text-slate-500 text-sm">PM Dashboard</p>
        </div>
        <div className="bg-[#1a1d2e] border border-[#2a2d3e] rounded-2xl shadow-sm overflow-hidden">
          <div className="h-1.5 bg-gradient-to-r from-indigo-500 to-indigo-400" />
          <div className="p-6 space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Workspace ID</label>
              <input
                type="text"
                value={wsId}
                onChange={(e) => setWsId(e.target.value)}
                className="w-full bg-[#1a1d2e] border border-[#2a2d3e] rounded-xl px-4 py-3 text-sm text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent shadow-sm"
                placeholder="Paste your workspace ID"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                API Key <span className="text-slate-400 font-normal normal-case">(optional)</span>
              </label>
              <input
                type="password"
                value={key}
                onChange={(e) => setKey(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && login()}
                className="w-full bg-[#1a1d2e] border border-[#2a2d3e] rounded-xl px-4 py-3 text-sm text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent shadow-sm"
                placeholder="Only needed if API_KEY is set in .env"
              />
            </div>
            {error && <p className="text-red-600 text-sm">{error}</p>}
            <button
              onClick={login}
              disabled={loading}
              className="w-full bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition-colors"
            >
              {loading ? "Loading..." : "Open dashboard"}
            </button>
            <button
              onClick={onNewWorkspace}
              className="w-full text-slate-500 text-sm hover:text-indigo-600 transition-colors"
            >
              Create a new workspace →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main dashboard ────────────────────────────────────────────────────────────

function DashboardScreen({
  workspaceId,
  initialProjects,
  onLogout,
}: {
  workspaceId: string;
  initialProjects: Project[];
  onLogout: () => void;
}) {
  const [projects, setProjects]         = useState<Project[]>(initialProjects);
  const [stats, setStats]               = useState<Stats | null>(null);
  const [selectedProject, setSelectedProject] = useState<string>(initialProjects[0]?.id || "");
  const [tasks, setTasks]               = useState<Task[]>([]);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [view, setView]                 = useState<"tasks" | "stats" | "settings" | "new-project" | "feedback" | "chat">("tasks");
  const [error, setError]               = useState("");
  const [newProjOpen, setNewProjOpen]   = useState(false);
  const [toasts, setToasts]             = useState<Toast[]>([]);
  const [sidebarOpen, setSidebarOpen]   = useState(true);
  const toastCounter                    = useRef(0);
  const socketRef                       = useRef<Socket | null>(null);

  const authHeaders = useCallback((): Record<string, string> => {
    const h: Record<string, string> = { "Content-Type": "application/json" };
    const token = localStorage.getItem("auth_token");
    if (token) h["Authorization"] = `Bearer ${token}`;
    return h;
  }, []);

  const addToast = useCallback((toast: Omit<Toast, "id">) => {
    const id = ++toastCounter.current;
    setToasts((prev) => [...prev, { ...toast, id }]);
    playSound(toast.type);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 5000);
  }, []);

  // PM socket — real-time task event notifications
  useEffect(() => {
    const token = localStorage.getItem("auth_token");
    if (!token) return;

    const socket = io(window.location.origin, {
      path: "/agent-socket",
      auth: { token: `Bearer ${token}` },
      reconnectionDelay: 2000,
      reconnectionAttempts: 10,
    });
    socketRef.current = socket;

    socket.on("task.submitted", (data: { task_id: string; title: string; project_name: string; submitter_name?: string }) => {
      addToast({ type: "submitted", title: "New task submitted", body: data.title, taskId: data.task_id });
      // Add new task to list optimistically if it belongs to selected project
      setTasks((prev) => {
        if (prev.some((t) => t.id === data.task_id)) return prev;
        return prev; // full reload handled by next manual refresh
      });
    });

    socket.on("task.done", (data: { task_id: string; title: string; summary_plain: string }) => {
      addToast({ type: "done", title: "Task completed ✓", body: data.summary_plain || data.title, taskId: data.task_id });
      setTasks((prev) => prev.map((t) => t.id === data.task_id ? { ...t, status: "done" } : t));
    });

    socket.on("task.escalated", (data: { task_id: string; title: string; reason: string }) => {
      addToast({ type: "escalated", title: "Task needs attention", body: data.reason || data.title, taskId: data.task_id });
      setTasks((prev) => prev.map((t) => t.id === data.task_id ? { ...t, status: "escalated" } : t));
    });

    socket.on("task.approval_needed", (data: { task_id: string; title: string }) => {
      addToast({ type: "approval", title: "Approval requested", body: data.title, taskId: data.task_id });
      setTasks((prev) => prev.map((t) => t.id === data.task_id ? { ...t, status: "awaiting_approval" } : t));
    });

    return () => { socket.disconnect(); socketRef.current = null; };
  }, [workspaceId, addToast]);

  // Update tab title with unread count
  useEffect(() => {
    const unread = toasts.length;
    document.title = unread > 0 ? `(${unread}) AgentInbox` : "AgentInbox";
    return () => { document.title = "AgentInbox"; };
  }, [toasts.length]);

  useEffect(() => {
    fetch(`/api/workspaces/${workspaceId}/stats`, { headers: authHeaders() })
      .then((r) => r.json()).then(setStats).catch(() => {});
    fetch(`/api/workspaces/${workspaceId}/projects`, { headers: authHeaders() })
      .then((r) => r.json()).then((projs: unknown) => {
        const list = Array.isArray(projs) ? projs : [];
        setProjects(list);
        setSelectedProject((prev) => prev || list[0]?.id || "");
      }).catch(() => {});
  }, [workspaceId, authHeaders]);

  useEffect(() => {
    if (!selectedProject) return;
    const url = statusFilter
      ? `/api/projects/${selectedProject}/tasks?status=${statusFilter}`
      : `/api/projects/${selectedProject}/tasks`;
    fetch(url, { headers: authHeaders() })
      .then((r) => r.json()).then((data: unknown) => {
        setTasks(Array.isArray(data) ? data : []);
      }).catch(() => setError("Failed to load tasks"));
  }, [selectedProject, statusFilter, authHeaders]);

  async function loadTask(id: string) {
    const res = await fetch(`/api/tasks/${id}`, { headers: authHeaders() });
    setSelectedTask(await res.json());
  }

  async function approveTask(id: string) {
    await fetch(`/api/tasks/${id}/approve?by=PM`, { method: "POST", headers: authHeaders() });
    await loadTask(id);
    setTasks((prev) => prev.map((t) => t.id === id ? { ...t, status: "in_progress" } : t));
  }

  async function rejectTask(id: string) {
    const reason = prompt("Reason for rejection?");
    if (!reason) return;
    await fetch(`/api/tasks/${id}/reject`, {
      method: "POST", headers: { ...authHeaders(), "Content-Type": "application/json" }, body: JSON.stringify({ reason }),
    });
    await loadTask(id);
    setTasks((prev) => prev.map((t) => t.id === id ? { ...t, status: "failed" } : t));
  }

  async function reopenTask(id: string) {
    await fetch(`/api/tasks/${id}/reopen?by=PM`, { method: "POST", headers: authHeaders() });
    await loadTask(id);
    setTasks((prev) => prev.map((t) => t.id === id ? { ...t, status: "pending" } : t));
  }

  async function refreshProjects() {
    const res = await fetch(`/api/workspaces/${workspaceId}/projects`, { headers: authHeaders() });
    if (res.ok) setProjects(await res.json());
  }

  async function handleProjectCreated(proj: Project) {
    setProjects((prev) => [proj, ...prev]);
    setSelectedProject(proj.id);
    setView("tasks");
    setNewProjOpen(false);
    fetch(`/api/workspaces/${workspaceId}/stats`, { headers: authHeaders() })
      .then((r) => r.json()).then(setStats).catch(() => {});
  }

  return (
    <div className="h-screen flex bg-[#0f1117] overflow-hidden">
      {/* ── Sidebar ── */}
      <div className={`${sidebarOpen ? "w-60" : "w-0 overflow-hidden"} bg-[#0a0c12] text-white flex flex-col shrink-0 border-r border-white/5 transition-all duration-200`}>
        {/* Logo + hamburger */}
        <div className="px-4 py-4 flex items-center justify-between border-b border-white/5">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center text-white font-bold text-xs shrink-0">A</div>
            <span className="text-white font-semibold text-sm">AgentInbox</span>
          </div>
          {stats?.plan && (
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
              stats.plan === "paid" ? "bg-indigo-500/20 text-indigo-400 border border-indigo-500/30" : "bg-white/5 text-slate-500 border border-white/10"
            }`}>{stats.plan === "paid" ? "Pro" : "Free"}</span>
          )}
        </div>

        {/* Stats */}
        {stats && (
          <div className="px-3 pb-4 border-b border-white/5">
            <div className="grid grid-cols-2 gap-1.5">
              <div className="bg-white/5 rounded-xl px-3 py-2.5 text-center">
                <div className="text-lg font-bold text-white">{stats.total_tasks}</div>
                <div className="text-xs text-slate-500">Total</div>
              </div>
              <div className="bg-white/5 rounded-xl px-3 py-2.5 text-center">
                <div className="text-lg font-bold text-green-400">{stats.done}</div>
                <div className="text-xs text-slate-500">Done</div>
              </div>
              <div className="bg-white/5 rounded-xl px-3 py-2.5 text-center">
                <div className="text-lg font-bold text-indigo-400">{stats.in_progress}</div>
                <div className="text-xs text-slate-500">Active</div>
              </div>
              <div className="bg-white/5 rounded-xl px-3 py-2.5 text-center">
                <div className="text-lg font-bold text-orange-400">{stats.escalated}</div>
                <div className="text-xs text-slate-500">Escalated</div>
              </div>
            </div>
          </div>
        )}

        {/* Projects */}
        <div className="px-3 py-4 flex-1 overflow-y-auto">
          <div className="flex items-center justify-between mb-2 px-1">
            <p className="text-xs font-semibold text-slate-600 uppercase tracking-widest">Projects</p>
            <button onClick={() => setNewProjOpen(true)} className="w-5 h-5 rounded-md bg-white/5 hover:bg-indigo-500/20 hover:text-indigo-400 text-slate-400 flex items-center justify-center text-sm font-bold transition-colors" title="New project">+</button>
          </div>
          {projects.length === 0 && <p className="text-xs text-slate-600 px-1">No projects yet.</p>}
          {projects.map((p) => (
            <button key={p.id}
              onClick={() => { setSelectedProject(p.id); setSelectedTask(null); setView("tasks"); }}
              className={`w-full text-left px-3 py-2.5 rounded-xl text-sm mb-0.5 transition-all ${
                selectedProject === p.id
                  ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 font-medium"
                  : "text-slate-400 hover:bg-white/5 hover:text-slate-200 border border-transparent"
              }`}
            >
              <span className="truncate block">{p.brand_name || p.name}</span>
              {p.require_approval ? <span className="text-xs text-yellow-500/70 font-normal">● approval on</span> : null}
            </button>
          ))}
        </div>

        {/* Bottom nav */}
        <div className="px-3 py-3 border-t border-white/5 space-y-0.5">
          <NavBtn active={view === "chat"} onClick={() => setView("chat")}>💬 Chat with Claude</NavBtn>
          <NavBtn active={view === "stats"} onClick={() => setView("stats")}>Usage stats</NavBtn>
          <NavBtn active={view === "settings"} onClick={() => setView("settings")}>Settings</NavBtn>
          <NavBtn active={view === "feedback"} onClick={() => setView("feedback")}>Feedback</NavBtn>
          <a
            href="/playground"
            target="_blank"
            rel="noreferrer"
            className="w-full text-left px-3 py-2 rounded-lg text-sm text-slate-500 hover:text-indigo-400 hover:bg-indigo-500/10 transition-all flex items-center gap-2"
          >
            <span>🎮</span> Playground
          </a>
          <button
            onClick={onLogout}
            className="w-full text-left px-3 py-2 rounded-lg text-sm text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-all flex items-center gap-2"
          >
            <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
            Logout
          </button>
        </div>
      </div>

      {/* ── Main content ── */}
      <div className="flex-1 flex flex-col overflow-hidden relative">

        {/* Persistent top bar — hamburger + client link */}
        <div className="flex items-center border-b border-white/5 bg-[#0a0c12] px-3 py-2 shrink-0 gap-2">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="w-7 h-7 rounded-lg hover:bg-white/10 text-slate-500 hover:text-white flex flex-col items-center justify-center gap-[3px] transition-colors shrink-0"
            title="Toggle sidebar"
          >
            <span className="w-3.5 h-px bg-current rounded-full block"></span>
            <span className="w-3.5 h-px bg-current rounded-full block"></span>
            <span className="w-3.5 h-px bg-current rounded-full block"></span>
          </button>
          <TopLinkBar project={projects.find((p) => p.id === selectedProject)} />
        </div>

        {/* New project modal */}
        {newProjOpen && (
          <NewProjectModal
            workspaceId={workspaceId}
            authHeaders={authHeaders()}
            onCreated={handleProjectCreated}
            onClose={() => setNewProjOpen(false)}
          />
        )}

        {/* Upgrade banner — free tier approaching/at limit */}
        {stats?.plan === "free" && stats.task_count_this_month !== undefined && stats.free_task_limit !== undefined && (
          (() => {
            const used = stats.task_count_this_month!;
            const limit = stats.free_task_limit!;
            const atLimit = used >= limit;
            const nearLimit = used >= limit * 0.8;
            if (!nearLimit) return null;
            return (
              <div className={`px-5 py-3 flex items-center justify-between text-sm ${
                atLimit ? "bg-red-500/10 border-b border-red-500/30 text-red-400" : "bg-amber-500/10 border-b border-amber-500/30 text-amber-400"
              }`}>
                <span>
                  {atLimit
                    ? `Free plan limit reached — ${used}/${limit} tasks this month.`
                    : `${used}/${limit} tasks used this month.`}
                  {atLimit ? " New submissions are blocked." : " Upgrade before you hit the limit."}
                </span>
                <a
                  href="mailto:sophiabrut1@gmail.com?subject=AgentInbox Pro Upgrade"
                  className={`ml-4 shrink-0 font-semibold px-3 py-1 rounded-lg text-xs transition-colors ${
                    atLimit
                      ? "bg-red-600 text-white hover:bg-red-700"
                      : "bg-amber-500 text-white hover:bg-amber-600"
                  }`}
                >
                  Upgrade to Pro →
                </a>
              </div>
            );
          })()
        )}

        {view === "stats" && (
          <div className="flex-1 overflow-y-auto p-8">
            <StatsView stats={stats} projects={projects} />
          </div>
        )}
        {view === "settings" && (
          <div className="flex-1 overflow-y-auto p-8">
            <SettingsView
              selectedProject={selectedProject}
              projects={projects}
              authHeaders={authHeaders()}
              workspaceId={workspaceId}
              onSaved={refreshProjects}
              onDeleted={(id) => {
                setProjects((prev) => prev.filter((p) => p.id !== id));
                const remaining = projects.filter((p) => p.id !== id);
                setSelectedProject(remaining[0]?.id || "");
                setView("tasks");
              }}
            />
          </div>
        )}

        {view === "feedback" && (
          <div className="flex-1 overflow-y-auto p-8">
            <FeedbackView authHeaders={authHeaders()} />
          </div>
        )}

        {view === "chat" && (
          <div className="flex-1 flex overflow-hidden">
            <ChatView authHeaders={authHeaders()} socketRef={socketRef} />
          </div>
        )}

        {view === "tasks" && (
          <>
            {!selectedProject ? (
              <div className="flex-1 flex flex-col items-center justify-center text-slate-400 gap-4">
                <p className="text-sm">No project selected.</p>
                <button onClick={() => setNewProjOpen(true)}
                  className="bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-medium px-5 py-2.5 rounded-xl transition-colors">
                  + Create your first project
                </button>
              </div>
            ) : (
              <div className="flex flex-col flex-1 overflow-hidden">

                {/* Filter bar */}
                <div className="bg-[#0d0f18] border-b border-white/5 px-4 py-2.5 flex items-center gap-1 flex-wrap">
                  {["", "pending", "awaiting_approval", "in_progress", "done", "failed", "escalated"].map((s) => (
                    <button key={s || "all"}
                      onClick={() => setStatusFilter(s)}
                      className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-all ${
                        statusFilter === s
                          ? "bg-indigo-500 text-white shadow-sm shadow-indigo-500/30"
                          : "text-slate-400 hover:text-white bg-white/5 hover:bg-white/10"
                      }`}>
                      {s ? s.replace(/_/g, " ") : "All"}
                    </button>
                  ))}
                </div>

                {/* Task list + detail */}
                <div className="flex flex-1 overflow-hidden">
                  {/* Task cards */}
                  <div className="flex-1 overflow-y-auto p-5 bg-[#0f1117]">
                    {error && <p className="text-red-400 text-sm mb-4">{error}</p>}
                    {tasks.length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-full text-center py-20">
                        <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center mb-4 text-2xl">📭</div>
                        <p className="text-sm text-slate-400 mb-1">No tasks yet.</p>
                        <p className="text-xs text-slate-600">Share the submission link with your client to get started.</p>
                      </div>
                    ) : (
                      <div className="space-y-2 max-w-2xl">
                        {tasks.map((t) => (
                          <button key={t.id} onClick={() => loadTask(t.id)}
                            className={`w-full text-left rounded-xl px-5 py-4 border transition-all ${
                              selectedTask?.id === t.id
                                ? "bg-indigo-500/10 border-indigo-500/30"
                                : "bg-[#141720] border-white/5 hover:border-white/10 hover:bg-[#1a1d2e]"
                            }`}>
                            <div className="flex items-start justify-between gap-3 mb-2">
                              <span className="text-sm font-medium text-slate-200 leading-snug line-clamp-1">{t.title}</span>
                              <div className="flex items-center gap-1.5 shrink-0">
                                {t.priority === "high" && <span className="text-xs px-2 py-0.5 rounded-md font-medium bg-red-500/20 text-red-400 border border-red-500/20">high</span>}
                                {t.priority === "low" && <span className="text-xs px-2 py-0.5 rounded-md font-medium bg-white/5 text-slate-500">low</span>}
                                {t.status === "in_progress" && <ElapsedTimer updatedAt={t.updated_at} />}
                                <span className={`text-xs px-2.5 py-1 rounded-md font-medium ${STATUS_COLORS[t.status] || "bg-white/5 text-slate-400"}`}>
                                  {t.status.replace(/_/g, " ")}
                                </span>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 text-xs text-slate-600">
                              {t.submitter_name && <span className="text-slate-500">{t.submitter_name}</span>}
                              {t.custom_field_values && (() => {
                                try {
                                  const vals = JSON.parse(t.custom_field_values);
                                  return Object.entries(vals).map(([k, v]) => (
                                    <span key={k} className="bg-white/5 text-slate-500 px-1.5 py-0.5 rounded text-xs border border-white/5">{String(v)}</span>
                                  ));
                                } catch { return null; }
                              })()}
                              <span>{new Date(t.created_at * 1000).toLocaleDateString()}</span>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Task detail panel — slides in from right */}
                  {selectedTask && (
                    <div className="fixed right-0 top-0 h-full w-[480px] bg-[#0d0f18] shadow-2xl border-l border-white/5 overflow-y-auto z-40 flex flex-col">
                      <div className="flex items-center justify-between px-6 py-4 border-b border-white/5 shrink-0">
                        <h2 className="text-sm font-semibold text-slate-400">Task detail</h2>
                        <button
                          onClick={() => setSelectedTask(null)}
                          className="w-7 h-7 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white flex items-center justify-center text-sm transition-colors"
                        >×</button>
                      </div>
                      <div className="flex-1 p-6 overflow-y-auto">
                        <TaskDetail
                          task={selectedTask}
                          authHeaders={authHeaders}
                          onApprove={() => approveTask(selectedTask.id)}
                          onReject={() => rejectTask(selectedTask.id)}
                          onReopen={() => reopenTask(selectedTask.id)}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Toast notification stack ── */}
      {toasts.length > 0 && (
        <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 max-w-sm w-full">
          {toasts.map((toast) => (
            <div
              key={toast.id}
              onClick={() => setToasts((prev) => prev.filter((t) => t.id !== toast.id))}
              className={`flex items-start gap-3 px-4 py-3 rounded-xl shadow-lg border cursor-pointer transition-all ${
                toast.type === "done"
                  ? "bg-emerald-50 border-emerald-200 text-emerald-900"
                  : toast.type === "escalated"
                  ? "bg-red-50 border-red-200 text-red-900"
                  : toast.type === "approval"
                  ? "bg-amber-50 border-amber-200 text-amber-900"
                  : "bg-[#1a1d2e] border-[#2a2d3e] text-white"
              }`}
            >
              <span className="text-lg shrink-0">
                {toast.type === "done" ? "✓" : toast.type === "escalated" ? "⚠" : toast.type === "approval" ? "👀" : "📬"}
              </span>
              <div className="min-w-0">
                <p className="text-xs font-bold uppercase tracking-wide opacity-70">{toast.title}</p>
                <p className="text-sm font-medium truncate">{toast.body}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Top link bar (hamburger row) ─────────────────────────────────────────────

function TopLinkBar({ project }: { project?: Project }) {
  const [copied, setCopied] = useState(false);
  if (!project) return <div className="flex-1" />;
  const url = `${window.location.origin}/submit/${project.token}`;
  function copy() {
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  return (
    <div className="flex items-center gap-2 flex-1 min-w-0">
      <span className="text-xs font-medium text-slate-500 shrink-0">Client link:</span>
      <code className="flex-1 text-xs text-slate-400 truncate min-w-0">{url}</code>
      <button onClick={copy} className="shrink-0 text-xs bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10 px-2.5 py-1 rounded-lg transition-colors">
        {copied ? "Copied!" : "Copy"}
      </button>
      <a href={url} target="_blank" rel="noreferrer" className="shrink-0 text-xs text-slate-500 hover:text-slate-300 transition-colors">Open ↗</a>
    </div>
  );
}

// ── Submission link bar ───────────────────────────────────────────────────────

function SubmissionLinkBar({ project }: { project?: Project }) {
  const [copied, setCopied] = useState(false);
  if (!project) return null;
  const url = `${window.location.origin}/submit/${project.token}`;
  function copy() {
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  return (
    <div className="bg-indigo-500/5 border-b border-indigo-500/10 px-5 py-2.5 flex items-center gap-3">
      <span className="text-xs font-semibold text-indigo-400 shrink-0">Client link:</span>
      <code className="flex-1 text-xs text-slate-400 truncate">{url}</code>
      <button onClick={copy}
        className="shrink-0 text-xs bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 border border-indigo-500/20 px-3 py-1.5 rounded-lg transition-colors">
        {copied ? "Copied!" : "Copy"}
      </button>
      <a href={url} target="_blank" rel="noreferrer"
        className="shrink-0 text-xs text-slate-500 hover:text-slate-300 transition-colors">Open ↗</a>
    </div>
  );
}

// ── New project modal ─────────────────────────────────────────────────────────

function NewProjectModal({
  workspaceId,
  authHeaders,
  onCreated,
  onClose,
}: {
  workspaceId: string;
  authHeaders: Record<string, string>;
  onCreated: (p: Project) => void;
  onClose: () => void;
}) {
  const [name, setName]         = useState("");
  const [desc, setDesc]         = useState("");
  const [email, setEmail]       = useState("");
  const [approval, setApproval] = useState(false);
  const [color, setColor]       = useState("#6366f1");
  const [brandName, setBrandName] = useState("");
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");
  const [created, setCreated]   = useState<Project | null>(null);
  const [copied, setCopied]     = useState(false);

  async function create() {
    if (!name.trim()) return;
    setLoading(true); setError("");
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/projects`, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({
          name: name.trim(),
          description: desc.trim() || undefined,
          notify_email: email.trim() || undefined,
          require_approval: approval,
          brand_color: color,
          brand_name: brandName.trim() || undefined,
        }),
      });
      if (!res.ok) throw new Error("Failed to create project");
      const proj = await res.json();
      setCreated(proj);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  const submitUrl = created ? `${window.location.origin}/submit/${created.token}` : "";

  return (
    <div
      className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-[#1a1d2e] rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="h-1.5 bg-gradient-to-r from-indigo-500 to-indigo-400 rounded-t-2xl" />
        <div className="p-6 border-b border-[#2a2d3e] flex items-center justify-between">
          <h2 className="text-lg font-bold text-white">{created ? "Project created!" : "New project"}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-400 text-xl leading-none transition-colors">×</button>
        </div>

        <div className="p-6">
          {!created ? (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Project name <span className="text-red-500">*</span></label>
                <input type="text" value={name} onChange={(e) => setName(e.target.value)} autoFocus
                  className="w-full bg-[#1a1d2e] border border-[#2a2d3e] rounded-xl px-4 py-3 text-sm text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent shadow-sm"
                  placeholder="e.g. form-gen-mbl" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Description</label>
                <input type="text" value={desc} onChange={(e) => setDesc(e.target.value)}
                  className="w-full bg-[#1a1d2e] border border-[#2a2d3e] rounded-xl px-4 py-3 text-sm text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent shadow-sm"
                  placeholder="Optional" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Client-facing name <span className="text-slate-400 font-normal normal-case">(white label)</span></label>
                <input type="text" value={brandName} onChange={(e) => setBrandName(e.target.value)}
                  className="w-full bg-[#1a1d2e] border border-[#2a2d3e] rounded-xl px-4 py-3 text-sm text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent shadow-sm"
                  placeholder="What clients see — leave blank to use project name" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Notification email</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-[#1a1d2e] border border-[#2a2d3e] rounded-xl px-4 py-3 text-sm text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent shadow-sm"
                  placeholder="PM email for task alerts" />
              </div>
              <div className="flex items-center justify-between py-3 border-t border-[#2a2d3e]">
                <div>
                  <p className="text-sm font-medium text-slate-300">Require PM approval</p>
                  <p className="text-xs text-slate-400">Claude plans first, you approve before code runs</p>
                </div>
                <div onClick={() => setApproval(!approval)}
                  className={`relative w-10 h-6 rounded-full transition-colors cursor-pointer ${approval ? "bg-indigo-500" : "bg-slate-300"}`}>
                  <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${approval ? "translate-x-5" : "translate-x-1"}`} />
                </div>
              </div>
              <div className="flex items-center gap-3 py-3 border-t border-[#2a2d3e]">
                <div className="flex-1">
                  <p className="text-sm font-medium text-slate-300">Brand color</p>
                </div>
                <input type="color" value={color} onChange={(e) => setColor(e.target.value)}
                  className="h-9 w-14 rounded cursor-pointer border border-slate-300" />
              </div>
              {error && <p className="text-red-600 text-sm">{error}</p>}
              <button onClick={create} disabled={loading || !name.trim()}
                className="w-full bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition-colors">
                {loading ? "Creating..." : "Create project"}
              </button>
            </div>
          ) : (
            <div className="space-y-5">
              <p className="text-slate-400 text-sm">Share this link with your client. That's all they need.</p>
              <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4">
                <p className="text-xs font-semibold text-indigo-700 mb-2">Submission link</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-xs text-indigo-800 break-all">{submitUrl}</code>
                  <button onClick={() => { navigator.clipboard.writeText(submitUrl); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
                    className="shrink-0 bg-indigo-500 hover:bg-indigo-600 text-white text-xs font-medium px-3 py-1.5 rounded-lg transition-colors">
                    {copied ? "Copied!" : "Copy"}
                  </button>
                </div>
              </div>
              <div className="flex gap-3">
                <a href={submitUrl} target="_blank" rel="noreferrer"
                  className="flex-1 text-center border border-slate-300 hover:bg-[#0f1117] text-slate-300 text-sm font-medium py-2.5 rounded-xl transition-colors">
                  Preview form ↗
                </a>
                <button onClick={() => onCreated(created)}
                  className="flex-1 bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-medium py-2.5 rounded-xl transition-colors">
                  Go to project →
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Task detail ───────────────────────────────────────────────────────────────

function TaskDetail({ task, authHeaders, onApprove, onReject, onReopen }: { task: Task; authHeaders: () => Record<string, string>; onApprove: () => void; onReject: () => void; onReopen: () => void }) {
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [commentText, setCommentText] = useState("");
  const [commentAuthor, setCommentAuthor] = useState("PM");
  const [submittingComment, setSubmittingComment] = useState(false);

  useEffect(() => {
    fetch(`/api/tasks/${task.id}/comments`, { headers: authHeaders() })
      .then(r => r.json())
      .then(setComments)
      .catch(() => {});
  }, [task.id]);

  const submitComment = async () => {
    if (!commentText.trim()) return;
    setSubmittingComment(true);
    try {
      const res = await fetch(`/api/tasks/${task.id}/comments`, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ author: commentAuthor, body: commentText }),
      });
      if (res.ok) {
        const comment = await res.json();
        setComments(prev => [...prev, comment]);
        setCommentText("");
      }
    } finally {
      setSubmittingComment(false);
    }
  };

  const customFields = (() => {
    try { return task.custom_field_values ? JSON.parse(task.custom_field_values) : null; } catch { return null; }
  })();

  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-start justify-between gap-3 mb-2">
          <h1 className="text-lg font-bold text-white leading-snug">{task.title}</h1>
          <div className="flex items-center gap-1.5 shrink-0">
            {task.priority === "high" && <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-red-100 text-red-700">high</span>}
            {task.priority === "low" && <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-[#252838] text-slate-500">low</span>}
            {task.status === "in_progress" && <ElapsedTimer updatedAt={task.updated_at} />}
            <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${STATUS_COLORS[task.status] || "bg-[#252838] text-slate-400"}`}>
              {(task.status || "").replace(/_/g, " ")}
            </span>
          </div>
        </div>
        {task.submitter_name && <p className="text-sm text-slate-500">{task.submitter_name}{task.submitter_email && ` · ${task.submitter_email}`}</p>}
        <p className="text-xs text-slate-400 mt-0.5">{new Date(task.created_at * 1000).toLocaleString()}</p>
      </div>

      {task.status === "awaiting_approval" && (
        <div className="flex gap-2">
          <button onClick={onApprove} className="flex-1 bg-green-600 hover:bg-green-700 text-white text-sm font-medium px-4 py-2.5 rounded-xl transition-colors">Approve</button>
          <button onClick={onReject} className="flex-1 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 text-sm font-medium px-4 py-2.5 rounded-xl transition-colors">Reject</button>
        </div>
      )}

      {["done", "failed", "escalated"].includes(task.status) && (
        <button onClick={onReopen} className="w-full bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/20 text-sm font-medium px-4 py-2.5 rounded-xl transition-colors">
          Re-open task
        </button>
      )}

      {customFields && Object.keys(customFields).length > 0 && (
        <Card title="Submission details">
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(customFields).map(([k, v]) => (
              <div key={k}>
                <p className="text-xs text-slate-400 mb-0.5">{k}</p>
                <p className="text-sm font-medium text-slate-300">{String(v)}</p>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card title="Description"><p className="text-slate-300 text-sm whitespace-pre-wrap">{task.description}</p></Card>
      {task.file_name && (
        <Card title="Attached file">
          <p className="text-slate-400 text-sm mb-2">📎 {task.file_name}</p>
          {/\.(png|jpe?g|gif|webp)$/i.test(task.file_name) && (
            <img
              src={`/api/tasks/${task.id}/file`}
              alt={task.file_name}
              className="rounded-lg w-full border border-[#2a2d3e]"
              onError={e => (e.currentTarget.style.display = "none")}
            />
          )}
        </Card>
      )}
      {task.proposed_plan && <Card title="Claude's proposed plan"><p className="text-sm text-amber-300 whitespace-pre-wrap bg-amber-500/10 border border-amber-500/20 rounded-lg p-3">{task.proposed_plan}</p></Card>}
      {task.rejected_reason && <Card title="Rejection reason"><p className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg p-3">{task.rejected_reason}</p></Card>}
      {task.summary_technical && (
        <Card title="Technical summary">
          <p className="text-slate-300 text-sm font-mono whitespace-pre-wrap">{task.summary_technical}</p>
          {task.pr_link && (
            <a href={task.pr_link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 mt-2 text-indigo-600 hover:underline text-sm font-medium">
              View PR →
            </a>
          )}
        </Card>
      )}
      {task.summary_plain && <Card title="Client summary"><p className="text-slate-300 text-sm">{task.summary_plain}</p></Card>}
      {task.screenshot_base64 && (
        <Card title="Screenshot">
          <img src={`data:image/png;base64,${task.screenshot_base64}`} alt="Fix screenshot" className="rounded-lg w-full border border-[#2a2d3e]" />
        </Card>
      )}
      {task.escalation_reason && <Card title="Escalation reason"><p className="text-orange-700 text-sm">{task.escalation_reason}</p></Card>}

      {/* Comments */}
      <Card title={`Comments (${comments.length})`}>
        <div className="space-y-3 mb-3">
          {comments.length === 0 && <p className="text-xs text-slate-400">No comments yet.</p>}
          {comments.map(c => (
            <div key={c.id} className="bg-[#0f1117] rounded-lg p-3">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-semibold text-slate-300">{c.author}</span>
                <span className="text-xs text-slate-400">{new Date(c.created_at * 1000).toLocaleString()}</span>
              </div>
              <p className="text-sm text-slate-300 whitespace-pre-wrap">{c.body}</p>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            value={commentAuthor}
            onChange={e => setCommentAuthor(e.target.value)}
            className="bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-xs w-20 text-slate-300 placeholder:text-slate-600 focus:outline-none focus:border-indigo-500/50"
            placeholder="Name"
          />
          <input
            value={commentText}
            onChange={e => setCommentText(e.target.value)}
            onKeyDown={e => e.key === "Enter" && !e.shiftKey && submitComment()}
            className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-slate-300 placeholder:text-slate-600 focus:outline-none focus:border-indigo-500/50"
            placeholder="Add a comment..."
          />
          <button
            onClick={submitComment}
            disabled={submittingComment || !commentText.trim()}
            className="bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 text-white text-sm px-3 py-1.5 rounded-lg transition-colors"
          >
            Post
          </button>
        </div>
      </Card>

      {task.audit?.length > 0 && (
        <Card title="Audit log">
          <div className="space-y-2">
            {task.audit.map((e) => (
              <div key={e.id} className="flex gap-3 text-xs">
                <span className="text-slate-400 shrink-0">{new Date(e.created_at * 1000).toLocaleTimeString()}</span>
                <span className="font-medium text-slate-400">{(e.action || "").replace(/_/g, " ")}</span>
                {e.actor && <span className="text-slate-400">by {e.actor}</span>}
              </div>
            ))}
          </div>
        </Card>
      )}
      <div className="text-xs text-slate-400 space-y-1 pt-2">
        <p>Task ID: {task.id}</p>
        <p>Last updated: {new Date(task.updated_at * 1000).toLocaleString()}</p>
        <a href={`/task/${task.id}`} target="_blank" rel="noreferrer" className="text-indigo-500 hover:underline block">Client status link →</a>
      </div>
    </div>
  );
}

// ── Stats view ────────────────────────────────────────────────────────────────

function StatsView({ stats, projects }: { stats: Stats | null; projects: Project[] }) {
  if (!stats) return <div className="text-slate-400">Loading...</div>;
  return (
    <div className="max-w-3xl">
      <h2 className="text-xl font-bold text-white mb-6">Usage dashboard</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-8">
        <StatCard label="Total tasks" value={stats.total_tasks} />
        <StatCard label="Completed" value={stats.done} color="text-green-600" />
        <StatCard label="In progress" value={stats.in_progress} color="text-indigo-600" />
        <StatCard label="Pending" value={stats.pending} />
        <StatCard label="Escalated" value={stats.escalated} color="text-orange-500" />
        <StatCard label="Projects" value={stats.projects} />
      </div>
      <h3 className="font-semibold text-slate-300 mb-3">Projects</h3>
      <div className="space-y-2">
        {projects.map((p) => (
          <div key={p.id} className="bg-[#1a1d2e] border border-[#2a2d3e] rounded-xl px-5 py-4 flex items-center justify-between shadow-sm">
            <div>
              <p className="font-semibold text-white text-sm">{p.brand_name || p.name}</p>
              {p.notify_email && <p className="text-xs text-slate-400 mt-0.5">{p.notify_email}</p>}
            </div>
            {p.require_approval ? <span className="bg-yellow-100 text-yellow-700 text-xs px-2.5 py-1 rounded-full font-medium">Approval on</span> : null}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Settings view ─────────────────────────────────────────────────────────────

function SettingsView({ selectedProject, projects, authHeaders, workspaceId, onSaved, onDeleted }: { selectedProject: string; projects: Project[]; authHeaders: Record<string, string>; workspaceId: string; onSaved: () => Promise<void>; onDeleted: (id: string) => void }) {
  const project = projects.find((p) => p.id === selectedProject);
  const [saved, setSaved]             = useState(false);
  const [notifyEmail, setNotifyEmail] = useState(project?.notify_email || "");
  const [brandName, setBrandName]     = useState(project?.brand_name || "");
  const [brandColor, setBrandColor]   = useState(project?.brand_color || "#6366f1");
  const [requireApproval, setRequireApproval] = useState(!!project?.require_approval);
  const [requireVerification, setRequireVerification] = useState(!!project?.require_verification);
  const [wsToken, setWsToken]         = useState<string | null>(null);
  const [wsTokenCopied, setWsTokenCopied] = useState(false);
  const [wsTokenRotating, setWsTokenRotating] = useState(false);
  const [tgBotToken, setTgBotToken]   = useState("");
  const [tgChatId, setTgChatId]       = useState("");
  const [tgProjectId, setTgProjectId] = useState("");
  const [tgScreenshot, setTgScreenshot] = useState(false);
  const [tgSaved, setTgSaved]         = useState(false);

  useEffect(() => {
    fetch(`/api/workspaces/${workspaceId}/token`, { headers: authHeaders })
      .then((r) => r.json())
      .then((d) => setWsToken(d.token))
      .catch(() => {});
    fetch(`/api/workspaces/${workspaceId}/telegram`, { headers: authHeaders })
      .then((r) => r.json())
      .then((d) => {
        setTgBotToken(d.bot_token || "");
        setTgChatId(d.chat_id || "");
        setTgProjectId(d.project_id || "");
        setTgScreenshot(!!d.screenshot_verification);
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId]);

  async function saveTelegram() {
    await fetch(`/api/workspaces/${workspaceId}/telegram`, {
      method: "PATCH",
      headers: { ...authHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ bot_token: tgBotToken || null, chat_id: tgChatId || null, project_id: tgProjectId || null, screenshot_verification: tgScreenshot }),
    });
    setTgSaved(true);
    setTimeout(() => setTgSaved(false), 2500);
  }

  async function rotateToken() {
    if (!window.confirm("Rotate workspace token? Your current .mcp.json will stop working until you update it.")) return;
    setWsTokenRotating(true);
    const r = await fetch(`/api/workspaces/${workspaceId}/token/rotate`, { method: "POST", headers: authHeaders });
    const d = await r.json();
    setWsToken(d.token);
    setWsTokenRotating(false);
  }

  function copyToken() {
    if (!wsToken) return;
    navigator.clipboard.writeText(wsToken);
    setWsTokenCopied(true);
    setTimeout(() => setWsTokenCopied(false), 2000);
  }
  const [customFields, setCustomFields] = useState<CustomField[]>(() => {
    try { return project?.custom_fields ? JSON.parse(project.custom_fields) : []; } catch { return []; }
  });
  const [newFieldName, setNewFieldName]     = useState("");
  const [newFieldType, setNewFieldType]     = useState<"dropdown" | "text">("dropdown");
  const [newFieldOptions, setNewFieldOptions] = useState(""); // comma-separated
  const [newFieldRequired, setNewFieldRequired] = useState(false);

  useEffect(() => {
    if (project) {
      setNotifyEmail(project.notify_email || "");
      setBrandName(project.brand_name || "");
      setBrandColor(project.brand_color || "#6366f1");
      setRequireApproval(!!project.require_approval);
      setRequireVerification(!!project.require_verification);
      try { setCustomFields(project.custom_fields ? JSON.parse(project.custom_fields) : []); } catch { setCustomFields([]); }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.id]);

  if (!project) return <div className="text-slate-400 text-sm">Select a project from the sidebar to edit its settings.</div>;

  function addField() {
    const name = newFieldName.trim();
    if (!name) return;
    const field: CustomField = { name, type: newFieldType, required: newFieldRequired };
    if (newFieldType === "dropdown") {
      field.options = newFieldOptions.split(",").map((o) => o.trim()).filter(Boolean);
    }
    setCustomFields([...customFields, field]);
    setNewFieldName(""); setNewFieldType("dropdown"); setNewFieldOptions(""); setNewFieldRequired(false);
  }

  async function deleteProject() {
    if (!window.confirm(`Delete project "${project!.name}"? This cannot be undone and will remove all tasks.`)) return;
    await fetch(`/api/projects/${project!.id}`, { method: "DELETE", headers: authHeaders });
    onDeleted(project!.id);
  }

  function removeField(i: number) {
    setCustomFields(customFields.filter((_, idx) => idx !== i));
  }

  async function save() {
    await fetch(`/api/projects/${project!.id}`, {
      method: "PATCH", headers: { ...authHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({
        notify_email: notifyEmail || undefined,
        brand_name: brandName || undefined,
        brand_color: brandColor,
        require_approval: requireApproval,
        require_verification: requireVerification,
        custom_fields: JSON.stringify(customFields),
      }),
    });
    await onSaved();
    setSaved(true); setTimeout(() => setSaved(false), 2500);
  }

  async function autoSaveToggle(field: "require_approval" | "require_verification", value: boolean) {
    await fetch(`/api/projects/${project!.id}`, {
      method: "PATCH", headers: { ...authHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: value }),
    });
    await onSaved();
  }

  const submitUrl = `${window.location.origin}/submit/${project.token}`;

  return (
    <div className="max-w-xl">
      <h2 className="text-xl font-bold text-white mb-6">Settings — {project.name}</h2>
      <div className="space-y-6">

        {/* Submission link */}
        <div className="bg-[#1a1d2e] border border-[#2a2d3e] rounded-xl p-5 shadow-sm">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Submission link</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs bg-[#0f1117] border border-[#2a2d3e] rounded-lg px-3 py-2 break-all text-slate-300">{submitUrl}</code>
            <button onClick={() => navigator.clipboard.writeText(submitUrl)}
              className="shrink-0 bg-indigo-500 hover:bg-indigo-600 text-white text-xs px-3 py-2 rounded-lg transition-colors">Copy</button>
          </div>
        </div>

        {/* Workspace ID */}
        <div className="bg-[#1a1d2e] border border-[#2a2d3e] rounded-xl p-5 shadow-sm">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Workspace ID</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs bg-[#0f1117] border border-[#2a2d3e] rounded-lg px-3 py-2 break-all text-slate-300">{workspaceId}</code>
            <button onClick={() => navigator.clipboard.writeText(workspaceId)}
              className="shrink-0 bg-slate-600 hover:bg-slate-700 text-white text-xs px-3 py-2 rounded-lg transition-colors">Copy</button>
          </div>
        </div>

        {/* Workspace token — for .mcp.json */}
        <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-5 shadow-sm">
          <p className="text-xs font-semibold text-indigo-600 uppercase tracking-wider mb-1">Workspace Token</p>
          <p className="text-xs text-indigo-500 mb-3">Add this to your <code className="bg-indigo-100 px-1 rounded">.mcp.json</code> as <code className="bg-indigo-100 px-1 rounded">AGENTINBOX_TOKEN</code> to connect Claude Code.</p>
          <div className="flex items-center gap-2 mb-3">
            <code className="flex-1 text-xs bg-[#1a1d2e] border border-indigo-200 rounded-lg px-3 py-2 break-all text-slate-300">
              {wsToken ?? "Loading..."}
            </code>
            <button onClick={copyToken}
              className="shrink-0 bg-indigo-500 hover:bg-indigo-600 text-white text-xs px-3 py-2 rounded-lg transition-colors">
              {wsTokenCopied ? "Copied ✓" : "Copy"}
            </button>
          </div>
          <div className="bg-indigo-100 rounded-lg px-4 py-3 text-xs text-indigo-700 font-mono mb-3 whitespace-pre">{`{
  "mcpServers": {
    "agentinbox": {
      "command": "npx",
      "args": ["-y", "agentinbox-mcp"],
      "env": {
        "AGENTINBOX_TOKEN": "${wsToken ?? "wt_..."}"
      }
    }
  }
}`}</div>
          <div className="flex items-center gap-4 mt-1">
            <button onClick={rotateToken} disabled={wsTokenRotating}
              className="text-xs text-indigo-500 hover:text-indigo-700 underline transition-colors disabled:opacity-50">
              {wsTokenRotating ? "Rotating..." : "Rotate token"}
            </button>
            <a href="/api/setup/download"
              onClick={(e) => {
                e.preventDefault();
                const token = localStorage.getItem("auth_token");
                if (!token) return;
                fetch("/api/setup/download", { headers: { Authorization: `Bearer ${token}` } })
                  .then(r => r.blob()).then(blob => {
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url; a.download = "agentinbox-setup.md";
                    document.body.appendChild(a); a.click();
                    document.body.removeChild(a); URL.revokeObjectURL(url);
                  });
              }}
              className="text-xs text-emerald-600 hover:text-emerald-700 font-semibold underline transition-colors">
              ↓ Download setup file
            </a>
          </div>
        </div>

        {/* Telegram */}
        <div className="bg-[#1a1d2e] border border-[#2a2d3e] rounded-xl p-5 shadow-sm space-y-4">
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Telegram</p>
            <p className="text-xs text-slate-400">Message your bot from your phone to trigger Claude. Get notified on every task event. Approve or reject plans via reply.</p>
          </div>

          <Field label="Bot token" hint="From @BotFather — create a bot and copy the token">
            <input type="text" value={tgBotToken} onChange={(e) => setTgBotToken(e.target.value)}
              className="w-full bg-[#0f1117] border border-[#2a2d3e] rounded-xl px-4 py-3 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="1234567890:ABCdef..." />
          </Field>

          <Field label="Your chat ID" hint="Message @userinfobot on Telegram to get your chat ID">
            <input type="text" value={tgChatId} onChange={(e) => setTgChatId(e.target.value)}
              className="w-full bg-[#0f1117] border border-[#2a2d3e] rounded-xl px-4 py-3 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="6121077387" />
          </Field>

          <Field label="Default project for Telegram tasks" hint="Tasks you create via Telegram message go to this project">
            <select value={tgProjectId} onChange={(e) => setTgProjectId(e.target.value)}
              className="w-full bg-[#0f1117] border border-[#2a2d3e] rounded-xl px-4 py-3 text-sm text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500">
              <option value="">— select a project —</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </Field>

          <label className="flex items-center gap-3 cursor-pointer select-none">
            <div onClick={() => setTgScreenshot(v => !v)}
              className={`relative w-10 h-6 rounded-full transition-colors ${tgScreenshot ? "bg-indigo-500" : "bg-slate-700"}`}>
              <span className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${tgScreenshot ? "translate-x-4" : ""}`} />
            </div>
            <span className="text-sm text-slate-300">Take screenshot after fix for Telegram tasks</span>
          </label>

          <button onClick={saveTelegram}
            className="bg-indigo-500 hover:bg-indigo-600 text-white font-semibold px-5 py-2 rounded-xl text-sm transition-colors">
            {tgSaved ? "Saved ✓" : "Save Telegram"}
          </button>
        </div>

        {/* Project settings */}
        <div className="bg-[#1a1d2e] border border-[#2a2d3e] rounded-xl p-5 shadow-sm space-y-5">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Project settings</p>

          <Field label="Notification email" hint="Receives emails on task completion, escalation, approval requests">
            <input type="email" value={notifyEmail} onChange={(e) => setNotifyEmail(e.target.value)}
              className="w-full bg-[#1a1d2e] border border-[#2a2d3e] rounded-xl px-4 py-3 text-sm text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent shadow-sm"
              placeholder="pm@agency.com" />
          </Field>

          <Field label="Client-facing name" hint="What clients see on the submission form">
            <input type="text" value={brandName} onChange={(e) => setBrandName(e.target.value)}
              className="w-full bg-[#1a1d2e] border border-[#2a2d3e] rounded-xl px-4 py-3 text-sm text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent shadow-sm"
              placeholder="Leave blank to use project name" />
          </Field>

          <Field label="Brand color">
            <div className="flex items-center gap-3">
              <input type="color" value={brandColor} onChange={(e) => setBrandColor(e.target.value)}
                className="h-9 w-16 rounded cursor-pointer border border-slate-300" />
              <span className="text-sm text-slate-500 font-mono">{brandColor}</span>
            </div>
          </Field>

          <Field label="Approval gate" hint="Claude proposes a plan, PM must approve before any code changes">
            <label className="flex items-center gap-3 cursor-pointer">
              <div onClick={() => { const v = !requireApproval; setRequireApproval(v); autoSaveToggle("require_approval", v); }}
                className={`relative w-10 h-6 rounded-full transition-colors cursor-pointer ${requireApproval ? "bg-indigo-500" : "bg-slate-300"}`}>
                <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${requireApproval ? "translate-x-5" : "translate-x-1"}`} />
              </div>
              <span className="text-sm text-slate-300">{requireApproval ? "Required" : "Disabled"}</span>
            </label>
          </Field>
        </div>

        {/* Custom fields */}
        <div className="bg-[#1a1d2e] border border-[#2a2d3e] rounded-xl p-5 shadow-sm">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Custom fields</p>
          <p className="text-xs text-slate-400 mb-4">Add dropdowns or text fields to the submission form. Claude receives these as structured metadata to route tasks accurately.</p>

          {customFields.length > 0 && (
            <div className="space-y-2 mb-4">
              {customFields.map((f, i) => (
                <div key={i} className="flex items-center justify-between bg-[#0f1117] border border-[#2a2d3e] rounded-xl px-4 py-3">
                  <div>
                    <span className="text-sm font-medium text-slate-100">{f.name}</span>
                    <span className="ml-2 text-xs text-slate-400">{f.type}</span>
                    {f.required && <span className="ml-1 text-xs text-red-400">required</span>}
                    {f.options && f.options.length > 0 && (
                      <p className="text-xs text-slate-400 mt-0.5">{f.options.join(", ")}</p>
                    )}
                  </div>
                  <button onClick={() => removeField(i)} className="text-slate-400 hover:text-red-500 text-lg leading-none ml-3 transition-colors">×</button>
                </div>
              ))}
            </div>
          )}

          <div className="bg-[#0f1117] border border-[#2a2d3e] rounded-xl p-4 space-y-3">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Add field</p>
            <div className="flex gap-2">
              <input
                type="text"
                value={newFieldName}
                onChange={(e) => setNewFieldName(e.target.value)}
                placeholder="Field name (e.g. Module)"
                className="flex-1 bg-[#1a1d2e] border border-[#2a2d3e] rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
              <select
                value={newFieldType}
                onChange={(e) => setNewFieldType(e.target.value as "dropdown" | "text")}
                className="bg-[#1a1d2e] border border-[#2a2d3e] rounded-lg px-3 py-2 text-sm text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              >
                <option value="dropdown">Dropdown</option>
                <option value="text">Text</option>
              </select>
            </div>
            {newFieldType === "dropdown" && (
              <input
                type="text"
                value={newFieldOptions}
                onChange={(e) => setNewFieldOptions(e.target.value)}
                placeholder="Options, comma-separated (e.g. personal-info, account-info)"
                className="w-full bg-[#1a1d2e] border border-[#2a2d3e] rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
            )}
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer">
                <input type="checkbox" checked={newFieldRequired} onChange={(e) => setNewFieldRequired(e.target.checked)} className="rounded" />
                Required
              </label>
              <button
                onClick={addField}
                disabled={!newFieldName.trim()}
                className="bg-indigo-500 hover:bg-indigo-600 disabled:opacity-40 text-white text-xs px-4 py-2 rounded-lg transition-colors"
              >
                Add field
              </button>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button onClick={save} className="bg-indigo-500 hover:bg-indigo-600 text-white font-semibold px-6 py-2.5 rounded-xl transition-colors">
            {saved ? "Saved ✓" : "Save settings"}
          </button>
          <button onClick={deleteProject} className="text-red-500 hover:text-red-700 text-sm font-medium px-4 py-2.5 rounded-xl border border-red-200 hover:border-red-400 transition-colors">
            Delete project
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// Shows "Claude working · 43s" while a task is in_progress — kills the black-box feeling
function ElapsedTimer({ updatedAt }: { updatedAt: number }) {
  const [elapsed, setElapsed] = useState(Math.floor(Date.now() / 1000) - updatedAt);
  useEffect(() => {
    const iv = setInterval(() => setElapsed(Math.floor(Date.now() / 1000) - updatedAt), 1000);
    return () => clearInterval(iv);
  }, [updatedAt]);
  const fmt = elapsed < 60 ? `${elapsed}s` : `${Math.floor(elapsed / 60)}m ${elapsed % 60}s`;
  return (
    <span className="text-xs text-indigo-400 animate-pulse font-medium">
      ⚙ Claude working · {fmt}
    </span>
  );
}

const STATUS_COLORS: Record<string, string> = {
  pending:           "bg-slate-700/50 text-slate-400",
  awaiting_approval: "bg-yellow-500/20 text-yellow-400",
  in_progress:       "bg-indigo-500/20 text-indigo-400",
  done:              "bg-green-500/20 text-green-400",
  failed:            "bg-red-500/20 text-red-400",
  blocked:           "bg-yellow-500/20 text-yellow-400",
  escalated:         "bg-orange-500/20 text-orange-400",
};

function StatCard({ label, value, color = "text-white" }: { label: string; value: number; color?: string }) {
  return (
    <div className="bg-[#1a1d2e] border border-[#2a2d3e] rounded-xl p-5 text-center shadow-sm">
      <div className={`text-3xl font-bold mb-1 ${color}`}>{value}</div>
      <div className="text-xs text-slate-500">{label}</div>
    </div>
  );
}

function StatMini({ label, value, color = "text-slate-300" }: { label: string; value: number; color?: string }) {
  return (
    <div className="bg-slate-800 rounded-lg p-2.5 text-center">
      <div className={`text-lg font-bold ${color}`}>{value}</div>
      <div className="text-xs text-slate-500">{label}</div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white/3 border border-white/5 rounded-xl p-4">
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-3">{title}</p>
      {children}
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-widest mb-1.5">{label}</label>
      {hint && <p className="text-xs text-slate-600 mb-2">{hint}</p>}
      {children}
    </div>
  );
}

function NavBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick}
      className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-all ${
        active
          ? "bg-white/10 text-white font-medium"
          : "text-slate-500 hover:text-slate-300 hover:bg-white/5"
      }`}>
      {children}
    </button>
  );
}

function FeedbackView({ authHeaders }: { authHeaders: Record<string, string> }) {
  const [category, setCategory] = useState("General");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "done" | "error">("idle");

  async function submit() {
    if (!message.trim()) return;
    setStatus("sending");
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ category, message }),
      });
      setStatus(res.ok ? "done" : "error");
    } catch {
      setStatus("error");
    }
  }

  if (status === "done") return (
    <div className="max-w-lg">
      <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-8 text-center">
        <div className="text-3xl mb-3">✅</div>
        <p className="text-white font-semibold mb-1">Thanks for your feedback!</p>
        <p className="text-slate-400 text-sm">We'll get back to you soon.</p>
        <button onClick={() => { setMessage(""); setStatus("idle"); }} className="mt-4 text-xs text-slate-500 hover:text-slate-300 transition-colors">Send another</button>
      </div>
    </div>
  );

  return (
    <div className="max-w-lg">
      <h2 className="text-xl font-bold text-white mb-1">Feedback</h2>
      <p className="text-slate-400 text-sm mb-6">Having issues with setup? Got a question or suggestion? Let us know.</p>

      <div className="space-y-4">
        <div>
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 block">Category</label>
          <div className="flex gap-2 flex-wrap">
            {["General", "Setup issue", "Bug", "Feature request", "Question"].map(c => (
              <button key={c} onClick={() => setCategory(c)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${category === c ? "bg-indigo-500 text-white" : "bg-white/5 text-slate-400 hover:bg-white/10"}`}>
                {c}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 block">Message</label>
          <textarea
            value={message}
            onChange={e => setMessage(e.target.value)}
            rows={6}
            placeholder="Describe your issue, question, or suggestion..."
            className="w-full bg-[#1a1d2e] border border-[#2a2d3e] rounded-xl px-4 py-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 resize-none"
          />
        </div>

        <button onClick={submit} disabled={!message.trim() || status === "sending"}
          className="bg-indigo-500 hover:bg-indigo-400 disabled:opacity-50 text-white text-sm font-semibold px-6 py-2.5 rounded-xl transition-colors">
          {status === "sending" ? "Sending..." : "Send feedback"}
        </button>

        {status === "error" && <p className="text-red-400 text-sm">Something went wrong. Try again.</p>}
      </div>
    </div>
  );
}

interface ChatSession { id: string; title: string; updated_at: number; last_message?: string; }
interface ChatMessage { id: string; role: "user" | "assistant"; content: string; created_at: number; }

function ChatView({ authHeaders, socketRef }: { authHeaders: Record<string, string>; socketRef: React.RefObject<Socket | null> }) {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSession, setActiveSession] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [waiting, setWaiting] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/chat/sessions", { headers: authHeaders })
      .then(r => r.json()).then(setSessions).catch(() => {});
  }, []);

  useEffect(() => {
    if (!activeSession) return;
    fetch(`/api/chat/sessions/${activeSession}/messages`, { headers: authHeaders })
      .then(r => r.json()).then(setMessages).catch(() => {});
  }, [activeSession]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, waiting]);

  useEffect(() => {
    const socket = socketRef.current;
    if (!socket) return;
    function onReply(data: { sessionId: string; message: ChatMessage }) {
      if (data.sessionId !== activeSession) return;
      setMessages(prev => [...prev, data.message]);
      setWaiting(false);
      setSessions(prev => prev.map(s => s.id === data.sessionId ? { ...s, last_message: data.message.content, updated_at: Math.floor(Date.now() / 1000) } : s));
    }
    socket.on("chat.reply", onReply);
    return () => { socket.off("chat.reply", onReply); };
  }, [socketRef.current, activeSession]);

  async function newSession() {
    const res = await fetch("/api/chat/sessions", { method: "POST", headers: { ...authHeaders, "Content-Type": "application/json" }, body: JSON.stringify({}) });
    const session = await res.json();
    setSessions(prev => [session, ...prev]);
    setActiveSession(session.id);
    setMessages([]);
  }

  async function deleteSession(e: React.MouseEvent, sessionId: string) {
    e.stopPropagation();
    await fetch(`/api/chat/sessions/${sessionId}`, { method: "DELETE", headers: authHeaders });
    setSessions(prev => prev.filter(s => s.id !== sessionId));
    if (activeSession === sessionId) { setActiveSession(null); setMessages([]); }
  }

  async function sendMessage() {
    if (!input.trim() || waiting || !activeSession) return;
    const content = input.trim();
    setInput("");
    setWaiting(true);
    const userMsg: ChatMessage = { id: Date.now().toString(), role: "user", content, created_at: Math.floor(Date.now() / 1000) };
    setMessages(prev => [...prev, userMsg]);
    await fetch(`/api/chat/sessions/${activeSession}/messages`, {
      method: "POST",
      headers: { ...authHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  }

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* Session list */}
      <div className="w-56 shrink-0 border-r border-white/5 flex flex-col bg-[#0d0f1a]">
        <div className="p-3 border-b border-white/5">
          <button onClick={newSession} className="w-full bg-indigo-500 hover:bg-indigo-400 text-white text-sm font-semibold py-2 px-3 rounded-lg transition-colors">
            + New Chat
          </button>
        </div>
        <div className="flex-1 overflow-y-auto py-1">
          {sessions.length === 0 && <p className="text-slate-600 text-xs px-4 py-6 text-center">No chats yet</p>}
          {sessions.map(s => (
            <div key={s.id} className={`relative group flex items-center ${activeSession === s.id ? "bg-indigo-500/15" : "hover:bg-white/5"}`}>
              <button onClick={() => setActiveSession(s.id)}
                className={`flex-1 text-left px-3 py-2.5 transition-colors min-w-0 ${activeSession === s.id ? "text-white" : "text-slate-400 hover:text-white"}`}>
                <div className="text-xs font-medium truncate pr-5">{s.title}</div>
                {s.last_message && <div className="text-xs text-slate-600 truncate mt-0.5">{s.last_message}</div>}
              </button>
              <button onClick={e => deleteSession(e, s.id)}
                className="absolute right-2 opacity-0 group-hover:opacity-100 text-slate-600 hover:text-red-400 transition-all p-1 rounded"
                title="Delete conversation">
                ✕
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Chat area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {!activeSession ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
            <div className="text-4xl mb-4">💬</div>
            <h2 className="text-white font-bold text-lg mb-2">Chat with your Claude</h2>
            <p className="text-slate-400 text-sm max-w-sm mb-6">Ask questions about your codebase, get explanations, brainstorm — all from here. No API key needed, uses your Claude Code subscription.</p>
            <button onClick={newSession} className="bg-indigo-500 hover:bg-indigo-400 text-white text-sm font-semibold py-2.5 px-6 rounded-xl transition-colors">
              Start a chat
            </button>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {messages.length === 0 && !waiting && (
                <div className="text-center text-slate-600 text-sm mt-12">Ask Claude anything about your codebase</div>
              )}
              {messages.map(m => (
                <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm whitespace-pre-wrap ${
                    m.role === "user"
                      ? "bg-indigo-500 text-white rounded-br-sm"
                      : "bg-[#1a1d2e] text-slate-200 rounded-bl-sm border border-white/5"
                  }`}>
                    {m.content}
                  </div>
                </div>
              ))}
              {waiting && (
                <div className="flex justify-start">
                  <div className="bg-[#1a1d2e] border border-white/5 rounded-2xl rounded-bl-sm px-4 py-3 flex gap-1 items-center">
                    <span className="w-1.5 h-1.5 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                    <span className="w-1.5 h-1.5 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                    <span className="w-1.5 h-1.5 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            <div className="border-t border-white/5 p-4">
              <div className="flex gap-2 items-end">
                <textarea
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask Claude anything... (Enter to send, Shift+Enter for new line)"
                  rows={2}
                  disabled={waiting}
                  className="flex-1 bg-[#1a1d2e] border border-[#2a2d3e] focus:border-indigo-500 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-600 focus:outline-none resize-none disabled:opacity-50"
                />
                <button onClick={sendMessage} disabled={!input.trim() || waiting}
                  className="bg-indigo-500 hover:bg-indigo-400 disabled:opacity-50 text-white p-3 rounded-xl transition-colors shrink-0">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                </button>
              </div>
              <p className="text-xs text-slate-600 mt-2">Worker must be running on your PC for Claude to reply</p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
