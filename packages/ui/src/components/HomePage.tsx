import { useEffect, useRef } from "react";

// ── Animated neural-network canvas background ──────────────────────────────
function NeuralBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    let animId: number;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    const NODES = 72;
    const nodes = Array.from({ length: NODES }, () => ({
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      vx: (Math.random() - 0.5) * 0.4,
      vy: (Math.random() - 0.5) * 0.4,
      r: Math.random() * 2 + 1,
    }));

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // connections
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[i].x - nodes[j].x;
          const dy = nodes[i].y - nodes[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 160) {
            ctx.beginPath();
            ctx.strokeStyle = `rgba(99,102,241,${(1 - dist / 160) * 0.35})`;
            ctx.lineWidth = 0.8;
            ctx.moveTo(nodes[i].x, nodes[i].y);
            ctx.lineTo(nodes[j].x, nodes[j].y);
            ctx.stroke();
          }
        }
      }

      // nodes
      nodes.forEach((n) => {
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(129,140,248,0.7)";
        ctx.fill();

        n.x += n.vx;
        n.y += n.vy;
        if (n.x < 0 || n.x > canvas.width) n.vx *= -1;
        if (n.y < 0 || n.y > canvas.height) n.vy *= -1;
      });

      animId = requestAnimationFrame(draw);
    };
    draw();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 w-full h-full pointer-events-none"
      style={{ zIndex: 0 }}
    />
  );
}

// ── Feature card with 3D tilt on hover ────────────────────────────────────
function FeatureCard({ icon, title, desc, accent }: { icon: string; title: string; desc: string; accent: string }) {
  const cardRef = useRef<HTMLDivElement>(null);

  const onMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = cardRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    const rotX = ((y - cy) / cy) * -10;
    const rotY = ((x - cx) / cx) * 10;
    el.style.transform = `perspective(600px) rotateX(${rotX}deg) rotateY(${rotY}deg) scale(1.04)`;
  };

  const onMouseLeave = () => {
    if (cardRef.current) cardRef.current.style.transform = "perspective(600px) rotateX(0) rotateY(0) scale(1)";
  };

  return (
    <div
      ref={cardRef}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
      className="relative bg-slate-800/70 border border-slate-700/60 rounded-2xl p-6 backdrop-blur-sm cursor-default"
      style={{ transition: "transform 0.15s ease", willChange: "transform" }}
    >
      <div className={`text-3xl mb-4 w-12 h-12 rounded-xl flex items-center justify-center ${accent}`}>{icon}</div>
      <h3 className="text-white font-bold text-base mb-2 tracking-tight">{title}</h3>
      <p className="text-slate-400 text-sm leading-relaxed">{desc}</p>
    </div>
  );
}

// ── Animated flow step ─────────────────────────────────────────────────────
function FlowStep({ num, label, sub }: { num: string; label: string; sub: string }) {
  return (
    <div className="flex flex-col items-center text-center gap-2">
      <div className="w-10 h-10 rounded-full bg-indigo-500/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400 font-bold text-sm">{num}</div>
      <p className="text-white font-semibold text-sm">{label}</p>
      <p className="text-slate-500 text-xs">{sub}</p>
    </div>
  );
}

// ── Main ───────────────────────────────────────────────────────────────────
export function HomePage() {
  return (
    <div className="relative min-h-screen bg-[#080c14] text-white overflow-x-hidden">
      <NeuralBackground />

      {/* Radial glow */}
      <div className="fixed inset-0 pointer-events-none" style={{ zIndex: 0 }}>
        <div className="absolute top-[-20%] left-1/2 -translate-x-1/2 w-[800px] h-[800px] rounded-full"
          style={{ background: "radial-gradient(circle, rgba(99,102,241,0.12) 0%, transparent 70%)" }} />
      </div>

      <div className="relative z-10 flex flex-col items-center px-6">

        {/* ── Nav ── */}
        <nav className="w-full max-w-6xl flex items-center justify-between py-6">
          <span className="text-white font-extrabold text-xl tracking-tight">AgentInbox</span>
          <div className="flex items-center gap-3">
            <a href="/login" className="text-slate-400 hover:text-white text-sm transition-colors">Sign in</a>
            <a href="/signup" className="bg-indigo-500 hover:bg-indigo-400 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors shadow-lg shadow-indigo-500/20">
              Get started free →
            </a>
          </div>
        </nav>

        {/* ── Hero ── */}
        <div className="text-center max-w-3xl mt-16 mb-8">
          <div className="inline-flex items-center gap-2 bg-indigo-500/10 border border-indigo-500/20 rounded-full px-4 py-1.5 text-indigo-400 text-xs font-medium mb-8">
            ⚡ No API key needed — works with Claude Pro
          </div>
          <h1 className="text-6xl sm:text-7xl font-extrabold tracking-tight mb-6 leading-tight">
            Your clients submit bugs.
            <br />
            <span className="text-transparent bg-clip-text" style={{ backgroundImage: "linear-gradient(135deg, #818cf8 0%, #6366f1 50%, #a78bfa 100%)" }}>
              Claude fixes them.
            </span>
          </h1>
          <p className="text-slate-400 text-xl leading-relaxed mb-10 max-w-2xl mx-auto">
            AgentInbox connects your client's bug reports directly to your Claude Code session.
            No WhatsApp chains. No interruptions. Screenshot proof on every fix.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <a href="/signup"
              className="inline-flex items-center gap-2 bg-indigo-500 hover:bg-indigo-400 text-white font-bold px-8 py-4 rounded-xl transition-all shadow-xl shadow-indigo-500/30 text-base"
              style={{ boxShadow: "0 0 32px rgba(99,102,241,0.35)" }}>
              Start free — 5 min setup →
            </a>
            <a href="/pm"
              className="inline-flex items-center gap-2 border border-slate-700 hover:border-slate-500 text-slate-300 hover:text-white font-semibold px-8 py-4 rounded-xl transition-colors text-base">
              PM Dashboard
            </a>
          </div>
        </div>

        {/* ── Flow ── */}
        <div className="w-full max-w-3xl my-16">
          <div className="bg-slate-800/40 border border-slate-700/40 rounded-2xl p-8 backdrop-blur-sm">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
              <FlowStep num="1" label="Client submits" sub="Simple form, no account needed" />
              <div className="text-slate-600 text-2xl hidden sm:block">→</div>
              <FlowStep num="2" label="Claude picks it up" sub="Via MCP socket, real-time" />
              <div className="text-slate-600 text-2xl hidden sm:block">→</div>
              <FlowStep num="3" label="Bug fixed in repo" sub="Your codebase, your rules" />
              <div className="text-slate-600 text-2xl hidden sm:block">→</div>
              <FlowStep num="4" label="Screenshot posted back" sub="PM sees proof instantly" />
            </div>
          </div>
        </div>

        {/* ── Features ── */}
        <div className="w-full max-w-6xl mb-20">
          <h2 className="text-center text-3xl font-bold mb-3">Everything included</h2>
          <p className="text-center text-slate-500 text-sm mb-10">One pipe. Full loop.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            <FeatureCard icon="📥" title="Client submission form" desc="Shareable link — no account needed. Clients attach screenshots, PDFs, or Word docs. Custom fields for Environment, Module, Priority." accent="bg-indigo-500/10" />
            <FeatureCard icon="⚡" title="Real-time task delivery" desc="Tasks land in your Claude Code session via WebSocket the moment they're submitted. No polling. No ngrok. No extra terminals." accent="bg-violet-500/10" />
            <FeatureCard icon="🤖" title="Claude Pro as free API" desc="Already paying $20/mo for Claude Pro? AgentInbox routes work into your existing session — zero Anthropic API cost on top." accent="bg-blue-500/10" />
            <FeatureCard icon="📸" title="Screenshot proof on every fix" desc="Claude takes a Playwright screenshot of the live result and posts it back. PM sees the fix. Client sees the fix. No trust gap." accent="bg-emerald-500/10" />
            <FeatureCard icon="✅" title="Approval gate" desc="Enable require-approval per project. Claude proposes a plan — you approve before any code runs. Safe for production." accent="bg-amber-500/10" />
            <FeatureCard icon="🔔" title="Live PM notifications" desc="Toast alerts with sound the moment Claude completes a task. Tab badge shows unread count. No refreshing needed." accent="bg-pink-500/10" />
            <FeatureCard icon="📋" title="Full audit log" desc="Every status change recorded — who changed what, when. Escalation history. Rejection reasons. Compliance-ready." accent="bg-cyan-500/10" />
            <FeatureCard icon="🎨" title="White-label branding" desc="Custom brand name and color per project. Clients see your brand on the submission form, not AgentInbox." accent="bg-orange-500/10" />
            <FeatureCard icon="🔧" title="8-line setup" desc="Add .mcp.json to your project. Claude Code auto-connects on startup. Or paste one prompt — Claude sets up your entire workspace automatically." accent="bg-indigo-500/10" />
          </div>
        </div>

        {/* ── Pricing ── */}
        <div className="w-full max-w-4xl mb-24">
          <h2 className="text-center text-3xl font-bold mb-3">Simple pricing</h2>
          <p className="text-center text-slate-500 text-sm mb-10">Priced by projects connected, not by AI usage.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {[
              { name: "Free", price: "$0", projects: "1 project", tasks: "50 tasks/mo", cta: "Get started", href: "/signup", highlight: false },
              { name: "Starter", price: "$19/mo", projects: "2 projects", tasks: "Unlimited tasks", cta: "Get started", href: "/signup", highlight: false },
              { name: "Growth", price: "$49/mo", projects: "10 projects", tasks: "Unlimited tasks", cta: "Get started", href: "/signup", highlight: true },
              { name: "Pro", price: "$99/mo", projects: "Unlimited", tasks: "Unlimited tasks", cta: "Get started", href: "/signup", highlight: false },
            ].map((p) => (
              <div key={p.name}
                className={`rounded-2xl p-6 border flex flex-col gap-4 ${p.highlight ? "bg-indigo-500/10 border-indigo-500/40" : "bg-slate-800/50 border-slate-700/40"}`}>
                <div>
                  <p className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-1">{p.name}</p>
                  <p className="text-3xl font-extrabold text-white">{p.price}</p>
                </div>
                <div className="space-y-1 flex-1">
                  <p className="text-slate-300 text-sm">✓ {p.projects}</p>
                  <p className="text-slate-300 text-sm">✓ {p.tasks}</p>
                  <p className="text-slate-300 text-sm">✓ PM dashboard</p>
                  <p className="text-slate-300 text-sm">✓ MCP + WebSocket</p>
                </div>
                <a href={p.href}
                  className={`text-center text-sm font-semibold py-2.5 rounded-xl transition-colors ${p.highlight ? "bg-indigo-500 hover:bg-indigo-400 text-white" : "bg-slate-700 hover:bg-slate-600 text-white"}`}>
                  {p.cta}
                </a>
              </div>
            ))}
          </div>
        </div>

        {/* ── Bottom CTA ── */}
        <div className="text-center mb-24">
          <h2 className="text-4xl font-extrabold mb-4">Ready to kill the WhatsApp chain?</h2>
          <p className="text-slate-400 mb-8">Sign up free. Connect Claude. Share a link. Done.</p>
          <a href="/signup"
            className="inline-flex items-center gap-2 bg-indigo-500 hover:bg-indigo-400 text-white font-bold px-10 py-4 rounded-xl transition-all text-lg"
            style={{ boxShadow: "0 0 40px rgba(99,102,241,0.4)" }}>
            Get started free →
          </a>
        </div>

        {/* ── Footer ── */}
        <footer className="w-full max-w-6xl border-t border-slate-800 py-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-slate-600 text-sm mb-6">
          <span>AgentInbox — MIT License</span>
          <div className="flex items-center gap-6">
            <a href="/pm" className="hover:text-slate-400 transition-colors">PM Dashboard</a>
            <a href="/signup" className="hover:text-slate-400 transition-colors">Sign up</a>
            <a href="https://github.com/robindevkota/AgentInbox" target="_blank" rel="noreferrer" className="hover:text-slate-400 transition-colors">GitHub</a>
          </div>
        </footer>

      </div>
    </div>
  );
}
