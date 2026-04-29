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

interface Project {
  id: string;
  name: string;
  token: string;
  require_approval: number;
  notify_email: string | null;
  brand_name: string | null;
  brand_color: string | null;
}

interface Stats {
  total_tasks: number;
  done: number;
  in_progress: number;
  pending: number;
  escalated: number;
  projects: number;
}

const STATUS_COLORS: Record<string, string> = {
  pending:           "bg-slate-100 text-slate-700",
  awaiting_approval: "bg-yellow-100 text-yellow-700",
  in_progress:       "bg-blue-100 text-blue-700",
  done:              "bg-green-100 text-green-700",
  failed:            "bg-red-100 text-red-700",
  blocked:           "bg-yellow-100 text-yellow-700",
  escalated:         "bg-orange-100 text-orange-700",
};

export function PmDashboard() {
  const [apiKey, setApiKey] = useState(localStorage.getItem("pm_api_key") || "");
  const [workspaceId, setWorkspaceId] = useState(localStorage.getItem("pm_workspace_id") || "");
  const [authed, setAuthed] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [selectedProject, setSelectedProject] = useState<string>("");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [view, setView] = useState<"tasks" | "stats" | "settings">("tasks");
  const [error, setError] = useState("");

  const authHeaders = useCallback(
    () => ({ "x-api-key": apiKey, "Content-Type": "application/json" }),
    [apiKey]
  );

  async function login() {
    if (!workspaceId.trim() || !apiKey.trim()) { setError("Workspace ID and API key required"); return; }
    const res = await fetch(`/api/workspaces/${workspaceId}/projects`, { headers: authHeaders() });
    if (!res.ok) { setError("Invalid API key or workspace"); return; }
    const data = await res.json();
    localStorage.setItem("pm_api_key", apiKey);
    localStorage.setItem("pm_workspace_id", workspaceId);
    setProjects(data);
    setAuthed(true);
    setError("");

    // Load stats
    fetch(`/api/workspaces/${workspaceId}/stats`, { headers: authHeaders() })
      .then((r) => r.json())
      .then(setStats)
      .catch(() => {});
  }

  useEffect(() => {
    if (!authed || !selectedProject) return;
    const url = statusFilter
      ? `/api/projects/${selectedProject}/tasks?status=${statusFilter}`
      : `/api/projects/${selectedProject}/tasks`;
    fetch(url, { headers: authHeaders() })
      .then((r) => r.json())
      .then(setTasks)
      .catch(() => setError("Failed to load tasks"));
  }, [authed, selectedProject, statusFilter, authHeaders]);

  async function loadTask(id: string) {
    const res = await fetch(`/api/tasks/${id}`, { headers: authHeaders() });
    const data = await res.json();
    setSelectedTask(data);
  }

  async function approveTask(id: string) {
    await fetch(`/api/tasks/${id}/approve?by=PM`, { method: "POST", headers: authHeaders() });
    await loadTask(id);
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, status: "in_progress" } : t)));
  }

  async function rejectTask(id: string) {
    const reason = prompt("Reason for rejection?");
    if (!reason) return;
    await fetch(`/api/tasks/${id}/reject`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ reason }),
    });
    await loadTask(id);
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, status: "failed" } : t)));
  }

  if (!authed) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="w-full max-w-sm">
          <div className="text-brand-600 font-bold text-lg mb-6">AgentInbox — PM Dashboard</div>
          <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Workspace ID</label>
              <input type="text" value={workspaceId} onChange={(e) => setWorkspaceId(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                placeholder="Your workspace ID" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">API Key</label>
              <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && login()}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                placeholder="API_KEY from .env" />
            </div>
            {error && <p className="text-red-600 text-sm">{error}</p>}
            <button onClick={login}
              className="w-full bg-brand-600 hover:bg-brand-700 text-white font-medium py-2 rounded-lg transition-colors">
              Sign in
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex">
      {/* Sidebar */}
      <div className="w-56 bg-white border-r border-slate-200 flex flex-col shrink-0">
        <div className="p-4 border-b border-slate-200">
          <div className="text-brand-600 font-bold text-sm">AgentInbox</div>
          <div className="text-xs text-slate-400">PM Dashboard</div>
        </div>

        {/* Workspace stats mini */}
        {stats && (
          <div className="px-4 py-3 border-b border-slate-100">
            <div className="grid grid-cols-2 gap-1.5 text-center">
              <StatMini label="Total" value={stats.total_tasks} />
              <StatMini label="Done" value={stats.done} color="text-green-600" />
              <StatMini label="Active" value={stats.in_progress} color="text-blue-600" />
              <StatMini label="Escalated" value={stats.escalated} color="text-orange-500" />
            </div>
          </div>
        )}

        <div className="p-3 flex-1 overflow-y-auto">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 px-1">Projects</p>
          {projects.map((p) => (
            <button key={p.id}
              onClick={() => { setSelectedProject(p.id); setSelectedTask(null); setView("tasks"); }}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm mb-0.5 transition-colors ${
                selectedProject === p.id ? "bg-brand-50 text-brand-700 font-medium" : "text-slate-600 hover:bg-slate-50"
              }`}>
              {p.brand_name || p.name}
              {p.require_approval ? <span className="ml-1 text-xs text-yellow-600">●</span> : null}
            </button>
          ))}
        </div>

        <div className="p-3 border-t border-slate-200 space-y-1">
          <NavBtn active={view === "stats"} onClick={() => setView("stats")}>Usage stats</NavBtn>
          <NavBtn active={view === "settings"} onClick={() => setView("settings")}>Settings</NavBtn>
        </div>
      </div>

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {view === "stats" && <StatsView stats={stats} projects={projects} />}
        {view === "settings" && <SettingsView selectedProject={selectedProject} projects={projects} authHeaders={authHeaders()} />}
        {view === "tasks" && (
          <>
            {!selectedProject ? (
              <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">
                Select a project
              </div>
            ) : (
              <>
                {/* Filter bar */}
                <div className="bg-white border-b border-slate-200 px-5 py-2.5 flex items-center gap-2 flex-wrap">
                  {["", "pending", "awaiting_approval", "in_progress", "done", "failed", "escalated"].map((s) => (
                    <button key={s || "all"}
                      onClick={() => setStatusFilter(s)}
                      className={`text-xs px-3 py-1 rounded-full transition-colors ${
                        statusFilter === s ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                      }`}>
                      {s || "All"}
                    </button>
                  ))}
                </div>

                <div className="flex flex-1 overflow-hidden">
                  {/* Task list */}
                  <div className="w-72 border-r border-slate-200 overflow-y-auto bg-white shrink-0">
                    {tasks.length === 0 ? (
                      <div className="p-6 text-sm text-slate-400 text-center">No tasks</div>
                    ) : (
                      tasks.map((t) => (
                        <button key={t.id} onClick={() => loadTask(t.id)}
                          className={`w-full text-left p-4 border-b border-slate-100 hover:bg-slate-50 transition-colors ${selectedTask?.id === t.id ? "bg-brand-50" : ""}`}>
                          <div className="flex items-start justify-between gap-2 mb-1">
                            <span className="text-sm font-medium text-slate-900 line-clamp-1">{t.title}</span>
                            <span className={`text-xs px-1.5 py-0.5 rounded-full shrink-0 ${STATUS_COLORS[t.status] || "bg-slate-100 text-slate-600"}`}>
                              {t.status.replace("_", " ")}
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
                      <p className="text-slate-400 text-sm">Select a task</p>
                    ) : (
                      <TaskDetail
                        task={selectedTask}
                        onApprove={() => approveTask(selectedTask.id)}
                        onReject={() => rejectTask(selectedTask.id)}
                      />
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

function TaskDetail({
  task,
  onApprove,
  onReject,
}: {
  task: Task;
  onApprove: () => void;
  onReject: () => void;
}) {
  return (
    <div className="max-w-2xl space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-xl font-semibold text-slate-900">{task.title}</h1>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[task.status] || "bg-slate-100 text-slate-600"}`}>
              {task.status.replace("_", " ")}
            </span>
          </div>
          {task.submitter_name && (
            <p className="text-sm text-slate-500">
              {task.submitter_name}{task.submitter_email && ` · ${task.submitter_email}`}
            </p>
          )}
          <p className="text-xs text-slate-400">{new Date(task.created_at * 1000).toLocaleString()}</p>
        </div>
        {task.status === "awaiting_approval" && (
          <div className="flex gap-2 shrink-0">
            <button onClick={onApprove}
              className="bg-green-600 hover:bg-green-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
              Approve
            </button>
            <button onClick={onReject}
              className="bg-red-100 hover:bg-red-200 text-red-700 text-sm font-medium px-4 py-2 rounded-lg transition-colors">
              Reject
            </button>
          </div>
        )}
      </div>

      <Card title="Description">
        <p className="text-slate-700 text-sm whitespace-pre-wrap">{task.description}</p>
      </Card>

      {task.file_name && (
        <Card title="Attached file">
          <p className="text-slate-600 text-sm">📎 {task.file_name}</p>
        </Card>
      )}

      {task.proposed_plan && (
        <Card title="Proposed plan (Claude)">
          <p className="text-sm text-amber-900 whitespace-pre-wrap bg-amber-50 rounded-lg p-3">{task.proposed_plan}</p>
        </Card>
      )}

      {task.rejected_reason && (
        <Card title="Rejection reason">
          <p className="text-red-700 text-sm">{task.rejected_reason}</p>
        </Card>
      )}

      {task.summary_technical && (
        <Card title="Technical summary">
          <p className="text-slate-700 text-sm font-mono whitespace-pre-wrap">{task.summary_technical}</p>
        </Card>
      )}

      {task.summary_plain && (
        <Card title="Client summary">
          <p className="text-slate-700 text-sm">{task.summary_plain}</p>
        </Card>
      )}

      {task.escalation_reason && (
        <Card title="Escalation reason">
          <p className="text-orange-700 text-sm">{task.escalation_reason}</p>
        </Card>
      )}

      {task.audit?.length > 0 && (
        <Card title="Audit log">
          <div className="space-y-2">
            {task.audit.map((e) => (
              <div key={e.id} className="flex gap-3 text-xs">
                <span className="text-slate-400 shrink-0">{new Date(e.created_at * 1000).toLocaleTimeString()}</span>
                <span className="font-medium text-slate-600">{e.action.replace(/_/g, " ")}</span>
                {e.actor && <span className="text-slate-400">by {e.actor}</span>}
                {e.detail && <span className="text-slate-400 truncate">{e.detail}</span>}
              </div>
            ))}
          </div>
        </Card>
      )}

      <div className="text-xs text-slate-400 space-y-1 pt-2">
        <p>Task ID: {task.id}</p>
        <p>Last updated: {new Date(task.updated_at * 1000).toLocaleString()}</p>
        <a href={`/task/${task.id}`} target="_blank" rel="noreferrer"
          className="text-brand-600 hover:underline block">Client status link →</a>
      </div>
    </div>
  );
}

function StatsView({ stats, projects }: { stats: Stats | null; projects: Project[] }) {
  if (!stats) return <div className="p-8 text-slate-400">Loading stats...</div>;
  return (
    <div className="p-8 max-w-3xl">
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
            <div className="flex gap-2 text-xs">
              {p.require_approval ? <span className="bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full">Approval required</span> : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SettingsView({
  selectedProject,
  projects,
  authHeaders,
}: {
  selectedProject: string;
  projects: Project[];
  authHeaders: Record<string, string>;
}) {
  const project = projects.find((p) => p.id === selectedProject);
  const [saved, setSaved] = useState(false);
  const [notifyEmail, setNotifyEmail] = useState(project?.notify_email || "");
  const [brandName, setBrandName] = useState(project?.brand_name || "");
  const [brandColor, setBrandColor] = useState(project?.brand_color || "#0284c7");
  const [requireApproval, setRequireApproval] = useState(!!project?.require_approval);

  useEffect(() => {
    if (project) {
      setNotifyEmail(project.notify_email || "");
      setBrandName(project.brand_name || "");
      setBrandColor(project.brand_color || "#0284c7");
      setRequireApproval(!!project.require_approval);
    }
  }, [project]);

  if (!project) return <div className="p-8 text-slate-400">Select a project from the sidebar</div>;

  async function save() {
    await fetch(`/api/projects/${project!.id}`, {
      method: "PATCH",
      headers: authHeaders,
      body: JSON.stringify({
        notify_email: notifyEmail || undefined,
        brand_name: brandName || undefined,
        brand_color: brandColor,
        require_approval: requireApproval,
      }),
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  return (
    <div className="p-8 max-w-xl">
      <h2 className="text-xl font-bold text-slate-900 mb-6">Project settings — {project.name}</h2>

      <div className="space-y-6">
        <div>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Submission link</p>
          <code className="text-xs bg-slate-100 rounded px-2 py-1 break-all">
            /submit/{project.token}
          </code>
        </div>

        <Field label="Notification email" hint="PM receives emails on completion, escalation, and approval requests">
          <input type="email" value={notifyEmail} onChange={(e) => setNotifyEmail(e.target.value)}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            placeholder="pm@agency.com" />
        </Field>

        <Field label="Brand name" hint="Shown to clients instead of your internal project name">
          <input type="text" value={brandName} onChange={(e) => setBrandName(e.target.value)}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            placeholder="Acme Client Portal" />
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
            <div
              onClick={() => setRequireApproval(!requireApproval)}
              className={`relative w-10 h-6 rounded-full transition-colors cursor-pointer ${requireApproval ? "bg-brand-600" : "bg-slate-300"}`}>
              <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${requireApproval ? "translate-x-5" : "translate-x-1"}`} />
            </div>
            <span className="text-sm text-slate-700">{requireApproval ? "Required" : "Disabled"}</span>
          </label>
        </Field>

        <button onClick={save}
          className="bg-brand-600 hover:bg-brand-700 text-white font-medium px-6 py-2 rounded-lg transition-colors">
          {saved ? "Saved ✓" : "Save settings"}
        </button>
      </div>
    </div>
  );
}

// ── Small helpers ──────────────────────────────────────────────────────────

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
