import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";

interface TaskStatus {
  id: string;
  status: string;
  title: string;
  summary_plain: string | null;
  escalation_reason: string | null;
  awaiting_approval: boolean;
  proposed_plan: string | null;
  updated_at: number;
  brand_color: string | null;
}

const STATUS_META: Record<string, { label: string; icon: string }> = {
  pending:           { label: "Received",           icon: "⏳" },
  awaiting_approval: { label: "Pending review",      icon: "🔍" },
  in_progress:       { label: "Working on it",       icon: "⚡" },
  done:              { label: "Fixed",               icon: "✓"  },
  failed:            { label: "Could not complete",  icon: "✕"  },
  blocked:           { label: "Needs more info",     icon: "⚠"  },
  escalated:         { label: "Needs human review",  icon: "👤" },
};

const STEP_STATUSES = ["pending", "in_progress", "done"] as const;

function stepState(currentStatus: string, step: string): "done" | "active" | "future" {
  const order = ["pending", "awaiting_approval", "in_progress", "done", "failed", "escalated", "blocked"];
  const cur = order.indexOf(currentStatus);
  const s = order.indexOf(step);
  if (currentStatus === "done" && step === "done") return "active";
  if (cur > s) return "done";
  if (cur === s) return "active";
  return "future";
}

export function StatusPage() {
  const { taskId } = useParams<{ taskId: string }>();
  const [task, setTask] = useState<TaskStatus | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!taskId) return;

    fetch(`/api/tasks/${taskId}/status`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setTask(data);
      })
      .catch(() => setError("Task not found"));

    const es = new EventSource(`/api/tasks/${taskId}/stream`);
    es.onmessage = (e) => {
      const data = JSON.parse(e.data);
      if (data.error) { setError("Task not found"); es.close(); return; }
      setTask((prev) => (prev ? { ...prev, ...data } : data));
    };
    es.onerror = () => es.close();
    return () => es.close();
  }, [taskId]);

  const accentColor = task?.brand_color || "#0284c7";

  if (error) {
    return (
      <Shell accentColor={accentColor}>
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
          <p className="text-red-700">{error}</p>
        </div>
      </Shell>
    );
  }

  if (!task) {
    return <Shell accentColor={accentColor}><p className="text-slate-400">Loading...</p></Shell>;
  }

  const meta = STATUS_META[task.status] || STATUS_META.pending;
  const isDone = ["done", "failed", "escalated"].includes(task.status);
  const isLive = task.status === "in_progress";

  return (
    <Shell accentColor={accentColor}>
      <div className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8 shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900 mb-6 leading-tight">{task.title}</h1>

        {/* Progress steps */}
        <div className="flex items-center gap-2 mb-6 flex-wrap">
          {STEP_STATUSES.map((s, i) => {
            const st = stepState(task.status, s);
            return (
              <div key={s} className="flex items-center gap-2">
                <div
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                    st === "active"
                      ? "text-white"
                      : st === "done"
                      ? "bg-green-50 text-green-700"
                      : "bg-slate-100 text-slate-400"
                  }`}
                  style={st === "active" ? { backgroundColor: accentColor } : {}}
                >
                  <span>{st === "done" ? "✓" : i + 1}</span>
                  <span>{s === "pending" ? "Received" : s === "in_progress" ? "In progress" : "Done"}</span>
                </div>
                {i < 2 && <div className="w-4 h-px bg-slate-200" />}
              </div>
            );
          })}
        </div>

        {/* Current status badge */}
        <div
          className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-semibold mb-5 ${
            task.status === "done" ? "bg-green-50 text-green-700" :
            task.status === "failed" ? "bg-red-50 text-red-700" :
            task.status === "escalated" ? "bg-orange-50 text-orange-700" :
            task.status === "awaiting_approval" ? "bg-yellow-50 text-yellow-700" :
            "bg-slate-100 text-slate-600"
          }`}
        >
          <span>{meta.icon}</span>
          <span>{meta.label}</span>
        </div>

        {/* Approval gate notice */}
        {task.awaiting_approval && task.proposed_plan && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
            <p className="text-sm font-medium text-yellow-800 mb-1">Waiting for PM review</p>
            <p className="text-yellow-700 text-sm">
              Your request is being reviewed before any changes are made. You'll see an update here once approved.
            </p>
          </div>
        )}

        {/* Completion */}
        {task.summary_plain && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-5 mb-4">
            <p className="text-xs font-semibold text-green-700 uppercase tracking-wider mb-2">What was done</p>
            <p className="text-green-900 text-sm leading-relaxed">{task.summary_plain}</p>
          </div>
        )}

        {/* Escalation */}
        {task.status === "escalated" && (
          <div className="bg-orange-50 border border-orange-200 rounded-lg p-5 mb-4">
            <p className="text-orange-800 text-sm">
              This request needs to be handled by a person. Our team has been notified and will follow up with you shortly.
            </p>
          </div>
        )}

        {/* Live indicator */}
        {isLive && (
          <div className="flex items-center gap-2 text-sm text-slate-500 mt-4">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ backgroundColor: accentColor }} />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5" style={{ backgroundColor: accentColor }} />
            </span>
            Live — updates automatically
          </div>
        )}
      </div>
    </Shell>
  );
}

function Shell({ children, accentColor }: { children: React.ReactNode; accentColor: string }) {
  return (
    <div className="min-h-screen flex items-start justify-center pt-12 px-4 pb-16">
      <div className="w-full max-w-lg">
        <div className="font-bold text-lg mb-8" style={{ color: accentColor }}>AgentInbox</div>
        {children}
      </div>
    </div>
  );
}
