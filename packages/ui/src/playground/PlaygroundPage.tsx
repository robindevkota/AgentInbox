import { useState, useEffect, useRef, useCallback } from "react";
import { AgentBackground } from "../components/AgentBackground";

const ANIMATION_TOKEN = "playground-animation-demo";
const CHAT_TOKEN = "playground-chat-demo";

// ── Types ─────────────────────────────────────────────────────────────────────

interface LogLine {
  text: string;
  type: "info" | "success" | "error" | "dim";
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export function PlaygroundPage() {
  const [tab, setTab] = useState<"animation" | "chat">("animation");

  return (
    <div className="min-h-screen bg-[#06080f] text-white relative overflow-hidden">
      <AgentBackground />

      {/* Header */}
      <div className="relative z-10 flex items-center justify-between px-8 py-5 border-b border-white/5">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center font-bold text-xs">A</div>
          <span className="font-bold text-sm">AgentInbox</span>
          <span className="text-slate-600 text-sm mx-2">/</span>
          <span className="text-slate-400 text-sm">Playground</span>
        </div>
        <a href="/" className="text-xs text-slate-500 hover:text-slate-300 transition-colors">← Back to home</a>
      </div>

      {/* Hero */}
      <div className="relative z-10 text-center pt-14 pb-10 px-4">
        <div className="inline-flex items-center gap-2 bg-white/5 border border-white/10 rounded-full px-3 py-1.5 mb-5">
          <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
          <span className="text-xs text-slate-400">Live — powered by Claude Pro</span>
        </div>
        <h1 className="text-4xl font-bold text-white mb-3">See it in action</h1>
        <p className="text-slate-400 text-sm max-w-md mx-auto">
          Two real use cases running on the same AgentInbox pipe. Your Claude, your codebase, your rules.
        </p>
      </div>

      {/* Tabs */}
      <div className="relative z-10 flex justify-center mb-8">
        <div className="flex bg-white/5 border border-white/10 rounded-xl p-1 gap-1">
          <button
            onClick={() => setTab("animation")}
            className={`px-6 py-2.5 rounded-lg text-sm font-medium transition-all ${
              tab === "animation"
                ? "bg-indigo-500 text-white shadow-lg shadow-indigo-500/20"
                : "text-slate-400 hover:text-white"
            }`}
          >
            🎨 Animation Generator
          </button>
          <button
            onClick={() => setTab("chat")}
            className={`px-6 py-2.5 rounded-lg text-sm font-medium transition-all ${
              tab === "chat"
                ? "bg-indigo-500 text-white shadow-lg shadow-indigo-500/20"
                : "text-slate-400 hover:text-white"
            }`}
          >
            💬 Customer Support
          </button>
        </div>
      </div>

      {/* Tab content */}
      <div className="relative z-10 max-w-6xl mx-auto px-6 pb-16">
        {tab === "animation" ? <AnimationTab /> : <ChatTab />}
      </div>

      {/* Waitlist */}
      <div className="relative z-10 border-t border-white/5 py-12 px-4 text-center">
        <p className="text-slate-400 text-sm mb-4">Want to set this up for your own project?</p>
        <WaitlistForm />
      </div>
    </div>
  );
}

// ── Animation Tab ─────────────────────────────────────────────────────────────

function AnimationTab() {
  const [prompt, setPrompt] = useState("");
  const [taskId, setTaskId] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("idle");
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [animCode, setAnimCode] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const logRef = useRef<HTMLDivElement>(null);

  const addLog = useCallback((text: string, type: LogLine["type"] = "info") => {
    setLogs((prev) => [...prev.slice(-30), { text, type }]);
    setTimeout(() => logRef.current?.scrollTo(0, logRef.current.scrollHeight), 50);
  }, []);

  // Default animation on mount
  useEffect(() => {
    runDefaultAnimation();
  }, []);

  function runDefaultAnimation() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;

    const particles: any[] = [];
    for (let i = 0; i < 80; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        r: Math.random() * 2 + 0.5,
        vx: (Math.random() - 0.5) * 0.5,
        vy: (Math.random() - 0.5) * 0.5,
        hue: Math.random() * 60 + 220,
        pulse: Math.random() * Math.PI * 2,
      });
    }

    let animId: number;
    function draw() {
      ctx.fillStyle = "rgba(6,8,15,0.15)";
      ctx.fillRect(0, 0, canvas!.width, canvas!.height);
      particles.forEach((p) => {
        p.pulse += 0.02;
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0 || p.x > canvas!.width) p.vx *= -1;
        if (p.y < 0 || p.y > canvas!.height) p.vy *= -1;
        const a = 0.4 + Math.sin(p.pulse) * 0.3;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${p.hue},80%,70%,${a})`;
        ctx.fill();
      });
      animId = requestAnimationFrame(draw);
    }
    draw();
    (canvasRef.current as any)._animId = animId!;
  }

  function runAnimCode(code: string) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if ((canvas as any)._animId) cancelAnimationFrame((canvas as any)._animId);
    const ctx = canvas.getContext("2d")!;
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    try {
      const fn = new Function("canvas", "ctx", code);
      fn(canvas, ctx);
    } catch (e) {
      addLog(`Error running animation: ${e}`, "error");
      runDefaultAnimation();
    }
  }

  async function generate() {
    if (!prompt.trim() || submitting) return;
    setSubmitting(true);
    setLogs([]);
    setAnimCode(null);
    setStatus("submitting");
    addLog("Submitting to AgentInbox...", "dim");

    try {
      const res = await fetch(`/api/submit/${ANIMATION_TOKEN}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: prompt.trim(),
          description: `Generate a canvas animation: ${prompt.trim()}. Return only JavaScript code that uses the provided canvas and ctx variables. No imports, no document.getElementById, just animation logic with requestAnimationFrame. Store the animId on canvas._animId.`,
        }),
      });
      if (!res.ok) throw new Error("Submission failed");
      const data = await res.json();
      setTaskId(data.id);
      setStatus("pending");
      addLog(`Task created: ${data.id.slice(0, 8)}...`, "dim");
      addLog("⚡ Claude is on it...", "info");
    } catch (e) {
      addLog("Submission failed — is the server running?", "error");
      setStatus("idle");
      setSubmitting(false);
    }
  }

  // Poll for task completion
  useEffect(() => {
    if (!taskId) return;
    let closed = false;

    const messages = [
      "⚡ Claude is on it...",
      "🔍 Analyzing your prompt...",
      "✍️ Writing animation code...",
      "🎨 Adding some flair...",
      "🚀 Almost done...",
    ];
    let msgIdx = 0;
    const msgInterval = setInterval(() => {
      if (msgIdx < messages.length - 1) {
        msgIdx++;
        addLog(messages[msgIdx], "dim");
      }
    }, 4000);

    const es = new EventSource(`/api/tasks/${taskId}/stream`);
    es.onmessage = (e) => {
      const data = JSON.parse(e.data);
      if (data.error) { es.close(); return; }
      setStatus(data.status);
      if (data.status === "done") {
        clearInterval(msgInterval);
        addLog("✅ Claude finished!", "success");
        es.close();
        // Fetch full task to get the code
        fetch(`/api/tasks/${taskId}/status`)
          .then((r) => r.json())
          .then((task) => {
            if (task.summary_plain) {
              addLog("🎬 Rendering animation...", "info");
              setAnimCode(task.summary_plain);
              runAnimCode(task.summary_plain);
            }
          });
        setSubmitting(false);
        closed = true;
      } else if (data.status === "escalated" || data.status === "failed") {
        clearInterval(msgInterval);
        addLog("Claude couldn't complete this — try a simpler prompt", "error");
        setSubmitting(false);
        es.close();
        closed = true;
      }
    };
    es.onerror = () => { if (!closed) es.close(); };
    return () => { clearInterval(msgInterval); if (!closed) es.close(); };
  }, [taskId]);

  const examples = ["bouncing colorful balls", "fireworks explosion", "matrix rain effect", "spiral galaxy", "DNA double helix"];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Canvas */}
      <div className="bg-[#0d0f18] border border-white/5 rounded-2xl overflow-hidden" style={{ height: 420 }}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
          <span className="text-xs text-slate-500 font-medium">CANVAS OUTPUT</span>
          {status === "done" && <span className="text-xs text-green-400 font-medium">● Live</span>}
          {(status === "pending" || status === "in_progress") && (
            <span className="text-xs text-indigo-400 font-medium animate-pulse">● Claude is working...</span>
          )}
        </div>
        <canvas ref={canvasRef} className="w-full" style={{ height: 375 }} />
      </div>

      {/* Controls */}
      <div className="flex flex-col gap-4">
        {/* Terminal */}
        <div className="bg-[#0d1117] border border-white/5 rounded-2xl overflow-hidden flex-1">
          <div className="flex items-center gap-1.5 px-4 py-3 border-b border-white/5">
            <div className="w-2.5 h-2.5 rounded-full bg-red-500/60" />
            <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/60" />
            <div className="w-2.5 h-2.5 rounded-full bg-green-500/60" />
            <span className="text-xs text-slate-600 ml-2">claude — agentinbox</span>
          </div>
          <div ref={logRef} className="p-4 h-48 overflow-y-auto font-mono text-xs space-y-1">
            {logs.length === 0 ? (
              <p className="text-slate-600">Waiting for prompt...</p>
            ) : (
              logs.map((l, i) => (
                <p key={i} className={
                  l.type === "success" ? "text-green-400" :
                  l.type === "error" ? "text-red-400" :
                  l.type === "dim" ? "text-slate-500" : "text-slate-300"
                }>{l.text}</p>
              ))
            )}
            {(status === "pending" || status === "in_progress") && (
              <p className="text-slate-500">█<span className="animate-pulse">_</span></p>
            )}
          </div>
        </div>

        {/* Input */}
        <div className="space-y-3">
          <div className="flex gap-2">
            <input
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && generate()}
              placeholder="Describe an animation..."
              className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-indigo-500/50 transition-all"
            />
            <button
              onClick={generate}
              disabled={submitting || !prompt.trim()}
              className="px-5 py-3 bg-indigo-500 hover:bg-indigo-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium rounded-xl transition-colors shrink-0"
            >
              {submitting ? "..." : "Generate"}
            </button>
          </div>

          {/* Examples */}
          <div className="flex flex-wrap gap-1.5">
            {examples.map((ex) => (
              <button
                key={ex}
                onClick={() => setPrompt(ex)}
                className="text-xs px-2.5 py-1 bg-white/5 hover:bg-white/10 text-slate-500 hover:text-slate-300 rounded-lg border border-white/5 transition-colors"
              >
                {ex}
              </button>
            ))}
          </div>
        </div>

        {/* How it works */}
        <div className="bg-indigo-500/5 border border-indigo-500/10 rounded-xl p-4">
          <p className="text-xs text-indigo-400 font-medium mb-2">How this works</p>
          <p className="text-xs text-slate-500 leading-relaxed">
            Your prompt → AgentInbox → Claude writes canvas JS → rendered live. Same pipe you'd use in your own project with a custom <code className="text-indigo-400">CLAUDE.local.md</code>.
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Chat Tab ──────────────────────────────────────────────────────────────────

interface ChatMessage {
  role: "user" | "claude";
  text: string;
  loading?: boolean;
}

const FAKE_STORE = {
  name: "Pixel Store",
  orders: [
    { id: "ORD-1042", product: "Wireless Headphones", status: "Shipped", eta: "June 5", customer: "Robin" },
    { id: "ORD-1039", product: "Mechanical Keyboard", status: "Processing", eta: "June 7", customer: "Robin" },
    { id: "ORD-1028", product: "USB-C Hub", status: "Delivered", eta: "May 30", customer: "Robin" },
  ],
  policy: "Returns accepted within 30 days. Free shipping on orders over $50.",
};

function ChatTab() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: "claude", text: "Hi! I'm the Pixel Store support agent. How can I help you today? You can ask about orders, returns, shipping, or anything else." },
  ]);
  const [input, setInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const chatRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatRef.current?.scrollTo(0, chatRef.current.scrollHeight);
  }, [messages]);

  async function send() {
    if (!input.trim() || submitting) return;
    const userMsg = input.trim();
    setInput("");
    setSubmitting(true);

    setMessages((prev) => [
      ...prev,
      { role: "user", text: userMsg },
      { role: "claude", text: "", loading: true },
    ]);

    try {
      const storeContext = `
You are a customer support agent for Pixel Store.

Store data:
Orders: ${JSON.stringify(FAKE_STORE.orders, null, 2)}
Return policy: ${FAKE_STORE.policy}

Customer asked: "${userMsg}"

Reply conversationally in 1-3 sentences. Be helpful and friendly. If asked about an order, look it up in the data above.
      `.trim();

      const res = await fetch(`/api/submit/${CHAT_TOKEN}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: `Customer question: ${userMsg.slice(0, 60)}`,
          description: storeContext,
        }),
      });

      if (!res.ok) throw new Error("Failed");
      const data = await res.json();

      // Poll for reply
      const taskId = data.id;
      let attempts = 0;
      const poll = setInterval(async () => {
        attempts++;
        if (attempts > 60) {
          clearInterval(poll);
          setMessages((prev) => prev.map((m, i) => i === prev.length - 1 ? { ...m, text: "Sorry, I'm taking too long. Please try again.", loading: false } : m));
          setSubmitting(false);
          return;
        }
        const r = await fetch(`/api/tasks/${taskId}/status`);
        const task = await r.json();
        if (task.status === "done" && task.summary_plain) {
          clearInterval(poll);
          setMessages((prev) => prev.map((m, i) => i === prev.length - 1 ? { ...m, text: task.summary_plain!, loading: false } : m));
          setSubmitting(false);
        } else if (task.status === "escalated" || task.status === "failed") {
          clearInterval(poll);
          setMessages((prev) => prev.map((m, i) => i === prev.length - 1 ? { ...m, text: "I'm having trouble with that. Let me connect you with a human agent.", loading: false } : m));
          setSubmitting(false);
        }
      }, 2000);
    } catch {
      setMessages((prev) => prev.map((m, i) => i === prev.length - 1 ? { ...m, text: "Connection error — is the server running?", loading: false } : m));
      setSubmitting(false);
    }
  }

  const suggestions = ["Where is my order ORD-1042?", "What's your return policy?", "When will ORD-1039 arrive?"];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Fake store context */}
      <div className="bg-[#0d0f18] border border-white/5 rounded-2xl p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-indigo-500/20 flex items-center justify-center text-lg">🛍️</div>
          <div>
            <p className="font-semibold text-white">{FAKE_STORE.name}</p>
            <p className="text-xs text-slate-500">Demo store — Claude has access to this data</p>
          </div>
        </div>

        <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-3">Recent Orders</p>
        <div className="space-y-2 mb-5">
          {FAKE_STORE.orders.map((o) => (
            <div key={o.id} className="bg-white/5 border border-white/5 rounded-xl px-4 py-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-mono text-indigo-400">{o.id}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  o.status === "Delivered" ? "bg-green-500/20 text-green-400" :
                  o.status === "Shipped" ? "bg-indigo-500/20 text-indigo-400" :
                  "bg-yellow-500/20 text-yellow-400"
                }`}>{o.status}</span>
              </div>
              <p className="text-sm text-slate-300">{o.product}</p>
              <p className="text-xs text-slate-600">ETA: {o.eta}</p>
            </div>
          ))}
        </div>

        <div className="bg-white/5 border border-white/5 rounded-xl px-4 py-3">
          <p className="text-xs text-slate-500 mb-1 font-medium">Return Policy</p>
          <p className="text-xs text-slate-400">{FAKE_STORE.policy}</p>
        </div>

        <div className="mt-4 bg-indigo-500/5 border border-indigo-500/10 rounded-xl p-3">
          <p className="text-xs text-indigo-400 font-medium mb-1">How this works</p>
          <p className="text-xs text-slate-500 leading-relaxed">Claude receives the store data + your question via AgentInbox. Your <code className="text-indigo-400">CLAUDE.local.md</code> defines how to respond.</p>
        </div>
      </div>

      {/* Chat */}
      <div className="bg-[#0d0f18] border border-white/5 rounded-2xl flex flex-col" style={{ height: 520 }}>
        <div className="px-4 py-3 border-b border-white/5 flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
          <span className="text-xs text-slate-400 font-medium">Pixel Store Support · Claude</span>
        </div>

        <div ref={chatRef} className="flex-1 overflow-y-auto p-4 space-y-3">
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm ${
                m.role === "user"
                  ? "bg-indigo-500 text-white rounded-br-sm"
                  : "bg-white/5 border border-white/5 text-slate-300 rounded-bl-sm"
              }`}>
                {m.loading ? (
                  <span className="flex gap-1 items-center py-0.5">
                    <span className="w-1.5 h-1.5 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                    <span className="w-1.5 h-1.5 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                    <span className="w-1.5 h-1.5 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                  </span>
                ) : m.text}
              </div>
            </div>
          ))}
        </div>

        {/* Suggestions */}
        {messages.length <= 1 && (
          <div className="px-4 pb-2 flex flex-wrap gap-1.5">
            {suggestions.map((s) => (
              <button key={s} onClick={() => setInput(s)} className="text-xs px-2.5 py-1 bg-white/5 hover:bg-white/10 text-slate-500 hover:text-slate-300 rounded-lg border border-white/5 transition-colors">
                {s}
              </button>
            ))}
          </div>
        )}

        <div className="p-3 border-t border-white/5 flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
            placeholder="Ask about your order..."
            className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-indigo-500/50 transition-all"
          />
          <button
            onClick={send}
            disabled={submitting || !input.trim()}
            className="px-4 py-2.5 bg-indigo-500 hover:bg-indigo-600 disabled:opacity-40 text-white text-sm font-medium rounded-xl transition-colors"
          >
            {submitting ? "..." : "→"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Waitlist ──────────────────────────────────────────────────────────────────

function WaitlistForm() {
  const [email, setEmail] = useState("");
  const [done, setDone] = useState(false);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    // Store in localStorage for now — Stripe/backend later
    const existing = JSON.parse(localStorage.getItem("waitlist") || "[]");
    existing.push({ email: email.trim(), date: new Date().toISOString() });
    localStorage.setItem("waitlist", JSON.stringify(existing));
    setDone(true);
  }

  if (done) return (
    <div className="text-center">
      <p className="text-green-400 font-medium">You're on the list! We'll reach out when early access opens.</p>
    </div>
  );

  return (
    <form onSubmit={submit} className="flex gap-2 max-w-sm mx-auto">
      <input
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="your@email.com"
        className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-indigo-500/50 transition-all"
      />
      <button type="submit" className="px-5 py-2.5 bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-medium rounded-xl transition-colors shrink-0">
        Join waitlist
      </button>
    </form>
  );
}
