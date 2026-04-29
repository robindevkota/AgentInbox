import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";

interface TaskStatus {
  id: string;
  status: string;
  title: string;
  summary_plain: string | null;
  escalation_reason: string | null;
  updated_at: number;
}

const STATUS_LABELS: Record<string, { label: string; color: string; icon: string }> = {
  pending: { label: "Received", color: "text-slate-600 bg-slate-100", icon: "⏳" },
  in_progress: { label: "Working on it", color: "text-blue-700 bg-blue-50", icon: "⚡" },
  done: { label: "Fixed", color: "text-green-700 bg-green-50", icon: "✓" },
  failed: { label: "Could not complete", color: "text-red-700 bg-red-50", icon: "✕" },
  blocked: { label: "Needs more info", color: "text-yellow-700 bg-yellow-50", icon: "⚠" },
  escalated: { label: "Needs human review", color: "text-orange-700 bg-orange-50", icon: "👤" },
};

export function StatusPage() {
  const { taskId } = useParams<{ taskId: string }>();
  const [task, setTask] = useState<TaskStatus | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!taskId) return;

    // First load via REST
    fetch(`/api/tasks/${taskId}/status`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setTask(data);
      })
      .catch(() => setError("Task not found"));

    // Then stream live updates
    const es = new EventSource(`/api/tasks/${taskId}/stream`);
    es.onmessage = (e) => {
      const data = JSON.parse(e.data);
      if (data.error) {
        setError("Task not found");
        es.close();
        return;
      }
      setTask((prev) => ({ ...prev!, ...data }));
    };
    es.onerror = () => es.close();

    return () => es.close();
  }, [taskId]);

  if (error) {
    return (
      <Shell>
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
          <p className="text-red-700">{error}</p>
        </div>
      </Shell>
    );
  }

  if (!task) {
    return <Shell><p className="text-slate-400">Loading...</p></Shell>;
  }

  const statusInfo = STATUS_LABELS[task.status] || STATUS_LABELS.pending;
  const isDone = ["done", "failed", "escalated"].includes(task.status);

  return (
    <Shell>
      <div className="bg-white border border-slate-200 rounded-xl p-8 shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900 mb-6">{task.title}</h1>

        {/* Status timeline */}
        <div className="flex items-center gap-3 mb-8">
          {["pending", "in_progress", "done"].map((s, i) => {
            const isActive = task.status === s || (s === "done" && isDone);
            const isPast =
              (s === "pending" && ["in_progress", "done", "failed", "escalated", "blocked"].includes(task.status)) ||
              (s === "in_progress" && ["done", "failed", "escalated"].includes(task.status));

            return (
              <div key={s} className="flex items-center gap-3">
                <div
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                    isActive
                      ? statusInfo.color
                      : isPast
                      ? "text-green-700 bg-green-50"
                      : "text-slate-400 bg-slate-100"
                  }`}
                >
                  <span>{isPast && !isActive ? "✓" : s === "pending" ? "1" : s === "in_progress" ? "2" : "3"}</span>
                  <span>{s === "pending" ? "Received" : s === "in_progress" ? "In progress" : "Done"}</span>
                </div>
                {i < 2 && <div className="w-6 h-px bg-slate-200" />}
              </div>
            );
          })}
        </div>

        {/* Current status badge */}
        <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold mb-6 ${statusInfo.color}`}>
          <span>{statusInfo.icon}</span>
          <span>{statusInfo.label}</span>
        </div>

        {/* Completion message */}
        {task.summary_plain && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-5">
            <p className="text-sm font-medium text-green-800 mb-1">What was done</p>
            <p className="text-green-900">{task.summary_plain}</p>
          </div>
        )}

        {/* Escalation */}
        {task.status === "escalated" && (
          <div className="bg-orange-50 border border-orange-200 rounded-lg p-5">
            <p className="text-orange-800">
              This request needs to be reviewed by a human. Our team has been notified and will follow up shortly.
            </p>
          </div>
        )}

        {/* Pulsing dot for active tasks */}
        {!isDone && task.status === "in_progress" && (
          <div className="flex items-center gap-2 mt-6 text-sm text-slate-500">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-blue-500" />
            </span>
            Live — updates automatically
          </div>
        )}
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-start justify-center pt-16 px-4 pb-16">
      <div className="w-full max-w-lg">
        <div className="text-brand-600 font-bold text-lg mb-8">AgentInbox</div>
        {children}
      </div>
    </div>
  );
}
