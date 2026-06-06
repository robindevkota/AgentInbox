import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { AgentBackground } from "../components/AgentBackground";

export function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Login failed");
      localStorage.setItem("auth_token", data.token);
      localStorage.setItem("pm_workspace_id", data.workspaceId);
      navigate("/pm");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#06080f] flex flex-col px-4">
      <AgentBackground />

      {/* Nav */}
      <div className="relative flex items-center justify-between px-2 py-4 max-w-5xl mx-auto w-full">
        <Link to="/" className="inline-flex items-center gap-2 text-white font-extrabold text-lg tracking-tight hover:opacity-80 transition-opacity">
          <div className="w-7 h-7 rounded-lg bg-indigo-500 flex items-center justify-center text-sm">📥</div>
          AgentInbox
        </Link>
        <Link to="/" className="text-sm text-slate-300 hover:text-white transition-colors font-medium">← Back to home</Link>
      </div>

      <div className="flex-1 flex items-center justify-center">
      <div className="relative w-full max-w-sm">
        {/* Subtitle */}
        <div className="text-center mb-8">
          <p className="text-slate-200 text-sm">Sign in to your dashboard</p>
        </div>

        {/* Card */}
        <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-8 backdrop-blur-sm"
          style={{ boxShadow: "0 0 40px rgba(99,102,241,0.08)" }}>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-white mb-1.5">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
                className="w-full px-3 py-2.5 bg-slate-900/60 border border-slate-600/50 rounded-lg text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-colors"
                placeholder="you@example.com"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-white mb-1.5">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full px-3 py-2.5 bg-slate-900/60 border border-slate-600/50 rounded-lg text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-colors"
                placeholder="••••••••"
              />
            </div>

            {error && (
              <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-indigo-500 hover:bg-indigo-400 text-white py-2.5 rounded-lg text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              style={{ boxShadow: "0 0 20px rgba(99,102,241,0.3)" }}
            >
              {loading ? "Signing in…" : "Sign in →"}
            </button>
          </form>

          <p className="text-center text-sm text-slate-300 mt-6">
            Don't have an account?{" "}
            <Link to="/signup" className="text-indigo-400 hover:text-indigo-300 font-medium transition-colors">
              Sign up free
            </Link>
          </p>
        </div>

        <p className="text-center text-xs text-slate-300 mt-4">useagentinbox.com</p>
      </div>
      </div>
    </div>
  );
}
