import { useState, useEffect, useCallback } from "react";

interface Task {
  id: string;
  project_id: string;
  title: string;
  description: string;
  status: string;
  submitter_name: string | null;
  submitter_email: string | null;
  file_name: string | null;
  proposed_plan: string | null;
  approved_at: number | null;
  approved_by: string | null;
  rejected_reason: string | null;
  summary_technical: string | null;
  summary_plain: string | null;
  escalation_reason: string | null;
  audit: AuditEntry[];
  created_at: number;
  updated_at: number;
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
}

type Screen = "onboarding" | "login" | "dashboard";

// ── Top-level router ─────────────────────────────────────────────────────────

export function PmDashboard() {
  const savedWsId = localStorage.getItem("pm_workspace_id") || "";
  const savedKey  = localStorage.getItem("pm_api_key") || "";

  const [screen, setScreen]           = useState<Screen>(savedWsId ? "dashboard" : "onboarding");
  const [workspaceId, setWorkspaceId] = useState(savedWsId);
  const [apiKey, setApiKey]           = useState(savedKey);
  const [projects, setProjects]       = useState<Project[]>([]);

  function handleAuthSuccess(wsId: string, key: string, projs: Project[]) {
    localStorage.setItem("pm_workspace_id", wsId);
    localStorage.setItem("pm_api_key", key);
    setWorkspaceId(wsId);
    setApiKey(key);
    setProjects(projs);
    setScreen("dashboard");
  }

  if (screen === "onboarding") {
    return <OnboardingScreen onDone={handleAuthSuccess} />;
  }
  if (screen === "login") {
    return (
      <LoginScreen
        defaultWsId={savedWsId}
        defaultKey={savedKey}
        onDone={handleAuthSuccess}
        onNewWorkspace={() => setScreen("onboarding")}
      />
    );
  }
  return (
    <DashboardScreen
      workspaceId={workspaceId}
      apiKey={apiKey}
      initialProjects={projects}
      onLogout={() => {
        localStorage.removeItem("pm_workspace_id");
        localStorage.removeItem("pm_api_key");
        setWorkspaceId("");
        setApiKey("");
        setScreen("onboarding");
      }}
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
  const [brandColor, setBrandColor] = useState("#0284c7");
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

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4 py-16">
      <div className="w-full max-w-lg">

        {/* Header */}
        <div className="text-center mb-10">
          <div className="text-brand-600 font-bold text-2xl mb-2">AgentInbox</div>
          <p className="text-slate-500 text-sm">Set up your workspace in 2 steps</p>
        </div>

        {/* Step indicator */}
        <div className="flex items-center justify-center gap-3 mb-8">
          {["Create workspace", "Add first project", "Get your link"].map((label, i) => {
            const stepIdx = step === "workspace" ? 0 : step === "project" ? 1 : 2;
            return (
              <div key={label} className="flex items-center gap-3">
                <div className={`flex items-center gap-2 text-sm font-medium ${stepIdx === i ? "text-brand-600" : stepIdx > i ? "text-green-600" : "text-slate-400"}`}>
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${stepIdx === i ? "bg-brand-600 text-white" : stepIdx > i ? "bg-green-100 text-green-700" : "bg-slate-200 text-slate-400"}`}>
                    {stepIdx > i ? "✓" : i + 1}
                  </div>
                  <span className="hidden sm:inline">{label}</span>
                </div>
                {i < 2 && <div className="w-8 h-px bg-slate-200" />}
              </div>
            );
          })}
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-8 shadow-sm">

          {/* Step 1: Workspace */}
          {step === "workspace" && (
            <div className="space-y-5">
              <div>
                <h2 className="text-xl font-bold text-slate-900 mb-1">Name your workspace</h2>
                <p className="text-slate-500 text-sm">This is your agency or company — you'll run multiple client projects under it.</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Workspace name</label>
                <input
                  type="text"
                  value={wsName}
                  onChange={(e) => setWsName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && createWorkspace()}
                  className="w-full border border-slate-300 rounded-lg px-4 py-3 text-lg focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                  placeholder="e.g. Acme Agency"
                  autoFocus
                />
              </div>
              {error && <p className="text-red-600 text-sm">{error}</p>}
              <button
                onClick={createWorkspace}
                disabled={loading || !wsName.trim()}
                className="w-full bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white font-semibold py-3 rounded-lg transition-colors"
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
                <label className="block text-sm font-medium text-slate-700 mb-1">Project name <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  value={projName}
                  onChange={(e) => setProjName(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                  placeholder="e.g. form-gen-mbl"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Description <span className="text-slate-400 font-normal">(optional)</span></label>
                <input
                  type="text"
                  value={projDesc}
                  onChange={(e) => setProjDesc(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                  placeholder="e.g. Mobile form generation app"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Notification email <span className="text-slate-400 font-normal">(optional)</span></label>
                <input
                  type="email"
                  value={notifyEmail}
                  onChange={(e) => setNotifyEmail(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
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
                  className={`relative w-10 h-6 rounded-full transition-colors cursor-pointer ${approval ? "bg-brand-600" : "bg-slate-300"}`}
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
                className="w-full bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white font-semibold py-3 rounded-lg transition-colors"
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
                  <code className="flex-1 text-sm text-brand-700 bg-brand-50 rounded-lg px-3 py-2 break-all">
                    {submitUrl}
                  </code>
                  <button
                    onClick={() => navigator.clipboard.writeText(submitUrl)}
                    className="shrink-0 bg-brand-600 hover:bg-brand-700 text-white text-xs font-medium px-3 py-2 rounded-lg transition-colors"
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
                className="w-full bg-brand-600 hover:bg-brand-700 text-white font-semibold py-3 rounded-lg transition-colors"
              >
                Go to dashboard →
              </button>
            </div>
          )}
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
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-brand-600 font-bold text-xl mb-2">AgentInbox</div>
        <p className="text-slate-500 text-sm mb-6">PM Dashboard</p>
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Workspace ID</label>
            <input
              type="text"
              value={wsId}
              onChange={(e) => setWsId(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              placeholder="Paste your workspace ID"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">API Key <span className="text-slate-400 font-normal">(optional)</span></label>
            <input
              type="password"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && login()}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              placeholder="Only needed if API_KEY is set in .env"
            />
          </div>
          {error && <p className="text-red-600 text-sm">{error}</p>}
          <button
            onClick={login}
            disabled={loading}
            className="w-full bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white font-medium py-2.5 rounded-lg transition-colors"
          >
            {loading ? "Loading..." : "Open dashboard"}
          </button>
          <button
            onClick={onNewWorkspace}
            className="w-full text-slate-500 text-sm hover:text-brand-600 transition-colors"
          >
            Create a new workspace →
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main dashboard ────────────────────────────────────────────────────────────

function DashboardScreen({
  workspaceId,
  apiKey,
  initialProjects,
  onLogout,
}: {
  workspaceId: string;
  apiKey: string;
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
    if (apiKey) h["x-api-key"] = apiKey;
    return h;
  }, [apiKey]);

  useEffect(() => {
    fetch(`/api/workspaces/${workspaceId}/stats`, { headers: authHeaders() })
      .then((r) => r.json()).then(setStats).catch(() => {});
  }, [workspaceId, authHeaders]);

  useEffect(() => {
    if (!selectedProject) return;
    const url = statusFilter
      ? `/api/projects/${selectedProject}/tasks?status=${statusFilter}`
      : `/api/projects/${selectedProject}/tasks`;
    fetch(url, { headers: authHeaders() })
      .then((r) => r.json()).then(setTasks).catch(() => setError("Failed to load tasks"));
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
      method: "POST", headers: authHeaders(), body: JSON.stringify({ reason }),
    });
    await loadTask(id);
    setTasks((prev) => prev.map((t) => t.id === id ? { ...t, status: "failed" } : t));
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
    <div className="min-h-screen flex">
      {/* Sidebar */}
      <div className="w-56 bg-white border-r border-slate-200 flex flex-col shrink-0">
        <div className="p-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <div className="text-brand-600 font-bold text-sm">AgentInbox</div>
            <div className="text-xs text-slate-400 truncate max-w-[120px]" title={workspaceId}>
              ID: {workspaceId.slice(0, 12)}…
            </div>
          </div>
          <button onClick={onLogout} title="Log out" className="text-slate-400 hover:text-slate-600 text-xs">⎋</button>
        </div>

        {stats && (
          <div className="px-3 py-3 border-b border-slate-100">
            <div className="grid grid-cols-2 gap-1.5 text-center">
              <StatMini label="Total" value={stats.total_tasks} />
              <StatMini label="Done" value={stats.done} color="text-green-600" />
              <StatMini label="Active" value={stats.in_progress} color="text-blue-600" />
              <StatMini label="Escalated" value={stats.escalated} color="text-orange-500" />
            </div>
          </div>
        )}

        <div className="p-3 flex-1 overflow-y-auto">
          <div className="flex items-center justify-between mb-2 px-1">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Projects</p>
            <button
              onClick={() => setNewProjOpen(true)}
              className="text-brand-600 hover:text-brand-700 text-lg font-bold leading-none"
              title="New project"
            >+</button>
          </div>
          {projects.length === 0 && (
            <p className="text-xs text-slate-400 px-1">No projects yet.</p>
          )}
          {projects.map((p) => (
            <button key={p.id}
              onClick={() => { setSelectedProject(p.id); setSelectedTask(null); setView("tasks"); }}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm mb-0.5 transition-colors ${selectedProject === p.id ? "bg-brand-50 text-brand-700 font-medium" : "text-slate-600 hover:bg-slate-50"}`}
            >
              <span className="truncate block">{p.brand_name || p.name}</span>
              {p.require_approval ? <span className="text-xs text-yellow-500">● approval on</span> : null}
            </button>
          ))}
        </div>

        <div className="p-3 border-t border-slate-200 space-y-1">
          <NavBtn active={view === "stats"} onClick={() => setView("stats")}>Usage stats</NavBtn>
          <NavBtn active={view === "settings"} onClick={() => setView("settings")}>Settings</NavBtn>
        </div>
      </div>

      {/* Main */}
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

        {view === "stats" && <StatsView stats={stats} projects={projects} />}
        {view === "settings" && (
          <SettingsView
            selectedProject={selectedProject}
            projects={projects}
            authHeaders={authHeaders()}
            workspaceId={workspaceId}
            onSaved={refreshProjects}
          />
        )}

        {view === "tasks" && (
          <>
            {!selectedProject ? (
              <div className="flex-1 flex flex-col items-center justify-center text-slate-400 gap-4">
                <p className="text-sm">No project selected.</p>
                <button onClick={() => setNewProjOpen(true)}
                  className="bg-brand-600 text-white text-sm font-medium px-5 py-2.5 rounded-lg hover:bg-brand-700">
                  + Create your first project
                </button>
              </div>
            ) : (
              <>
                {/* Submission link bar */}
                <SubmissionLinkBar project={projects.find((p) => p.id === selectedProject)} />

                {/* Filter bar */}
                <div className="bg-white border-b border-slate-200 px-5 py-2.5 flex items-center gap-2 flex-wrap">
                  {["", "pending", "awaiting_approval", "in_progress", "done", "failed", "escalated"].map((s) => (
                    <button key={s || "all"}
                      onClick={() => setStatusFilter(s)}
                      className={`text-xs px-3 py-1 rounded-full transition-colors ${statusFilter === s ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
                      {s || "All"}
                    </button>
                  ))}
                </div>

                <div className="flex flex-1 overflow-hidden">
                  {/* Task list */}
                  <div className="w-72 border-r border-slate-200 overflow-y-auto bg-white shrink-0">
                    {tasks.length === 0 ? (
                      <div className="p-8 text-center text-slate-400">
                        <p className="text-sm mb-1">No tasks yet.</p>
                        <p className="text-xs">Share the submission link with your client to get started.</p>
                      </div>
                    ) : (
                      tasks.map((t) => (
                        <button key={t.id} onClick={() => loadTask(t.id)}
                          className={`w-full text-left p-4 border-b border-slate-100 hover:bg-slate-50 transition-colors ${selectedTask?.id === t.id ? "bg-brand-50" : ""}`}>
                          <div className="flex items-start justify-between gap-2 mb-1">
                            <span className="text-sm font-medium text-slate-900 line-clamp-1">{t.title}</span>
                            <span className={`text-xs px-1.5 py-0.5 rounded-full shrink-0 ${STATUS_COLORS[t.status] || "bg-slate-100 text-slate-600"}`}>
                              {t.status.replace(/_/g, " ")}
                            </span>
                          </div>
                          {t.submitter_name && <p className="text-xs text-slate-400">{t.submitter_name}</p>}
                          <p className="text-xs text-slate-400">{new Date(t.created_at * 1000).toLocaleDateString()}</p>
                        </button>
                      ))
                    )}
                  </div>

                  {/* Task detail */}
                  <div className="flex-1 overflow-y-auto p-6 bg-slate-50">
                    {!selectedTask ? (
                      <p className="text-slate-400 text-sm">Select a task to view details</p>
                    ) : (
                      <TaskDetail task={selectedTask} onApprove={() => approveTask(selectedTask.id)} onReject={() => rejectTask(selectedTask.id)} />
                    )}
                  </div>
                </div>
              </>
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
    <div className="bg-brand-50 border-b border-brand-100 px-5 py-2.5 flex items-center gap-3">
      <span className="text-xs font-semibold text-brand-700 shrink-0">Client link:</span>
      <code className="flex-1 text-xs text-brand-800 truncate">{url}</code>
      <button onClick={copy}
        className="shrink-0 text-xs bg-brand-600 hover:bg-brand-700 text-white px-3 py-1.5 rounded-lg transition-colors">
        {copied ? "Copied!" : "Copy"}
      </button>
      <a href={url} target="_blank" rel="noreferrer"
        className="shrink-0 text-xs text-brand-600 hover:underline">Open ↗</a>
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
  const [color, setColor]       = useState("#0284c7");
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
    <div className="absolute inset-0 bg-black/30 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="p-6 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900">{created ? "Project created!" : "New project"}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
        </div>

        <div className="p-6">
          {!created ? (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Project name <span className="text-red-500">*</span></label>
                <input type="text" value={name} onChange={(e) => setName(e.target.value)} autoFocus
                  className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  placeholder="e.g. form-gen-mbl" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
                <input type="text" value={desc} onChange={(e) => setDesc(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  placeholder="Optional" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Client-facing name <span className="text-slate-400 font-normal">(white label)</span></label>
                <input type="text" value={brandName} onChange={(e) => setBrandName(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  placeholder="What clients see — leave blank to use project name" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Notification email</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  placeholder="PM email for task alerts" />
              </div>
              <div className="flex items-center justify-between py-3 border-t border-slate-100">
                <div>
                  <p className="text-sm font-medium text-slate-700">Require PM approval</p>
                  <p className="text-xs text-slate-400">Claude plans first, you approve before code runs</p>
                </div>
                <div onClick={() => setApproval(!approval)}
                  className={`relative w-10 h-6 rounded-full transition-colors cursor-pointer ${approval ? "bg-brand-600" : "bg-slate-300"}`}>
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
                className="w-full bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white font-semibold py-2.5 rounded-lg transition-colors">
                {loading ? "Creating..." : "Create project"}
              </button>
            </div>
          ) : (
            <div className="space-y-5">
              <p className="text-slate-600 text-sm">Share this link with your client. That's all they need.</p>
              <div className="bg-brand-50 border border-brand-200 rounded-xl p-4">
                <p className="text-xs font-semibold text-brand-700 mb-2">Submission link</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-xs text-brand-800 break-all">{submitUrl}</code>
                  <button onClick={() => { navigator.clipboard.writeText(submitUrl); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
                    className="shrink-0 bg-brand-600 hover:bg-brand-700 text-white text-xs font-medium px-3 py-1.5 rounded-lg transition-colors">
                    {copied ? "Copied!" : "Copy"}
                  </button>
                </div>
              </div>
              <div className="flex gap-3">
                <a href={submitUrl} target="_blank" rel="noreferrer"
                  className="flex-1 text-center border border-slate-300 hover:bg-slate-50 text-slate-700 text-sm font-medium py-2.5 rounded-lg transition-colors">
                  Preview form ↗
                </a>
                <button onClick={() => onCreated(created)}
                  className="flex-1 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium py-2.5 rounded-lg transition-colors">
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

function TaskDetail({ task, onApprove, onReject }: { task: Task; onApprove: () => void; onReject: () => void }) {
  return (
    <div className="max-w-2xl space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-xl font-semibold text-slate-900">{task.title}</h1>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[task.status] || "bg-slate-100 text-slate-600"}`}>
              {task.status.replace(/_/g, " ")}
            </span>
          </div>
          {task.submitter_name && <p className="text-sm text-slate-500">{task.submitter_name}{task.submitter_email && ` · ${task.submitter_email}`}</p>}
          <p className="text-xs text-slate-400">{new Date(task.created_at * 1000).toLocaleString()}</p>
        </div>
        {task.status === "awaiting_approval" && (
          <div className="flex gap-2 shrink-0">
            <button onClick={onApprove} className="bg-green-600 hover:bg-green-700 text-white text-sm font-medium px-4 py-2 rounded-lg">Approve</button>
            <button onClick={onReject} className="bg-red-100 hover:bg-red-200 text-red-700 text-sm font-medium px-4 py-2 rounded-lg">Reject</button>
          </div>
        )}
      </div>
      <Card title="Description"><p className="text-slate-700 text-sm whitespace-pre-wrap">{task.description}</p></Card>
      {task.file_name && <Card title="Attached file"><p className="text-slate-600 text-sm">📎 {task.file_name}</p></Card>}
      {task.proposed_plan && <Card title="Claude's proposed plan"><p className="text-sm text-amber-900 whitespace-pre-wrap bg-amber-50 rounded-lg p-3">{task.proposed_plan}</p></Card>}
      {task.rejected_reason && <Card title="Rejection reason"><p className="text-red-700 text-sm">{task.rejected_reason}</p></Card>}
      {task.summary_technical && <Card title="Technical summary"><p className="text-slate-700 text-sm font-mono whitespace-pre-wrap">{task.summary_technical}</p></Card>}
      {task.summary_plain && <Card title="Client summary"><p className="text-slate-700 text-sm">{task.summary_plain}</p></Card>}
      {task.escalation_reason && <Card title="Escalation reason"><p className="text-orange-700 text-sm">{task.escalation_reason}</p></Card>}
      {task.audit?.length > 0 && (
        <Card title="Audit log">
          <div className="space-y-2">
            {task.audit.map((e) => (
              <div key={e.id} className="flex gap-3 text-xs">
                <span className="text-slate-400 shrink-0">{new Date(e.created_at * 1000).toLocaleTimeString()}</span>
                <span className="font-medium text-slate-600">{e.action.replace(/_/g, " ")}</span>
                {e.actor && <span className="text-slate-400">by {e.actor}</span>}
              </div>
            ))}
          </div>
        </Card>
      )}
      <div className="text-xs text-slate-400 space-y-1 pt-2">
        <p>Task ID: {task.id}</p>
        <p>Last updated: {new Date(task.updated_at * 1000).toLocaleString()}</p>
        <a href={`/task/${task.id}`} target="_blank" rel="noreferrer" className="text-brand-600 hover:underline block">Client status link →</a>
      </div>
    </div>
  );
}

// ── Stats view ────────────────────────────────────────────────────────────────

function StatsView({ stats, projects }: { stats: Stats | null; projects: Project[] }) {
  if (!stats) return <div className="p-8 text-slate-400">Loading...</div>;
  return (
    <div className="p-8 max-w-3xl overflow-y-auto">
      <h2 className="text-xl font-bold text-slate-900 mb-6">Usage dashboard</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-8">
        <StatCard label="Total tasks" value={stats.total_tasks} />
        <StatCard label="Completed" value={stats.done} color="text-green-600" />
        <StatCard label="In progress" value={stats.in_progress} color="text-blue-600" />
        <StatCard label="Pending" value={stats.pending} />
        <StatCard label="Escalated" value={stats.escalated} color="text-orange-500" />
        <StatCard label="Projects" value={stats.projects} />
      </div>
      <h3 className="font-semibold text-slate-700 mb-3">Projects</h3>
      <div className="space-y-2">
        {projects.map((p) => (
          <div key={p.id} className="bg-white border border-slate-200 rounded-lg px-4 py-3 flex items-center justify-between">
            <div>
              <p className="font-medium text-slate-900 text-sm">{p.brand_name || p.name}</p>
              {p.notify_email && <p className="text-xs text-slate-400">{p.notify_email}</p>}
            </div>
            {p.require_approval ? <span className="bg-yellow-100 text-yellow-700 text-xs px-2 py-0.5 rounded-full">Approval on</span> : null}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Settings view ─────────────────────────────────────────────────────────────

function SettingsView({ selectedProject, projects, authHeaders, workspaceId, onSaved }: { selectedProject: string; projects: Project[]; authHeaders: Record<string, string>; workspaceId: string; onSaved: () => Promise<void> }) {
  const project = projects.find((p) => p.id === selectedProject);
  const [saved, setSaved]             = useState(false);
  const [notifyEmail, setNotifyEmail] = useState(project?.notify_email || "");
  const [brandName, setBrandName]     = useState(project?.brand_name || "");
  const [brandColor, setBrandColor]   = useState(project?.brand_color || "#0284c7");
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
      setBrandColor(project.brand_color || "#0284c7");
      setRequireApproval(!!project.require_approval);
      try { setCustomFields(project.custom_fields ? JSON.parse(project.custom_fields) : []); } catch { setCustomFields([]); }
    }
  }, [project]);

  if (!project) return <div className="p-8 text-slate-400 text-sm">Select a project from the sidebar to edit its settings.</div>;

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
    <div className="p-8 max-w-xl overflow-y-auto">
      <h2 className="text-xl font-bold text-slate-900 mb-6">Settings — {project.name}</h2>
      <div className="space-y-6">
        <div>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Submission link</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs bg-slate-100 rounded px-3 py-2 break-all">{submitUrl}</code>
            <button onClick={() => navigator.clipboard.writeText(submitUrl)}
              className="shrink-0 bg-brand-600 hover:bg-brand-700 text-white text-xs px-3 py-2 rounded-lg">Copy</button>
          </div>
        </div>
        <div>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Workspace ID</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs bg-slate-100 rounded px-3 py-2 break-all">{workspaceId}</code>
            <button onClick={() => navigator.clipboard.writeText(workspaceId)}
              className="shrink-0 bg-slate-600 hover:bg-slate-700 text-white text-xs px-3 py-2 rounded-lg">Copy</button>
          </div>
        </div>
        <Field label="Notification email" hint="Receives emails on task completion, escalation, approval requests">
          <input type="email" value={notifyEmail} onChange={(e) => setNotifyEmail(e.target.value)}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" placeholder="pm@agency.com" />
        </Field>
        <Field label="Client-facing name" hint="What clients see on the submission form">
          <input type="text" value={brandName} onChange={(e) => setBrandName(e.target.value)}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" placeholder="Leave blank to use project name" />
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
              className={`relative w-10 h-6 rounded-full transition-colors cursor-pointer ${requireApproval ? "bg-brand-600" : "bg-slate-300"}`}>
              <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${requireApproval ? "translate-x-5" : "translate-x-1"}`} />
            </div>
            <span className="text-sm text-slate-700">{requireApproval ? "Required" : "Disabled"}</span>
          </label>
        </Field>

        {/* ── Custom fields ─────────────────────────────────────────────────── */}
        <div>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Custom fields</p>
          <p className="text-xs text-slate-400 mb-3">Add dropdowns or text fields to the submission form. Claude receives these as structured metadata to route tasks accurately.</p>

          {customFields.length > 0 && (
            <div className="space-y-2 mb-4">
              {customFields.map((f, i) => (
                <div key={i} className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                  <div>
                    <span className="text-sm font-medium text-slate-800">{f.name}</span>
                    <span className="ml-2 text-xs text-slate-400">{f.type}</span>
                    {f.required && <span className="ml-1 text-xs text-red-400">required</span>}
                    {f.options && f.options.length > 0 && (
                      <p className="text-xs text-slate-400 mt-0.5">{f.options.join(", ")}</p>
                    )}
                  </div>
                  <button onClick={() => removeField(i)} className="text-slate-400 hover:text-red-500 text-lg leading-none ml-3">×</button>
                </div>
              ))}
            </div>
          )}

          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-2">
            <p className="text-xs font-medium text-slate-600">Add field</p>
            <div className="flex gap-2">
              <input
                type="text"
                value={newFieldName}
                onChange={(e) => setNewFieldName(e.target.value)}
                placeholder="Field name (e.g. Module)"
                className="flex-1 border border-slate-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
              <select
                value={newFieldType}
                onChange={(e) => setNewFieldType(e.target.value as "dropdown" | "text")}
                className="border border-slate-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-brand-500"
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
                className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-brand-500"
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
                className="bg-brand-600 hover:bg-brand-700 disabled:opacity-40 text-white text-xs px-3 py-1.5 rounded transition-colors"
              >
                Add field
              </button>
            </div>
          </div>
        </div>

        <button onClick={save} className="bg-brand-600 hover:bg-brand-700 text-white font-medium px-6 py-2 rounded-lg transition-colors">
          {saved ? "Saved ✓" : "Save settings"}
        </button>
      </div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  pending:           "bg-slate-100 text-slate-700",
  awaiting_approval: "bg-yellow-100 text-yellow-700",
  in_progress:       "bg-blue-100 text-blue-700",
  done:              "bg-green-100 text-green-700",
  failed:            "bg-red-100 text-red-700",
  blocked:           "bg-yellow-100 text-yellow-700",
  escalated:         "bg-orange-100 text-orange-700",
};

function StatCard({ label, value, color = "text-slate-900" }: { label: string; value: number; color?: string }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 text-center">
      <div className={`text-3xl font-bold mb-1 ${color}`}>{value}</div>
      <div className="text-xs text-slate-500">{label}</div>
    </div>
  );
}

function StatMini({ label, value, color = "text-slate-700" }: { label: string; value: number; color?: string }) {
  return (
    <div className="bg-slate-50 rounded-lg p-2 text-center">
      <div className={`text-lg font-bold ${color}`}>{value}</div>
      <div className="text-xs text-slate-400">{label}</div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4">
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">{title}</p>
      {children}
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1">{label}</label>
      {hint && <p className="text-xs text-slate-400 mb-2">{hint}</p>}
      {children}
    </div>
  );
}

function NavBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick}
      className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${active ? "bg-slate-100 text-slate-900 font-medium" : "text-slate-500 hover:bg-slate-50"}`}>
      {children}
    </button>
  );
}
