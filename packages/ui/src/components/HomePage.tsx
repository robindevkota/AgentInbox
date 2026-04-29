export function HomePage() {
  return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center px-6">
      {/* Hero */}
      <div className="text-center max-w-2xl">
        <h1 className="text-6xl font-extrabold text-white tracking-tight mb-4">
          AgentInbox
        </h1>
        <p className="text-xl text-slate-400 mb-10 leading-relaxed">
          Clients submit bugs and requests — Claude AI ships the fix, everyone
          sees exactly what happened.
        </p>

        {/* CTA buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-20">
          <a
            href="/pm"
            className="inline-flex items-center gap-2 bg-indigo-500 hover:bg-indigo-400 text-white font-semibold px-7 py-3.5 rounded-xl transition-colors shadow-lg shadow-indigo-500/20"
          >
            PM Dashboard →
          </a>
          <a
            href="#"
            className="inline-flex items-center gap-2 border border-slate-600 hover:border-slate-400 text-slate-300 hover:text-white font-semibold px-7 py-3.5 rounded-xl transition-colors"
          >
            Submit a request
          </a>
        </div>

        {/* Feature grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 text-left">
          <div className="bg-slate-800/60 border border-slate-700/60 rounded-2xl p-6">
            <div className="text-3xl mb-3">📥</div>
            <h3 className="text-white font-semibold mb-1 tracking-tight">
              Client submits
            </h3>
            <p className="text-slate-400 text-sm leading-relaxed">
              Clients use a simple form — no account needed, no back-and-forth.
            </p>
          </div>
          <div className="bg-slate-800/60 border border-slate-700/60 rounded-2xl p-6">
            <div className="text-3xl mb-3">🤖</div>
            <h3 className="text-white font-semibold mb-1 tracking-tight">
              Claude fixes
            </h3>
            <p className="text-slate-400 text-sm leading-relaxed">
              Claude reads the repo, proposes a plan, and ships the code change
              automatically.
            </p>
          </div>
          <div className="bg-slate-800/60 border border-slate-700/60 rounded-2xl p-6">
            <div className="text-3xl mb-3">✅</div>
            <h3 className="text-white font-semibold mb-1 tracking-tight">
              Everyone sees
            </h3>
            <p className="text-slate-400 text-sm leading-relaxed">
              A live status link shows exactly what was done, with a plain-English
              summary.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
