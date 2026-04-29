import { useState, useEffect } from "react";

interface Task {
  id: string;
  project_id: string;
  title: string;
  description: string;
  status: string;
  submitter_name: string | null;
  submitter_email: string | null;
  file_name: string | null;
  summary_technical: string | null;
  summary_plain: string | null;
  escalation_reason: string | null;
  created_at: number;
  updated_at: number;
}

interface Project {
  id: string;
  name: string;
  token: string;
}

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-slate-100 text-slate-700",
  in_progress: "bg-blue-100 text-blue-700",
  done: "bg-green-100 text-green-700",
  failed: "bg-red-100 text-red-700",
  blocked: "bg-yellow-100 text-yellow-700",
  escalated: "bg-orange-100 text-orange-700",
};

export function PmDashboard() {
  const [apiKey, setApiKey] = useState(localStorage.getItem("pm_api_key") || "");
  const [authed, setAuthed] = useState(false);
  const [workspaceId, setWorkspaceId] = useState(localStorage.getItem("pm_workspace_id") || "");
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<string>("");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [error, setError] = useState("");

  async function login() {
    if (!workspaceId.trim() || !apiKey.trim()) {
      setError("Workspace ID and API key are required");
      return;
    }
    const res = await fetch(`/api/workspaces/${workspaceId}/projects`, {
      headers: { "x-api-key": apiKey },
    });
    if (!res.ok) {
      setError("Invalid API key or workspace");
      return;
    }
    const data = await res.json();
    localStorage.setItem("pm_api_key", apiKey);
    localStorage.setItem("pm_workspace_id", workspaceId);
    setProjects(data);
    setAuthed(true);
    setError("");
  }

  useEffect(() => {
    if (!authed || !selectedProject) return;
    const url = statusFilter
      ? `/api/projects/${selectedProject}/tasks?status=${statusFilter}`
      : `/api/projects/${selectedProject}/tasks`;

    fetch(url, { headers: { "x-api-key": apiKey } })
      .then((r) => r.json())
      .then(setTasks)
      .catch(() => setError("Failed to load tasks"));
  }, [authed, selectedProject, statusFilter, apiKey]);

  if (!authed) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="w-full max-w-sm">
          <div className="text-brand-600 font-bold text-lg mb-6">AgentInbox — PM Dashboard</div>
          <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Workspace ID</label>
              <input
                type="text"
                value={workspaceId}
                onChange={(e) => setWorkspaceId(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                placeholder="Your workspace ID"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">API Key</label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && login()}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                placeholder="API_KEY from your .env"
              />
            </div>
            {error && <p className="text-red-600 text-sm">{error}</p>}
            <button
              onClick={login}
              className="w-full bg-brand-600 hover:bg-brand-700 text-white font-medium py-2 rounded-lg transition-colors"
            >
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
      <div className="w-64 bg-white border-r border-slate-200 flex flex-col">
        <div className="p-4 border-b border-slate-200">
          <div className="text-brand-600 font-bold">AgentInbox</div>
          <div className="text-xs text-slate-400 mt-0.5">PM Dashboard</div>
        </div>
        <div className="p-4 flex-1">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Projects</p>
          {projects.map((p) => (
            <button
              key={p.id}
              onClick={() => { setSelectedProject(p.id); setSelectedTask(null); }}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm mb-1 transition-colors ${
                selectedProject === p.id
                  ? "bg-brand-50 text-brand-700 font-medium"
                  : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              {p.name}
            </button>
          ))}
        </div>
      </div>

      {/* Main */}
      <div className="flex-1 flex flex-col min-h-screen">
        {/* Toolbar */}
        {selectedProject && (
          <div className="bg-white border-b border-slate-200 px-6 py-3 flex items-center gap-3">
            <span className="text-sm text-slate-500">Filter:</span>
            {["", "pending", "in_progress", "done", "failed", "escalated"].map((s) => (
              <button
                key={s || "all"}
                onClick={() => setStatusFilter(s)}
                className={`text-xs px-3 py-1 rounded-full transition-colors ${
                  statusFilter === s
                    ? "bg-brand-600 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {s || "All"}
              </button>
            ))}
          </div>
        )}

        {!selectedProject && (
          <div className="flex-1 flex items-center justify-center text-slate-400">
            Select a project to view tasks
          </div>
        )}

        {selectedProject && (
          <div className="flex flex-1 overflow-hidden">
            {/* Task list */}
            <div className="w-80 border-r border-slate-200 overflow-y-auto bg-white">
              {tasks.length === 0 ? (
                <div className="p-6 text-sm text-slate-400 text-center">No tasks</div>
              ) : (
                tasks.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setSelectedTask(t)}
                    className={`w-full text-left p-4 border-b border-slate-100 hover:bg-slate-50 transition-colors ${
                      selectedTask?.id === t.id ? "bg-brand-50" : ""
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <span className="text-sm font-medium text-slate-900 line-clamp-1">{t.title}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${STATUS_COLORS[t.status] || "bg-slate-100 text-slate-600"}`}>
                        {t.status}
                      </span>
                    </div>
                    {t.submitter_name && (
                      <p className="text-xs text-slate-400">{t.submitter_name}</p>
                    )}
                    <p className="text-xs text-slate-400">
                      {new Date(t.created_at * 1000).toLocaleDateString()}
                    </p>
                  </button>
                ))
              )}
            </div>

            {/* Task detail */}
            <div className="flex-1 overflow-y-auto p-6">
              {!selectedTask ? (
                <div className="text-slate-400 text-sm">Select a task to view details</div>
              ) : (
                <TaskDetail task={selectedTask} />
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function TaskDetail({ task }: { task: Task }) {
  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <div className="flex items-center gap-3 mb-2">
          <h1 className="text-xl font-semibold text-slate-900">{task.title}</h1>
          <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${STATUS_COLORS[task.status] || "bg-slate-100 text-slate-600"}`}>
            {task.status}
          </span>
        </div>
        {task.submitter_name && (
          <p className="text-sm text-slate-500">
            From: {task.submitter_name}
            {task.submitter_email && ` · ${task.submitter_email}`}
          </p>
        )}
        <p className="text-xs text-slate-400 mt-1">
          Submitted: {new Date(task.created_at * 1000).toLocaleString()}
        </p>
      </div>

      <Section title="Description">
        <p className="text-slate-700 whitespace-pre-wrap">{task.description}</p>
      </Section>

      {task.file_name && (
        <Section title="Attached file">
          <p className="text-slate-600 text-sm">{task.file_name}</p>
        </Section>
      )}

      {task.summary_technical && (
        <Section title="Technical summary (for PM/dev)">
          <p className="text-slate-700 whitespace-pre-wrap font-mono text-sm">{task.summary_technical}</p>
        </Section>
      )}

      {task.summary_plain && (
        <Section title="Client-facing summary">
          <p className="text-slate-700 whitespace-pre-wrap">{task.summary_plain}</p>
        </Section>
      )}

      {task.escalation_reason && (
        <Section title="Escalation reason">
          <p className="text-orange-700 whitespace-pre-wrap">{task.escalation_reason}</p>
        </Section>
      )}

      <div className="border-t border-slate-200 pt-4">
        <p className="text-xs text-slate-400">Task ID: {task.id}</p>
        <p className="text-xs text-slate-400">
          Last updated: {new Date(task.updated_at * 1000).toLocaleString()}
        </p>
        <a
          href={`/task/${task.id}`}
          target="_blank"
          rel="noreferrer"
          className="text-xs text-brand-600 hover:underline mt-1 block"
        >
          Client status link →
        </a>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5">
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">{title}</p>
      {children}
    </div>
  );
}
