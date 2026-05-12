import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";

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
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4 py-16">
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
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="h-1.5 bg-gradient-to-r from-indigo-500 to-indigo-400" />
          <div className="p-8">

            {/* Step 1: Workspace */}
            {step === "workspace" && (
              <div className="space-y-5">
                <div>
                  <h2 className="text-xl font-bold text-slate-900 mb-1">Name your workspace</h2>
                  <p className="text-slate-500 text-sm">This is your agency or company — you'll run multiple client projects under it.</p>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Workspace name</label>
                  <input
                    type="text"
                    value={wsName}
                    onChange={(e) => setWsName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && createWorkspace()}
                    className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent shadow-sm"
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
                  <h2 className="text-xl font-bold text-slate-900 mb-1">Add your first project</h2>
                  <p className="text-slate-500 text-sm">Each project gets its own submission link for a client or codebase.</p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Project name <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    value={projName}
                    onChange={(e) => setProjName(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent shadow-sm"
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
                    className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent shadow-sm"
                    placeholder="e.g. Mobile form generation app"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Notification email <span className="text-slate-400 font-normal normal-case">(optional)</span></label>
                  <input
                    type="email"
                    value={notifyEmail}
                    onChange={(e) => setNotifyEmail(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent shadow-sm"
                    placeholder="you@email.com — get notified on task events"
                  />
                </div>

                <div className="flex items-center justify-between py-3 border-t border-slate-100">
                  <div>
                    <p className="text-sm font-medium text-slate-700">Require PM approval</p>
                    <p className="text-xs text-slate-400">Claude proposes a plan, you approve before any code runs</p>
                  </div>
                  <div
                    onClick={() => setApproval(!approval)}
                    className={`relative w-10 h-6 rounded-full transition-colors cursor-pointer ${approval ? "bg-indigo-500" : "bg-slate-300"}`}
                  >
                    <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${approval ? "translate-x-5" : "translate-x-1"}`} />
                  </div>
                </div>

                <div className="flex items-center gap-3 py-3 border-t border-slate-100">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-slate-700">Brand color</p>
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
                  <h2 className="text-xl font-bold text-slate-900 mb-1">You're all set!</h2>
                  <p className="text-slate-500 text-sm">Send this link to your client. That's all they need.</p>
                </div>

                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
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

                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Connect Claude</p>
                  <pre className="text-xs text-slate-700 overflow-x-auto">{`{
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
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-indigo-500 font-extrabold text-2xl tracking-tight mb-1">AgentInbox</div>
          <p className="text-slate-500 text-sm">PM Dashboard</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="h-1.5 bg-gradient-to-r from-indigo-500 to-indigo-400" />
          <div className="p-6 space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Workspace ID</label>
              <input
                type="text"
                value={wsId}
                onChange={(e) => setWsId(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent shadow-sm"
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
                className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent shadow-sm"
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
  const [view, setView]                 = useState<"tasks" | "stats" | "settings" | "new-project">("tasks");
  const [error, setError]               = useState("");
  const [newProjOpen, setNewProjOpen]   = useState(false);

  const authHeaders = useCallback((): Record<string, string> => {
    const h: Record<string, string> = { "Content-Type": "application/json" };
    const token = localStorage.getItem("auth_token");
    if (token) h["Authorization"] = `Bearer ${token}`;
    return h;
  }, []);

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
    <div className="h-screen flex bg-slate-50 overflow-hidden">
      {/* ── Sidebar (dark) ── */}
      <div className="w-64 bg-slate-900 text-white flex flex-col shrink-0">
        {/* Logo + workspace */}
        <div className="px-5 py-5 border-b border-slate-800">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-white font-extrabold text-base tracking-tight">AgentInbox</div>
              <div className="text-xs text-slate-500 truncate max-w-[140px] mt-0.5" title={workspaceId}>
                {workspaceId.slice(0, 14)}…
              </div>
            </div>
            <div className="flex items-center gap-2">
              {stats?.plan && (
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                  stats.plan === "paid"
                    ? "bg-indigo-500 text-white"
                    : "bg-slate-700 text-slate-300"
                }`}>
                  {stats.plan === "paid" ? "Pro" : "Free"}
                </span>
              )}
              <button onClick={onLogout} title="Log out" className="text-xs text-slate-400 hover:text-white hover:bg-slate-700 px-2 py-1 rounded transition-colors">Logout</button>
            </div>
          </div>
        </div>

        {/* Stats mini-cards */}
        {stats && (
          <div className="px-4 py-4 border-b border-slate-800">
            <div className="grid grid-cols-2 gap-2">
              <StatMini label="Total" value={stats.total_tasks} />
              <StatMini label="Done" value={stats.done} color="text-green-400" />
              <StatMini label="Active" value={stats.in_progress} color="text-indigo-400" />
              <StatMini label="Escalated" value={stats.escalated} color="text-orange-400" />
            </div>
          </div>
        )}

        {/* Project list */}
        <div className="px-3 py-4 flex-1 overflow-y-auto">
          <div className="flex items-center justify-between mb-2 px-2">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Projects</p>
            <button
              onClick={() => setNewProjOpen(true)}
              className="text-slate-400 hover:text-indigo-400 text-xl font-bold leading-none transition-colors"
              title="New project"
            >+</button>
          </div>
          {projects.length === 0 && (
            <p className="text-xs text-slate-500 px-2">No projects yet.</p>
          )}
          {projects.map((p) => (
            <button key={p.id}
              onClick={() => { setSelectedProject(p.id); setSelectedTask(null); setView("tasks"); }}
              className={`w-full text-left px-3 py-2.5 rounded-lg text-sm mb-0.5 transition-colors ${
                selectedProject === p.id
                  ? "bg-indigo-600 text-white font-medium"
                  : "text-slate-300 hover:bg-slate-800"
              }`}
            >
              <span className="truncate block">{p.brand_name || p.name}</span>
              {p.require_approval ? <span className="text-xs text-yellow-400 opacity-80">● approval on</span> : null}
            </button>
          ))}
        </div>

        {/* Bottom nav */}
        <div className="px-3 py-3 border-t border-slate-800 space-y-1">
          <NavBtn active={view === "stats"} onClick={() => setView("stats")}>Usage stats</NavBtn>
          <NavBtn active={view === "settings"} onClick={() => setView("settings")}>Settings</NavBtn>
        </div>
      </div>

      {/* ── Main content ── */}
      <div className="flex-1 flex flex-col overflow-hidden relative">

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
                atLimit ? "bg-red-50 border-b border-red-200 text-red-800" : "bg-amber-50 border-b border-amber-200 text-amber-800"
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
                {/* Submission link bar */}
                <SubmissionLinkBar project={projects.find((p) => p.id === selectedProject)} />

                {/* Filter bar */}
                <div className="bg-white border-b border-slate-200 px-5 py-3 flex items-center gap-2 flex-wrap">
                  {["", "pending", "awaiting_approval", "in_progress", "done", "failed", "escalated"].map((s) => (
                    <button key={s || "all"}
                      onClick={() => setStatusFilter(s)}
                      className={`text-xs px-3 py-1.5 rounded-full font-medium transition-colors ${
                        statusFilter === s
                          ? "bg-indigo-500 text-white"
                          : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                      }`}>
                      {s || "All"}
                    </button>
                  ))}
                </div>

                {/* Task list + detail */}
                <div className="flex flex-1 overflow-hidden">
                  {/* Task cards */}
                  <div className="flex-1 overflow-y-auto p-5 bg-slate-50">
                    {error && <p className="text-red-500 text-sm mb-4">{error}</p>}
                    {tasks.length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-full text-slate-400 text-center py-20">
                        <p className="text-sm mb-1">No tasks yet.</p>
                        <p className="text-xs">Share the submission link with your client to get started.</p>
                      </div>
                    ) : (
                      <div className="space-y-3 max-w-2xl">
                        {tasks.map((t) => (
                          <button key={t.id} onClick={() => loadTask(t.id)}
                            className={`w-full text-left bg-white rounded-xl shadow-sm px-5 py-4 border transition-all hover:shadow-md ${
                              selectedTask?.id === t.id
                                ? "border-indigo-300 ring-1 ring-indigo-200"
                                : "border-slate-200"
                            }`}>
                            <div className="flex items-start justify-between gap-3 mb-1.5">
                              <span className="text-sm font-semibold text-slate-900 leading-snug line-clamp-1">{t.title}</span>
                              <div className="flex items-center gap-1.5 shrink-0">
                                {t.priority === "high" && <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-red-100 text-red-700">high</span>}
                                {t.priority === "low" && <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-slate-100 text-slate-500">low</span>}
                                <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${STATUS_COLORS[t.status] || "bg-slate-100 text-slate-600"}`}>
                                  {t.status.replace(/_/g, " ")}
                                </span>
                              </div>
                            </div>
                            <div className="flex items-center gap-3 text-xs text-slate-400">
                              {t.submitter_name && <span>{t.submitter_name}</span>}
                              {t.custom_field_values && (() => {
                                try {
                                  const vals = JSON.parse(t.custom_field_values);
                                  return Object.entries(vals).map(([k, v]) => (
                                    <span key={k} className="bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded text-xs">{String(v)}</span>
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
                    <div className="fixed right-0 top-0 h-full w-[480px] bg-white shadow-xl border-l border-slate-200 overflow-y-auto z-40 flex flex-col">
                      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
                        <h2 className="text-sm font-semibold text-slate-700">Task detail</h2>
                        <button
                          onClick={() => setSelectedTask(null)}
                          className="text-slate-400 hover:text-slate-600 text-xl leading-none transition-colors"
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
    <div className="bg-indigo-50 border-b border-indigo-100 px-5 py-2.5 flex items-center gap-3">
      <span className="text-xs font-semibold text-indigo-700 shrink-0">Client link:</span>
      <code className="flex-1 text-xs text-indigo-800 truncate">{url}</code>
      <button onClick={copy}
        className="shrink-0 text-xs bg-indigo-500 hover:bg-indigo-600 text-white px-3 py-1.5 rounded-lg transition-colors">
        {copied ? "Copied!" : "Copy"}
      </button>
      <a href={url} target="_blank" rel="noreferrer"
        className="shrink-0 text-xs text-indigo-600 hover:underline">Open ↗</a>
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
        className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="h-1.5 bg-gradient-to-r from-indigo-500 to-indigo-400 rounded-t-2xl" />
        <div className="p-6 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900">{created ? "Project created!" : "New project"}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none transition-colors">×</button>
        </div>

        <div className="p-6">
          {!created ? (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Project name <span className="text-red-500">*</span></label>
                <input type="text" value={name} onChange={(e) => setName(e.target.value)} autoFocus
                  className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent shadow-sm"
                  placeholder="e.g. form-gen-mbl" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Description</label>
                <input type="text" value={desc} onChange={(e) => setDesc(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent shadow-sm"
                  placeholder="Optional" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Client-facing name <span className="text-slate-400 font-normal normal-case">(white label)</span></label>
                <input type="text" value={brandName} onChange={(e) => setBrandName(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent shadow-sm"
                  placeholder="What clients see — leave blank to use project name" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Notification email</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent shadow-sm"
                  placeholder="PM email for task alerts" />
              </div>
              <div className="flex items-center justify-between py-3 border-t border-slate-100">
                <div>
                  <p className="text-sm font-medium text-slate-700">Require PM approval</p>
                  <p className="text-xs text-slate-400">Claude plans first, you approve before code runs</p>
                </div>
                <div onClick={() => setApproval(!approval)}
                  className={`relative w-10 h-6 rounded-full transition-colors cursor-pointer ${approval ? "bg-indigo-500" : "bg-slate-300"}`}>
                  <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${approval ? "translate-x-5" : "translate-x-1"}`} />
                </div>
              </div>
              <div className="flex items-center gap-3 py-3 border-t border-slate-100">
                <div className="flex-1">
                  <p className="text-sm font-medium text-slate-700">Brand color</p>
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
              <p className="text-slate-600 text-sm">Share this link with your client. That's all they need.</p>
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
                  className="flex-1 text-center border border-slate-300 hover:bg-slate-50 text-slate-700 text-sm font-medium py-2.5 rounded-xl transition-colors">
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
          <h1 className="text-lg font-bold text-slate-900 leading-snug">{task.title}</h1>
          <div className="flex items-center gap-1.5 shrink-0">
            {task.priority === "high" && <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-red-100 text-red-700">high</span>}
            {task.priority === "low" && <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-slate-100 text-slate-500">low</span>}
            <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${STATUS_COLORS[task.status] || "bg-slate-100 text-slate-600"}`}>
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
          <button onClick={onReject} className="flex-1 bg-red-100 hover:bg-red-200 text-red-700 text-sm font-medium px-4 py-2.5 rounded-xl transition-colors">Reject</button>
        </div>
      )}

      {["done", "failed", "escalated"].includes(task.status) && (
        <button onClick={onReopen} className="w-full bg-amber-50 hover:bg-amber-100 text-amber-700 text-sm font-medium px-4 py-2.5 rounded-xl transition-colors border border-amber-200">
          Re-open task
        </button>
      )}

      {customFields && Object.keys(customFields).length > 0 && (
        <Card title="Submission details">
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(customFields).map(([k, v]) => (
              <div key={k}>
                <p className="text-xs text-slate-400 mb-0.5">{k}</p>
                <p className="text-sm font-medium text-slate-700">{String(v)}</p>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card title="Description"><p className="text-slate-700 text-sm whitespace-pre-wrap">{task.description}</p></Card>
      {task.file_name && <Card title="Attached file"><p className="text-slate-600 text-sm">📎 {task.file_name}</p></Card>}
      {task.proposed_plan && <Card title="Claude's proposed plan"><p className="text-sm text-amber-900 whitespace-pre-wrap bg-amber-50 rounded-lg p-3">{task.proposed_plan}</p></Card>}
      {task.rejected_reason && <Card title="Rejection reason"><p className="text-red-700 text-sm">{task.rejected_reason}</p></Card>}
      {task.summary_technical && (
        <Card title="Technical summary">
          <p className="text-slate-700 text-sm font-mono whitespace-pre-wrap">{task.summary_technical}</p>
          {task.pr_link && (
            <a href={task.pr_link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 mt-2 text-indigo-600 hover:underline text-sm font-medium">
              View PR →
            </a>
          )}
        </Card>
      )}
      {task.summary_plain && <Card title="Client summary"><p className="text-slate-700 text-sm">{task.summary_plain}</p></Card>}
      {task.screenshot_base64 && (
        <Card title="Screenshot">
          <img src={`data:image/png;base64,${task.screenshot_base64}`} alt="Fix screenshot" className="rounded-lg w-full border border-slate-200" />
        </Card>
      )}
      {task.escalation_reason && <Card title="Escalation reason"><p className="text-orange-700 text-sm">{task.escalation_reason}</p></Card>}

      {/* Comments */}
      <Card title={`Comments (${comments.length})`}>
        <div className="space-y-3 mb-3">
          {comments.length === 0 && <p className="text-xs text-slate-400">No comments yet.</p>}
          {comments.map(c => (
            <div key={c.id} className="bg-slate-50 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-semibold text-slate-700">{c.author}</span>
                <span className="text-xs text-slate-400">{new Date(c.created_at * 1000).toLocaleString()}</span>
              </div>
              <p className="text-sm text-slate-700 whitespace-pre-wrap">{c.body}</p>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            value={commentAuthor}
            onChange={e => setCommentAuthor(e.target.value)}
            className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs w-20 text-slate-700"
            placeholder="Name"
          />
          <input
            value={commentText}
            onChange={e => setCommentText(e.target.value)}
            onKeyDown={e => e.key === "Enter" && !e.shiftKey && submitComment()}
            className="flex-1 border border-slate-200 rounded-lg px-3 py-1.5 text-sm text-slate-700"
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
                <span className="font-medium text-slate-600">{(e.action || "").replace(/_/g, " ")}</span>
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
      <h2 className="text-xl font-bold text-slate-900 mb-6">Usage dashboard</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-8">
        <StatCard label="Total tasks" value={stats.total_tasks} />
        <StatCard label="Completed" value={stats.done} color="text-green-600" />
        <StatCard label="In progress" value={stats.in_progress} color="text-indigo-600" />
        <StatCard label="Pending" value={stats.pending} />
        <StatCard label="Escalated" value={stats.escalated} color="text-orange-500" />
        <StatCard label="Projects" value={stats.projects} />
      </div>
      <h3 className="font-semibold text-slate-700 mb-3">Projects</h3>
      <div className="space-y-2">
        {projects.map((p) => (
          <div key={p.id} className="bg-white border border-slate-200 rounded-xl px-5 py-4 flex items-center justify-between shadow-sm">
            <div>
              <p className="font-semibold text-slate-900 text-sm">{p.brand_name || p.name}</p>
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
      method: "PATCH", headers: authHeaders,
      body: JSON.stringify({
        notify_email: notifyEmail || undefined,
        brand_name: brandName || undefined,
        brand_color: brandColor,
        require_approval: requireApproval,
        custom_fields: JSON.stringify(customFields),
      }),
    });
    await onSaved();
    setSaved(true); setTimeout(() => setSaved(false), 2500);
  }

  const submitUrl = `${window.location.origin}/submit/${project.token}`;

  return (
    <div className="max-w-xl">
      <h2 className="text-xl font-bold text-slate-900 mb-6">Settings — {project.name}</h2>
      <div className="space-y-6">

        {/* Submission link */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Submission link</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 break-all text-slate-700">{submitUrl}</code>
            <button onClick={() => navigator.clipboard.writeText(submitUrl)}
              className="shrink-0 bg-indigo-500 hover:bg-indigo-600 text-white text-xs px-3 py-2 rounded-lg transition-colors">Copy</button>
          </div>
        </div>

        {/* Workspace ID */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Workspace ID</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 break-all text-slate-700">{workspaceId}</code>
            <button onClick={() => navigator.clipboard.writeText(workspaceId)}
              className="shrink-0 bg-slate-600 hover:bg-slate-700 text-white text-xs px-3 py-2 rounded-lg transition-colors">Copy</button>
          </div>
        </div>

        {/* Project settings */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-5">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Project settings</p>

          <Field label="Notification email" hint="Receives emails on task completion, escalation, approval requests">
            <input type="email" value={notifyEmail} onChange={(e) => setNotifyEmail(e.target.value)}
              className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent shadow-sm"
              placeholder="pm@agency.com" />
          </Field>

          <Field label="Client-facing name" hint="What clients see on the submission form">
            <input type="text" value={brandName} onChange={(e) => setBrandName(e.target.value)}
              className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent shadow-sm"
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
              <div onClick={() => setRequireApproval(!requireApproval)}
                className={`relative w-10 h-6 rounded-full transition-colors cursor-pointer ${requireApproval ? "bg-indigo-500" : "bg-slate-300"}`}>
                <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${requireApproval ? "translate-x-5" : "translate-x-1"}`} />
              </div>
              <span className="text-sm text-slate-700">{requireApproval ? "Required" : "Disabled"}</span>
            </label>
          </Field>
        </div>

        {/* Custom fields */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Custom fields</p>
          <p className="text-xs text-slate-400 mb-4">Add dropdowns or text fields to the submission form. Claude receives these as structured metadata to route tasks accurately.</p>

          {customFields.length > 0 && (
            <div className="space-y-2 mb-4">
              {customFields.map((f, i) => (
                <div key={i} className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
                  <div>
                    <span className="text-sm font-medium text-slate-800">{f.name}</span>
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

          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Add field</p>
            <div className="flex gap-2">
              <input
                type="text"
                value={newFieldName}
                onChange={(e) => setNewFieldName(e.target.value)}
                placeholder="Field name (e.g. Module)"
                className="flex-1 bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
              <select
                value={newFieldType}
                onChange={(e) => setNewFieldType(e.target.value as "dropdown" | "text")}
                className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
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
                className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
            )}
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
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

const STATUS_COLORS: Record<string, string> = {
  pending:           "bg-slate-100 text-slate-600",
  awaiting_approval: "bg-yellow-100 text-yellow-700",
  in_progress:       "bg-indigo-100 text-indigo-700",
  done:              "bg-green-100 text-green-700",
  failed:            "bg-red-100 text-red-700",
  blocked:           "bg-yellow-100 text-yellow-700",
  escalated:         "bg-orange-100 text-orange-700",
};

function StatCard({ label, value, color = "text-slate-900" }: { label: string; value: number; color?: string }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 text-center shadow-sm">
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
    <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">{title}</p>
      {children}
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">{label}</label>
      {hint && <p className="text-xs text-slate-400 mb-2">{hint}</p>}
      {children}
    </div>
  );
}

function NavBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick}
      className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-colors ${
        active
          ? "bg-slate-700 text-white font-medium"
          : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
      }`}>
      {children}
    </button>
  );
}
