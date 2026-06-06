import { useEffect, useRef } from "react";

// ── Helpers ───────────────────────────────────────────────────────────────
function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// ── Hero scene canvas ─────────────────────────────────────────────────────
function HeroScene() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    let animId: number;

    const W = 1100, H = 440;
    canvas.width = W; canvas.height = H;

    const BUG_X   = 130;   // Bug reporters (left)
    const CENTER_X = 550;  // Agent home base (center top)
    const DEV_X   = 880;   // Monitor (right)
    const CLAUDE_X = DEV_X + 90; // Claude char — right of monitor
    const GROUND  = 310;   // ground y
    const PERCH_Y = 80;    // agent sits up here at start
    const SPEED   = 1.1;   // slow convincing walk

    // phases:
    // idle       — agent perched top-center, gentle bob, reporters dim
    // bug-arrive — reporter bounces, bug floats right toward center, agent drops heroically
    // to-bug     — agent runs LEFT to pick up bug
    // to-dev     — agent runs RIGHT toward codebase carrying bug
    // fixing     — agent stands left of monitor, claude fixes, files flicker
    // handoff    — claude extends arm, hands screenshot card to agent
    // to-client  — agent runs LEFT all the way to reporter to deliver fix
    // deliver    — agent at reporter side, toast shows, celebrates
    // to-center  — agent walks back right to center perch
    type Phase = "idle"|"bug-arrive"|"to-bug"|"to-dev"|"fixing"|"handoff"|"to-client"|"deliver"|"to-center";
    let phase: Phase = "idle";
    let tick = 0;
    let subTick = 0;
    let codeFlick = 0;
    let handoffProgress = 0;
    let toastAlpha = 0;
    let activeReporter = 0;

    const agent = { x: CENTER_X, y: PERCH_Y, frame: 0, dir: 1, carrying: false, hasScreenshot: false, excited: 0, landing: false, landTick: 0 };
    const bugProj = { x: BUG_X + 30, y: GROUND - 30, active: false, done: false };

    // status label — fades in, stays sticky so user can read the full line
    let labelText = "💤  AgentInbox on standby — waiting for tasks...";
    let labelAlpha = 0;
    let labelTick = 0;

    const safe = (n: number) => isFinite(n) ? n : 0;
    const rr = (x: number, y: number, w: number, h: number, r: number) => roundRect(ctx, x, y, w, h, r);

    // ── Draw agent (inbox char) ──────────────────────────────────────────
    const drawAgent = () => {
      const { x, y, frame, dir, carrying, hasScreenshot, excited } = agent;
      ctx.save();
      ctx.translate(safe(x), safe(y));
      if (dir < 0) ctx.scale(-1, 1);

      const moving = carrying || agent.landing;
      const swing  = moving ? Math.sin(frame * 0.3) * 12 : 0;
      const bob    = moving ? Math.abs(Math.sin(frame * 0.3)) * 6 : Math.abs(Math.sin(tick * 0.03)) * 4;
      const exciteY = excited > 0 ? -Math.abs(Math.sin(excited * 0.18)) * 20 : 0;
      const BY = exciteY;

      // shadow
      ctx.fillStyle = "rgba(99,102,241,0.18)";
      ctx.beginPath(); ctx.ellipse(0, 38 + BY * 0.2, 24, 8, 0, 0, Math.PI * 2); ctx.fill();

      // legs
      ctx.strokeStyle = "#6366f1"; ctx.lineWidth = 6; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(-9, 16 + BY - bob); ctx.lineTo(-9 - swing, 36 + BY - bob); ctx.stroke();
      ctx.beginPath(); ctx.moveTo( 9, 16 + BY - bob); ctx.lineTo( 9 + swing, 36 + BY - bob); ctx.stroke();

      // body
      ctx.fillStyle = "#312e81"; ctx.strokeStyle = "#818cf8"; ctx.lineWidth = 3;
      rr(-24, -28 + BY - bob, 48, 44, 8); ctx.fill(); ctx.stroke();

      // inbox flap
      ctx.fillStyle = "#4338ca";
      ctx.beginPath();
      ctx.moveTo(-24, -28 + BY - bob);
      ctx.lineTo(0,   -10 + BY - bob);
      ctx.lineTo(24,  -28 + BY - bob);
      ctx.closePath(); ctx.fill();

      // label — bigger and clearly visible
      ctx.fillStyle = "#e0e7ff";
      ctx.font = "bold 10px monospace"; ctx.textAlign = "center";
      ctx.fillText("AgentInbox", 0, 6 + BY - bob);

      // eyes
      const eyeR = excited > 0 ? 5.5 : 4.5;
      ctx.fillStyle = "#e0e7ff";
      ctx.beginPath(); ctx.arc(-8, -13 + BY - bob, eyeR, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc( 8, -13 + BY - bob, eyeR, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#1e1b4b";
      ctx.beginPath(); ctx.arc(-7.5, -13 + BY - bob, eyeR * 0.55, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(  8.5, -13 + BY - bob, eyeR * 0.55, 0, Math.PI * 2); ctx.fill();
      if (excited > 0) {
        ctx.fillStyle = "rgba(250,204,21,1)";
        ctx.font = "9px serif"; ctx.textAlign = "center";
        ctx.fillText("★", -8, -10 + BY - bob);
        ctx.fillText("★",  8, -10 + BY - bob);
      }

      // arms + carried item
      ctx.strokeStyle = "#6366f1"; ctx.lineWidth = 5;
      if (carrying) {
        ctx.beginPath(); ctx.moveTo(-22, -6 + BY - bob); ctx.lineTo(-32, -32 + BY - bob); ctx.stroke();
        ctx.beginPath(); ctx.moveTo( 22, -6 + BY - bob); ctx.lineTo( 32, -32 + BY - bob); ctx.stroke();
        if (hasScreenshot) {
          // screenshot card above head
          ctx.fillStyle = "#0f172a"; ctx.strokeStyle = "#34d399"; ctx.lineWidth = 2;
          rr(-22, -78 + BY - bob, 44, 32, 5); ctx.fill(); ctx.stroke();
          ctx.fillStyle = "rgba(52,211,153,0.45)";
          ctx.fillRect(-16, -72 + BY - bob, 32, 4);
          ctx.fillRect(-16, -65 + BY - bob, 22, 4);
          ctx.fillRect(-16, -58 + BY - bob, 28, 4);
          ctx.fillStyle = "#34d399"; ctx.font = "11px serif"; ctx.textAlign = "center";
          ctx.fillText("📸", 10, -55 + BY - bob);
          ctx.fillStyle = "rgba(199,210,254,0.8)"; ctx.font = "bold 6px monospace";
          ctx.fillText("fix_proof.png", 0, -44 + BY - bob);
        } else {
          // bug above head
          ctx.fillStyle = "rgba(239,68,68,0.95)";
          ctx.beginPath(); ctx.arc(0, -54 + BY - bob, 16, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = "rgba(252,165,165,0.7)"; ctx.lineWidth = 2;
          ctx.stroke();
          ctx.font = "16px serif"; ctx.textAlign = "center";
          ctx.fillText("🐛", 0, -48 + BY - bob);
        }
      } else if (excited > 0) {
        ctx.beginPath(); ctx.moveTo(-22, -6 + BY - bob); ctx.lineTo(-36, -28 + BY - bob); ctx.stroke();
        ctx.beginPath(); ctx.moveTo( 22, -6 + BY - bob); ctx.lineTo( 36, -28 + BY - bob); ctx.stroke();
        // confetti
        if (Math.floor(excited / 4) % 2 === 0) {
          ctx.font = "16px serif"; ctx.fillText("🎉", -40, -40 + BY - bob);
          ctx.fillText("✨",  40, -38 + BY - bob);
        }
      } else {
        ctx.beginPath(); ctx.moveTo(-22, -6 + BY - bob); ctx.lineTo(-34, 12 + BY - bob); ctx.stroke();
        ctx.beginPath(); ctx.moveTo( 22, -6 + BY - bob); ctx.lineTo( 34, 12 + BY - bob); ctx.stroke();
      }

      ctx.restore();
    };

    // ── Draw Claude char (right of monitor) ─────────────────────────────
    const drawClaude = () => {
      const active = phase === "fixing" || phase === "handoff";
      const cx = CLAUDE_X, cy = GROUND;
      ctx.save(); ctx.translate(cx, cy);

      const bob = active ? Math.abs(Math.sin(codeFlick * 0.06)) * 4 : Math.abs(Math.sin(tick * 0.03)) * 3;

      // shadow
      ctx.fillStyle = "rgba(139,92,246,0.18)";
      ctx.beginPath(); ctx.ellipse(0, 36, 20, 7, 0, 0, Math.PI * 2); ctx.fill();

      // legs
      ctx.strokeStyle = "#7c3aed"; ctx.lineWidth = 6; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(-8, 14 - bob); ctx.lineTo(-8, 34 - bob); ctx.stroke();
      ctx.beginPath(); ctx.moveTo( 8, 14 - bob); ctx.lineTo( 8, 34 - bob); ctx.stroke();

      // body — robe shape
      ctx.fillStyle = active ? "#1e1b4b" : "#120e2e";
      ctx.strokeStyle = active ? "#a78bfa" : "rgba(139,92,246,0.3)";
      ctx.lineWidth = 3;
      rr(-24, -34 - bob, 48, 48, 10); ctx.fill(); ctx.stroke();

      // BIG Claude "C" — clearly visible
      ctx.fillStyle = active ? "#c4b5fd" : "rgba(196,181,253,0.6)";
      ctx.font = `bold 24px monospace`; ctx.textAlign = "center";
      ctx.fillText("C", 0, -11 - bob);

      // "Claude" label below C — clearly readable
      ctx.fillStyle = active ? "#e9d5ff" : "rgba(233,213,255,0.55)";
      ctx.font = "bold 10px monospace";
      ctx.fillText("Claude", 0, 6 - bob);

      // eyes
      const eyeGlow = active ? "#818cf8" : "#1e1b4b";
      ctx.fillStyle = "#e0e7ff";
      ctx.beginPath(); ctx.arc(-8, -20 - bob, 5, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc( 8, -20 - bob, 5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = eyeGlow;
      ctx.beginPath(); ctx.arc(-7, -20 - bob, 2.8, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc( 9, -20 - bob, 2.8, 0, Math.PI * 2); ctx.fill();

      // arms
      ctx.strokeStyle = "#7c3aed"; ctx.lineWidth = 5;
      if (phase === "handoff") {
        // left arm extended toward agent (left side)
        ctx.beginPath(); ctx.moveTo(-24, -10 - bob); ctx.lineTo(-52, -22 - bob); ctx.stroke();
        ctx.beginPath(); ctx.moveTo( 24, -10 - bob); ctx.lineTo( 36,  8 - bob); ctx.stroke();
      } else {
        ctx.beginPath(); ctx.moveTo(-24, -10 - bob); ctx.lineTo(-36,  8 - bob); ctx.stroke();
        ctx.beginPath(); ctx.moveTo( 24, -10 - bob); ctx.lineTo( 36,  8 - bob); ctx.stroke();
      }

      // spark when active
      if (active && Math.floor(codeFlick / 6) % 2 === 0) {
        ctx.font = "18px serif"; ctx.textAlign = "center";
        ctx.fillText("⚡", -40, -38 - bob);
      }

      ctx.restore();
    };

    // ── Draw monitor / codebase ──────────────────────────────────────────
    const drawMonitor = () => {
      const isActive = phase === "fixing" || phase === "handoff";
      const mx = DEV_X, my = GROUND - 200;

      // glow behind monitor
      const g = ctx.createRadialGradient(mx, GROUND, 0, mx, GROUND, 160);
      g.addColorStop(0, `rgba(139,92,246,${isActive ? 0.18 : 0.06})`);
      g.addColorStop(1, "rgba(139,92,246,0)");
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(mx, GROUND, 160, 0, Math.PI * 2); ctx.fill();

      // monitor bezel
      ctx.fillStyle = "#080612";
      ctx.strokeStyle = isActive ? "#7c3aed" : "rgba(139,92,246,0.3)";
      ctx.lineWidth = 2.5;
      rr(mx - 80, my, 160, 120, 12); ctx.fill(); ctx.stroke();

      // screen inner
      ctx.fillStyle = "#0d0a1e";
      rr(mx - 72, my + 8, 144, 104, 6); ctx.fill();

      // monitor stand
      ctx.fillStyle = "#1e1b4b"; ctx.strokeStyle = "rgba(139,92,246,0.25)"; ctx.lineWidth = 1;
      ctx.fillRect(mx - 12, my + 120, 24, 18); ctx.strokeRect(mx - 12, my + 120, 24, 18);
      ctx.fillRect(mx - 32, my + 138, 64, 7); ctx.strokeRect(mx - 32, my + 138, 64, 7);

      // file tree — the KEY part: shows Claude.md, agents, skills, rules
      const files = [
        { text: "📁 .claude/",   indent: false },
        { text: "  📄 CLAUDE.md", indent: true  },
        { text: "  🤖 agents/",   indent: true  },
        { text: "  🛠  skills/",  indent: true  },
        { text: "  📋 rules/",    indent: true  },
      ];
      const activeFile = isActive ? Math.floor(codeFlick / 14) % files.length : -1;
      files.forEach(({ text }, i) => {
        const isHl = i === activeFile;
        if (isHl) {
          ctx.fillStyle = "rgba(99,102,241,0.2)";
          ctx.fillRect(mx - 68, my + 18 + i * 17, 136, 14);
        }
        ctx.fillStyle = isHl ? "#c7d2fe" : "rgba(165,180,252,0.7)";
        ctx.font = `${isHl ? "bold " : ""}11px monospace`;
        ctx.textAlign = "left";
        ctx.fillText(text, mx - 64, my + 30 + i * 18);
      });

      // screenshot preview (appears late in fixing)
      if (isActive && codeFlick > 70) {
        const fa = phase === "handoff" ? Math.max(0, 1 - handoffProgress * 2) : Math.min(1, (codeFlick - 70) / 25);
        ctx.globalAlpha = fa;
        ctx.fillStyle = "#0f2218"; ctx.strokeStyle = "#34d399"; ctx.lineWidth = 1.5;
        rr(mx + 22, my + 12, 44, 32, 5); ctx.fill(); ctx.stroke();
        ctx.fillStyle = "rgba(52,211,153,0.4)";
        ctx.fillRect(mx + 26, my + 17, 36, 3);
        ctx.fillRect(mx + 26, my + 23, 26, 3);
        ctx.fillRect(mx + 26, my + 29, 30, 3);
        ctx.fillStyle = "#34d399"; ctx.font = "11px serif"; ctx.textAlign = "center";
        ctx.fillText("📸", mx + 55, my + 38);
        ctx.globalAlpha = 1;
      }

      // label below monitor
      ctx.fillStyle = "rgba(196,181,253,0.95)";
      ctx.font = "bold 14px monospace"; ctx.textAlign = "center";
      ctx.fillText("Developer Codebase", mx, GROUND + 22);
    };

    // ── Draw reporters (left side) ───────────────────────────────────────
    const drawReporters = () => {
      const reporters = [
        { emoji: "👤", label: "Client",  y: GROUND - 60 },
        { emoji: "🧪", label: "QA",      y: GROUND      },
        { emoji: "📋", label: "PM / CI", y: GROUND + 60 },
      ];
      reporters.forEach(({ emoji, label, y }, i) => {
        const isActive = (phase === "bug-arrive" || phase === "to-bug") && i === activeReporter;
        const bounce = isActive ? -Math.abs(Math.sin(subTick * 0.2)) * 10 : 0;

        ctx.font = "30px serif"; ctx.textAlign = "center";
        ctx.fillText(emoji, BUG_X, y + bounce);

        ctx.fillStyle = isActive ? "#fca5a5" : "#e2e8f0";
        ctx.font = `bold 13px monospace`; ctx.textAlign = "center";
        ctx.fillText(label, BUG_X, y + 22 + bounce);

        // arrow pointing right
        const arrowA = isActive ? 0.9 : 0.35;
        ctx.strokeStyle = `rgba(239,68,68,${arrowA})`; ctx.lineWidth = isActive ? 2 : 1;
        ctx.setLineDash(isActive ? [] : [3, 6]);
        ctx.beginPath(); ctx.moveTo(BUG_X + 18, y - 10); ctx.lineTo(BUG_X + 45, y - 10); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = `rgba(239,68,68,${arrowA})`;
        ctx.beginPath(); ctx.moveTo(BUG_X + 48, y - 10); ctx.lineTo(BUG_X + 40, y - 15); ctx.lineTo(BUG_X + 40, y - 5); ctx.closePath(); ctx.fill();
      });
    };

    // ── Draw perch (agent's home, top-center) ────────────────────────────
    const drawPerch = () => {
      if (phase !== "idle") return;
      // "on standby" label ABOVE agent head
      ctx.fillStyle = "rgba(165,180,252,0.9)";
      ctx.font = "bold 12px monospace"; ctx.textAlign = "center";
      ctx.fillText("💤 on standby", CENTER_X, PERCH_Y - 22);
      // small indicator dot
      ctx.fillStyle = "rgba(129,140,248,0.4)";
      ctx.beginPath(); ctx.arc(CENTER_X, PERCH_Y - 10, 3, 0, Math.PI * 2); ctx.fill();
      // vertical dashed line down to ground
      ctx.strokeStyle = "rgba(99,102,241,0.06)"; ctx.lineWidth = 1; ctx.setLineDash([4, 8]);
      ctx.beginPath(); ctx.moveTo(CENTER_X, PERCH_Y + 80); ctx.lineTo(CENTER_X, GROUND + 10); ctx.stroke();
      ctx.setLineDash([]);
    };

    // ── Draw ground path ─────────────────────────────────────────────────
    const drawPath = () => {
      // ground line
      ctx.strokeStyle = "rgba(99,102,241,0.18)"; ctx.lineWidth = 1.5; ctx.setLineDash([8, 10]);
      ctx.beginPath(); ctx.moveTo(BUG_X + 55, GROUND + 14); ctx.lineTo(DEV_X - 85, GROUND + 14); ctx.stroke();
      ctx.setLineDash([]);
      // ground shadow beneath path
      ctx.strokeStyle = "rgba(99,102,241,0.06)"; ctx.lineWidth = 6;
      ctx.beginPath(); ctx.moveTo(BUG_X + 55, GROUND + 14); ctx.lineTo(DEV_X - 85, GROUND + 14); ctx.stroke();
      // arrow at codebase end
      ctx.fillStyle = "rgba(99,102,241,0.3)";
      ctx.beginPath(); ctx.moveTo(DEV_X - 82, GROUND + 14); ctx.lineTo(DEV_X - 92, GROUND + 8); ctx.lineTo(DEV_X - 92, GROUND + 20); ctx.closePath(); ctx.fill();
    };

    // ── PM toast ─────────────────────────────────────────────────────────
    const drawToast = () => {
      if (toastAlpha <= 0) return;
      ctx.globalAlpha = Math.min(1, toastAlpha);
      ctx.fillStyle = "#052e16"; ctx.strokeStyle = "rgba(52,211,153,0.7)"; ctx.lineWidth = 1.5;
      rr(W / 2 - 185, 16, 370, 48, 10); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#6ee7b7"; ctx.font = "bold 13px monospace"; ctx.textAlign = "center";
      ctx.fillText("✅  PM Dashboard — Bug fixed! Screenshot ready.", W / 2, 47);
      ctx.globalAlpha = 1;
    };

    // ── Status bar ───────────────────────────────────────────────────────
    const LABELS: Record<Phase, string> = {
      idle:         "💤  AgentInbox on standby — waiting for tasks...",
      "bug-arrive": "🐛  Bug submitted via MCP socket — agent notified!",
      "to-bug":     "🏃  Agent picks up the bug from reporter",
      "to-dev":     "🏃  Carrying bug to developer codebase...",
      fixing:       "⚡  Claude reads CLAUDE.md + agents + skills + rules — fixing...",
      handoff:      "🤝  Claude hands screenshot proof to AgentInbox agent",
      "to-client":  "🏃  Delivering fix + screenshot to reporter...",
      deliver:      "🎉  Fix delivered! Client sees proof. Zero handoffs.",
      "to-center":  "↩️  Agent returns to standby position",
    };

    // ── Phase controller ─────────────────────────────────────────────────
    const setPhase = (p: Phase) => {
      phase = p; subTick = 0;
      labelText = LABELS[p] ?? "";
      labelAlpha = 0; labelTick = 0;
    };
    setTimeout(() => { activeReporter = Math.floor(Math.random() * 3); setPhase("bug-arrive"); }, 2000);

    // ── Main loop ────────────────────────────────────────────────────────
    const loop = () => {
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = "#06080f"; ctx.fillRect(0, 0, W, H);

      tick++; subTick++;

      drawPath();
      drawPerch();
      drawReporters();
      drawMonitor();

      // ── Phase logic ──────────────────────────────────────────────────
      if (phase === "idle") {
        agent.x = CENTER_X; agent.y = PERCH_Y + 30;
        agent.dir = 1; agent.carrying = false; agent.hasScreenshot = false;
        agent.excited = 0; agent.frame = tick;

      } else if (phase === "bug-arrive") {
        // agent still perched, bug floats from reporter toward center
        agent.x = CENTER_X; agent.y = PERCH_Y + 30;
        agent.dir = 1; agent.carrying = false; agent.excited = 0; agent.frame = tick;

        if (!bugProj.done) {
          bugProj.active = true;
          bugProj.x += 3;
          bugProj.y = GROUND - 50 + Math.sin(subTick * 0.1) * 10;
          ctx.font = "20px serif"; ctx.textAlign = "center";
          ctx.fillText("🐛", safe(bugProj.x), safe(bugProj.y));
          ctx.fillStyle = "rgba(239,68,68,0.55)"; ctx.font = "bold 8px monospace";
          ctx.fillText("bug report", safe(bugProj.x), safe(bugProj.y) + 14);
          if (bugProj.x > CENTER_X - 40) { bugProj.done = true; }
        } else {
          // bug arrived — agent gets excited and starts dropping
          agent.excited = subTick;
          agent.y = Math.max(PERCH_Y + 30, PERCH_Y + 30 + subTick * 3);
          if (subTick > 28 || agent.y >= GROUND - 10) {
            agent.y = GROUND;
            bugProj.active = false; bugProj.done = false; bugProj.x = BUG_X + 30;
            setPhase("to-bug");
          }
        }

      } else if (phase === "to-bug") {
        // agent runs LEFT to pick up bug from reporter
        agent.dir = -1; agent.frame++; agent.excited = 0;
        agent.carrying = false;
        agent.x -= SPEED;
        agent.y = GROUND - Math.abs(Math.sin(agent.frame * 0.25)) * 5;
        if (agent.x <= BUG_X + 55) {
          agent.carrying = true; agent.hasScreenshot = false;
          setPhase("to-dev");
        }

      } else if (phase === "to-dev") {
        // agent runs RIGHT toward codebase carrying bug
        agent.dir = 1; agent.frame++; agent.carrying = true; agent.hasScreenshot = false; agent.excited = 0;
        agent.x += SPEED;
        agent.y = GROUND - Math.abs(Math.sin(agent.frame * 0.25)) * 5;
        if (agent.x >= DEV_X - 110) {
          agent.x = DEV_X - 110; agent.carrying = false;
          setPhase("fixing");
        }

      } else if (phase === "fixing") {
        // agent stands left of monitor, claude fixes
        agent.x = DEV_X - 110; agent.y = GROUND; agent.frame = 0; agent.carrying = false; agent.excited = 0;
        codeFlick++;
        if (codeFlick > 150) { setPhase("handoff"); handoffProgress = 0; }

      } else if (phase === "handoff") {
        // claude extends arm, agent reaches back
        agent.x = DEV_X - 110; agent.y = GROUND; agent.frame = 0; agent.excited = 0;
        agent.dir = 1;
        handoffProgress = Math.min(1, subTick / 55);
        if (handoffProgress >= 1) {
          agent.carrying = true; agent.hasScreenshot = true;
          codeFlick = 0;
          setPhase("to-client");
        }

      } else if (phase === "to-client") {
        // agent runs LEFT all the way to reporter side to deliver fix
        agent.dir = -1; agent.frame++; agent.carrying = true; agent.hasScreenshot = true; agent.excited = 0;
        agent.x -= SPEED;
        agent.y = GROUND - Math.abs(Math.sin(agent.frame * 0.25)) * 5;
        if (agent.x <= BUG_X + 60) {
          agent.x = BUG_X + 60;
          agent.carrying = false; agent.hasScreenshot = false;
          setPhase("deliver");
        }

      } else if (phase === "deliver") {
        // agent at client side — celebrate, show toast
        agent.x = BUG_X + 60; agent.dir = 1;
        agent.carrying = false; agent.hasScreenshot = false;
        agent.excited = subTick;
        agent.y = GROUND - Math.abs(Math.sin(subTick * 0.16)) * 22;
        toastAlpha = Math.min(1, subTick / 15);
        if (subTick > 220) toastAlpha = Math.max(0, 1 - (subTick - 220) / 45);
        if (subTick > 270) {
          toastAlpha = 0; agent.excited = 0; agent.y = GROUND;
          setPhase("to-center");
        }

      } else if (phase === "to-center") {
        // agent walks RIGHT back to center perch
        agent.dir = 1; agent.frame++; agent.carrying = false; agent.excited = 0;
        agent.x += SPEED;
        // arc upward as it nears center
        const prog = Math.max(0, (agent.x - BUG_X) / (CENTER_X - BUG_X));
        agent.y = GROUND - prog * (GROUND - PERCH_Y - 30) - Math.abs(Math.sin(agent.frame * 0.25)) * 4;
        if (agent.x >= CENTER_X) {
          agent.x = CENTER_X; agent.y = PERCH_Y + 30;
          bugProj.x = BUG_X + 30; codeFlick = 0; handoffProgress = 0;
          setPhase("idle");
          setTimeout(() => { activeReporter = Math.floor(Math.random() * 3); setPhase("bug-arrive"); }, 2200);
        }
      }

      // draw Claude (always present, dims when inactive)
      drawClaude();

      // draw agent
      drawAgent();

      // PM toast
      drawToast();

      // status bar — fade in slowly, stay visible so user can read the full line
      labelTick++;
      labelAlpha = Math.min(1, labelTick / 35);
      ctx.fillStyle = "rgba(4,6,12,0.9)";
      ctx.fillRect(0, H - 48, W, 48);
      // divider line
      ctx.strokeStyle = "rgba(99,102,241,0.25)"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, H - 48); ctx.lineTo(W, H - 48); ctx.stroke();
      ctx.globalAlpha = labelAlpha;
      ctx.fillStyle = "#cbd5e1";
      ctx.font = "bold 14px monospace"; ctx.textAlign = "center";
      ctx.fillText(labelText, W / 2, H - 16);
      ctx.globalAlpha = 1;

      animId = requestAnimationFrame(loop);
    };
    loop();

    return () => cancelAnimationFrame(animId);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="w-full rounded-2xl border border-indigo-500/20"
      style={{ maxWidth: 1100, height: 440, boxShadow: "0 0 60px rgba(99,102,241,0.15)", display: "block" }}
    />
  );
}

// ── Background particles ──────────────────────────────────────────────────
function AgentBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext("2d")!; let animId: number; let t = 0;
    const resize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; };
    resize(); window.addEventListener("resize", resize);
    const pts = Array.from({ length: 70 }, () => ({
      x: Math.random() * window.innerWidth, y: Math.random() * window.innerHeight,
      vx: (Math.random() - 0.5) * 0.25, vy: (Math.random() - 0.5) * 0.25,
      r: Math.random() * 1.4 + 0.4, pulse: Math.random() * Math.PI * 2,
    }));
    const orbs = [
      { x: 0.15, y: 0.25, r: 300, c: "99,102,241", s: 0.0003 },
      { x: 0.85, y: 0.55, r: 240, c: "139,92,246", s: 0.0004 },
    ];
    const draw = () => {
      t++; ctx.clearRect(0, 0, canvas.width, canvas.height);
      orbs.forEach((o) => {
        const ox = (o.x + Math.sin(t * o.s) * 0.07) * canvas.width;
        const oy = (o.y + Math.cos(t * o.s) * 0.05) * canvas.height;
        const g = ctx.createRadialGradient(ox, oy, 0, ox, oy, o.r);
        g.addColorStop(0, `rgba(${o.c},0.07)`); g.addColorStop(1, `rgba(${o.c},0)`);
        ctx.beginPath(); ctx.arc(ox, oy, o.r, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill();
      });
      for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
        const dx = pts[i].x - pts[j].x, dy = pts[i].y - pts[j].y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < 130) { ctx.beginPath(); ctx.strokeStyle = `rgba(99,102,241,${(1 - d / 130) * 0.18})`; ctx.lineWidth = 0.5; ctx.moveTo(pts[i].x, pts[i].y); ctx.lineTo(pts[j].x, pts[j].y); ctx.stroke(); }
      }
      pts.forEach((pt) => {
        pt.pulse += 0.018;
        const a = Math.max(0.05, Math.min(0.99, 0.35 + Math.sin(pt.pulse) * 0.25));
        const glowR = Math.max(1, pt.r * 3);
        if (!isFinite(pt.x) || !isFinite(pt.y)) return;
        const g = ctx.createRadialGradient(pt.x, pt.y, 0, pt.x, pt.y, glowR);
        g.addColorStop(0, `rgba(129,140,248,${a.toFixed(3)})`);
        g.addColorStop(1, "rgba(129,140,248,0)");
        ctx.beginPath(); ctx.arc(pt.x, pt.y, glowR, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill();
        ctx.beginPath(); ctx.arc(pt.x, pt.y, Math.max(0.5, pt.r), 0, Math.PI * 2);
        ctx.fillStyle = `rgba(165,180,252,${a.toFixed(3)})`; ctx.fill();
        pt.x += pt.vx; pt.y += pt.vy;
        if (pt.x < 0 || pt.x > canvas.width) pt.vx *= -1;
        if (pt.y < 0 || pt.y > canvas.height) pt.vy *= -1;
      });
      animId = requestAnimationFrame(draw);
    };
    draw();
    return () => { cancelAnimationFrame(animId); window.removeEventListener("resize", resize); };
  }, []);
  return <canvas ref={canvasRef} className="fixed inset-0 w-full h-full pointer-events-none" style={{ zIndex: 0 }} />;
}

// ── 3D tilt card ──────────────────────────────────────────────────────────
function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const onMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = ref.current; if (!el) return;
    const r = el.getBoundingClientRect();
    const rx = ((e.clientY - r.top) / r.height - 0.5) * -14;
    const ry = ((e.clientX - r.left) / r.width - 0.5) * 14;
    el.style.transform = `perspective(700px) rotateX(${rx}deg) rotateY(${ry}deg) scale(1.03)`;
  };
  const onLeave = () => { if (ref.current) ref.current.style.transform = ""; };
  return (
    <div ref={ref} onMouseMove={onMove} onMouseLeave={onLeave}
      className={`bg-slate-800/60 border border-slate-700/50 rounded-2xl backdrop-blur-sm ${className}`}
      style={{ transition: "transform 0.15s ease", willChange: "transform" }}>
      {children}
    </div>
  );
}

// ── Setup guide download helper ───────────────────────────────────────────
function downloadSetup() {
  const token = localStorage.getItem("auth_token");
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  fetch("/api/setup/download", { headers })
    .then(r => r.blob())
    .then(blob => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = "agentinbox-setup.md";
      document.body.appendChild(a); a.click();
      document.body.removeChild(a); URL.revokeObjectURL(url);
    });
}

// ── Main ──────────────────────────────────────────────────────────────────
export function HomePage() {
  return (
    <div className="relative min-h-screen bg-[#06080f] text-white overflow-x-hidden">
      <AgentBackground />
      <div className="relative z-10 flex flex-col items-center px-6">

        {/* Nav */}
        <nav className="w-full max-w-6xl flex items-center justify-between py-6">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-indigo-500 flex items-center justify-center text-sm">📥</div>
            <span className="text-white font-extrabold text-xl tracking-tight">AgentInbox</span>
          </div>
          <div className="flex items-center gap-3">
            <a href="/login" className="text-slate-400 hover:text-white text-sm transition-colors">Sign in</a>
            <a href="/signup" className="bg-indigo-500 hover:bg-indigo-400 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
              style={{ boxShadow: "0 0 20px rgba(99,102,241,0.4)" }}>
              Get started free →
            </a>
          </div>
        </nav>

        {/* Badges */}
        <div className="mt-10 mb-6 flex flex-col sm:flex-row items-center gap-3">
          <div className="flex items-center gap-2 bg-indigo-500/15 border border-indigo-500/30 rounded-full px-5 py-2 text-indigo-300 text-sm font-semibold"
            style={{ boxShadow: "0 0 24px rgba(99,102,241,0.2)" }}>
            ⚡ Uses Claude Pro — zero extra API cost
          </div>
          <div className="flex items-center gap-2 bg-violet-500/15 border border-violet-500/30 rounded-full px-5 py-2 text-violet-300 text-sm font-semibold">
            📱 Telegram bot — submit, approve & get ✅ from your phone
          </div>
          <div className="flex items-center gap-2 bg-emerald-500/15 border border-emerald-500/30 rounded-full px-5 py-2 text-emerald-300 text-sm font-semibold">
            🖥️ Runs on your machine — your codebase, your tools
          </div>
        </div>

        {/* ── Hero animation scene — right below badges ── */}
        <div className="w-full max-w-5xl mb-10 flex justify-center">
          <HeroScene />
        </div>

        {/* Hero text */}
        <div className="text-center max-w-4xl mb-8">
          <h1 className="text-6xl sm:text-7xl font-extrabold tracking-tight mb-5 leading-[1.05]">
            Your Claude.<br />
            <span className="text-transparent bg-clip-text"
              style={{ backgroundImage: "linear-gradient(135deg, #818cf8 0%, #6366f1 40%, #a78bfa 100%)" }}>
              Working while you sleep.
            </span>
          </h1>
          <p className="text-slate-300 text-xl leading-relaxed mb-3 max-w-2xl mx-auto">
            Submit tasks from a form, Telegram, or CI pipeline.<br />
            Your Claude fixes them on your machine — your codebase, your rules, your tools.
          </p>
          <p className="text-slate-300 text-sm mb-8">No extra API cost. No VS Code open. No handoffs.</p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <a href="/signup"
              className="inline-flex items-center gap-2 bg-indigo-500 hover:bg-indigo-400 text-white font-bold px-8 py-4 rounded-xl text-base transition-all"
              style={{ boxShadow: "0 0 40px rgba(99,102,241,0.45)" }}>
              Start free — one paste setup →
            </a>
          </div>
        </div>

        {/* ── Use cases — right after animation ── */}
        <div className="w-full max-w-6xl mb-20">
          <div className="text-center mb-10">
            <p className="text-indigo-400 text-xs font-bold uppercase tracking-widest mb-3">Use cases</p>
            <h2 className="text-3xl font-extrabold mb-3">Not just a bug pipeline.</h2>
            <p className="text-slate-300 text-sm max-w-xl mx-auto">AgentInbox is a task pipe between anyone and your Claude. What Claude does with the task is up to you.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {[
              {
                icon: "🐛", accent: "border-red-500/20 bg-red-500/5",
                tag: "Bug fixing", tagColor: "text-red-400 bg-red-500/10",
                title: "Client submits a bug",
                desc: "QA or client opens your submission form, describes the issue. Claude traces the root cause across files, fixes it, takes a screenshot as proof. Telegram ✅ when done.",
                flow: ["Form submit", "Claude fixes", "Screenshot proof", "Telegram ✅"],
                flowColor: "bg-red-500/20 text-red-300",
              },
              {
                icon: "✨", accent: "border-indigo-500/20 bg-indigo-500/5",
                tag: "Feature building", tagColor: "text-indigo-400 bg-indigo-500/10",
                title: "PM requests a feature",
                desc: "PM submits a feature request with a spec file attached. Claude reads the spec, proposes a plan, waits for your approval, then implements it. No dev interruption.",
                flow: ["Spec attached", "Plan proposed", "PM approves", "Feature built"],
                flowColor: "bg-indigo-500/20 text-indigo-300",
              },
              {
                icon: "📱", accent: "border-violet-500/20 bg-violet-500/5",
                tag: "Phone control", tagColor: "text-violet-400 bg-violet-500/10",
                title: "Manage Claude from Telegram",
                desc: "Message your bot from bed. Get notified when tasks arrive. Approve Claude's plan with one reply. Receive ✅ when done. No laptop. No VS Code.",
                flow: ["Message bot", "Claude wakes", "Reply approve", "✅ on Telegram"],
                flowColor: "bg-violet-500/20 text-violet-300",
              },
              {
                icon: "🤖", accent: "border-cyan-500/20 bg-cyan-500/5",
                tag: "CI / automation", tagColor: "text-cyan-400 bg-cyan-500/10",
                title: "CI pipeline fails → Claude fixes",
                desc: "Your CI POSTs a task when a build breaks. Claude gets the error, finds the broken code, fixes it, and pushes. You wake up to a green build.",
                flow: ["Build fails", "CI posts task", "Claude fixes", "Green build"],
                flowColor: "bg-cyan-500/20 text-cyan-300",
              },
              {
                icon: "🖥️", accent: "border-emerald-500/20 bg-emerald-500/5",
                tag: "Remote dev machine", tagColor: "text-emerald-400 bg-emerald-500/10",
                title: "24/7 on a cloud VM",
                desc: "Run the worker on a $6/mo Linux VM. Tasks get fixed around the clock — even when your PC is off. Your codebase cloned there, Claude running headlessly.",
                flow: ["VM always on", "Worker running", "Claude wakes", "Fixes at 3am"],
                flowColor: "bg-emerald-500/20 text-emerald-300",
              },
              {
                icon: "💬", accent: "border-amber-500/20 bg-amber-500/5",
                tag: "Chat support / analysis", tagColor: "text-amber-400 bg-amber-500/10",
                title: "Answer questions, not just fix code",
                desc: "Customer asks a question → task created → Claude reads your docs and replies. Or: 'why did sales drop?' → Claude queries your DB and posts a summary.",
                flow: ["Question arrives", "Claude reads docs", "Drafts reply", "PM reviews"],
                flowColor: "bg-amber-500/20 text-amber-300",
              },
            ].map((uc) => (
              <Card key={uc.title} className={`p-6 cursor-default border ${uc.accent}`}>
                <div className="flex items-center justify-between mb-4">
                  <span className="text-2xl">{uc.icon}</span>
                  <span className={`text-xs font-bold px-2 py-1 rounded-full ${uc.tagColor}`}>{uc.tag}</span>
                </div>
                <h3 className="text-white font-bold text-base mb-2">{uc.title}</h3>
                <p className="text-slate-400 text-sm leading-relaxed mb-4">{uc.desc}</p>
                <div className="flex flex-wrap gap-1.5">
                  {uc.flow.map((step, i) => (
                    <span key={step} className="flex items-center gap-1">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${uc.flowColor}`}>{step}</span>
                      {i < uc.flow.length - 1 && <span className="text-slate-600 text-xs">→</span>}
                    </span>
                  ))}
                </div>
              </Card>
            ))}
          </div>
        </div>

        {/* Problem vs Solution */}
        <div className="w-full max-w-5xl mb-16 grid grid-cols-1 sm:grid-cols-2 gap-8 items-center">
          <div className="rounded-2xl p-8 border border-red-500/20 bg-red-500/5 backdrop-blur-sm flex flex-col items-center">
            <p className="text-red-300 text-sm font-bold uppercase tracking-widest mb-6">😩 The endless loop</p>
            <div className="relative w-64 h-64">
              <svg className="absolute inset-0 w-full h-full" viewBox="0 0 256 256">
                <circle cx="128" cy="128" r="110" fill="none" stroke="rgba(239,68,68,0.45)" strokeWidth="2" strokeDasharray="8 6"
                  style={{ animation: "spin 18s linear infinite", transformOrigin: "128px 128px" }} />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <p className="text-red-400 text-3xl mb-1">🔄</p>
                <p className="text-red-400 text-sm font-bold text-center leading-tight">Never<br />resolves</p>
              </div>
              {[
                { label: "Issue found",     angle: -90 },
                { label: "Report filed",    angle: -18 },
                { label: "Dev interrupted", angle:  54 },
                { label: "Context lost",    angle: 126 },
                { label: "Fix delayed",     angle: 198 },
              ].map(({ label, angle }) => {
                const rad = (angle * Math.PI) / 180;
                const x = 50 + (108 / 2.56) * Math.cos(rad);
                const y = 50 + (108 / 2.56) * Math.sin(rad);
                return (
                  <div key={label} className="absolute -translate-x-1/2 -translate-y-1/2"
                    style={{ left: `${x}%`, top: `${y}%` }}>
                    <div className="bg-red-950/80 border border-red-500/60 rounded-lg px-3 py-1.5 text-red-200 text-xs font-bold whitespace-nowrap shadow-lg"
                      style={{ boxShadow: "0 0 12px rgba(239,68,68,0.2)" }}>
                      {label}
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="text-red-400/80 text-sm font-medium mt-6 text-center">Multiple handoffs. Days of delay.<br />Everyone waiting on everyone.</p>
            <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
          </div>

          <div className="rounded-2xl p-8 border border-indigo-500/30 bg-indigo-500/5 backdrop-blur-sm flex flex-col items-center"
            style={{ boxShadow: "0 0 40px rgba(99,102,241,0.08)" }}>
            <p className="text-indigo-400 text-xs font-bold uppercase tracking-widest mb-6">✅ With AgentInbox</p>
            <div className="flex flex-col gap-0 w-full max-w-xs">
              {[
                { icon: "📤", label: "Anyone submits",            sub: "form, Telegram, CI — your choice" },
                { icon: "⚡", label: "Claude wakes instantly",    sub: "WebSocket push, no polling" },
                { icon: "🔧", label: "Task done on your machine", sub: "your codebase, local DB, internal APIs" },
                { icon: "📸", label: "Screenshot proof",          sub: "posted back instantly" },
                { icon: "📱", label: "Telegram ✅ sent to you",   sub: "approve mid-task from your phone" },
              ].map((s, i, arr) => (
                <div key={s.label} className="flex flex-col items-center">
                  <div className="flex items-center gap-3 w-full bg-slate-800/50 rounded-xl px-4 py-3 border border-slate-700/40">
                    <span className="text-xl">{s.icon}</span>
                    <div>
                      <p className="text-white text-sm font-semibold">{s.label}</p>
                      <p className="text-slate-500 text-xs">{s.sub}</p>
                    </div>
                  </div>
                  {i < arr.length - 1 && <div className="w-px h-4 bg-indigo-500/30" />}
                </div>
              ))}
            </div>
            <p className="text-indigo-400/70 text-xs mt-6 text-center">Zero handoffs. Minutes not days.<br />Full automation, full visibility.</p>
          </div>
        </div>

        {/* Who it's for — 3 persona cards */}
        <div className="w-full max-w-5xl mb-16 text-center">
          <p className="text-indigo-400 text-xs font-bold uppercase tracking-widest mb-3">Who it's for</p>
          <h2 className="text-3xl font-extrabold mb-3">Built for developers who ship alone.</h2>
          <p className="text-slate-300 text-sm mb-10">No QA team. No DevOps. Just you, your Claude, and a pipe that handles everything else.</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {[
              {
                icon: "🧑‍💻",
                title: "Freelancer",
                quote: "Clients email bugs at midnight. Claude fixes by morning.",
                points: ["Client submits via form link", "Claude fixes while you sleep", "Client gets screenshot proof", "You wake up to Telegram ✅"],
                accent: "border-indigo-500/30",
                glow: "rgba(99,102,241,0.08)",
              },
              {
                icon: "🏢",
                title: "Agency",
                quote: "5 client projects. One dashboard. Zero interruptions.",
                points: ["Each client has own submission link", "Custom fields per project", "PM dashboard across all projects", "Approval gate for production safety"],
                accent: "border-violet-500/30",
                glow: "rgba(139,92,246,0.08)",
              },
              {
                icon: "🚀",
                title: "Solo SaaS founder",
                quote: "No QA team. Ship fast. Nothing hits prod without your OK.",
                points: ["Users report bugs via in-app link", "CI posts failed builds as tasks", "Approval gate — you approve from phone", "Screenshot proof before closing ticket"],
                accent: "border-emerald-500/30",
                glow: "rgba(52,211,153,0.08)",
              },
            ].map((p) => (
              <Card key={p.title} className={`p-6 text-left border ${p.accent}`} style={{ boxShadow: `0 0 40px ${p.glow}` }}>
                <div className="text-3xl mb-3">{p.icon}</div>
                <h3 className="text-white font-bold text-lg mb-1">{p.title}</h3>
                <p className="text-slate-200 text-sm italic mb-4">"{p.quote}"</p>
                <ul className="space-y-2">
                  {p.points.map((pt) => (
                    <li key={pt} className="flex items-start gap-2 text-white text-sm">
                      <span className="text-indigo-400 mt-0.5">→</span>
                      {pt}
                    </li>
                  ))}
                </ul>
              </Card>
            ))}
          </div>
        </div>

        {/* ── PM Workflow section ── */}
        <div className="w-full max-w-5xl mb-16">
          <h2 className="text-center text-3xl font-bold mb-2">Built for PMs and managers too</h2>
          <p className="text-center text-slate-300 text-sm mb-10">Not just a developer tool — the PM controls everything from one dashboard.</p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {/* Left — PM steps */}
            <div className="space-y-4">
              {[
                { step: "1", icon: "🏗️", title: "Create a project", desc: "Name it, set custom fields (Environment, Module, Priority, Case ID), toggle approval gate for production safety." },
                { step: "2", icon: "🔗", title: "Share a submission link", desc: "One link for clients or QA. No account needed — they just open it in a browser and describe the bug." },
                { step: "3", icon: "📋", title: "Monitor the live dashboard", desc: "See every task in real time — pending, in progress, done, escalated. Click any task to see Claude's full audit trail." },
                { step: "4", icon: "🔔", title: "Get notified instantly", desc: "Toast alert with sound the moment Claude completes a fix. Tab badge shows unread count. No refreshing needed." },
                { step: "5", icon: "✅", title: "Approve before code runs", desc: "Enable require-approval per project. Claude proposes a plan, PM approves or rejects before any code is touched." },
                { step: "6", icon: "📤", title: "Client sees proof", desc: "Share a status link with the client. They see the fix, Claude's screenshot, and a plain-English summary — no account needed." },
              ].map(({ step, icon, title, desc }) => (
                <div key={step} className="flex gap-4 bg-slate-800/40 border border-slate-700/40 rounded-xl p-4 backdrop-blur-sm">
                  <div className="shrink-0 w-9 h-9 rounded-full bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 font-bold text-sm">{step}</div>
                  <div>
                    <p className="text-white font-semibold text-sm mb-1">{icon} {title}</p>
                    <p className="text-slate-400 text-xs leading-relaxed">{desc}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Right — PM dashboard mockup */}
            <div className="bg-slate-800/50 border border-slate-700/40 rounded-2xl p-6 backdrop-blur-sm flex flex-col gap-4"
              style={{ boxShadow: "0 0 40px rgba(99,102,241,0.06)" }}>
              <div className="flex items-center justify-between mb-2">
                <p className="text-white font-bold text-sm">PM Dashboard</p>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="text-emerald-400 text-xs font-medium">Live</span>
                </div>
              </div>
              {/* Stats row */}
              <div className="grid grid-cols-4 gap-2">
                {[{ n: "12", l: "Total" }, { n: "9", l: "Done" }, { n: "2", l: "Active" }, { n: "1", l: "Escalated" }].map(({ n, l }) => (
                  <div key={l} className="bg-slate-900/60 rounded-lg p-2 text-center">
                    <p className="text-white font-bold text-lg">{n}</p>
                    <p className="text-slate-500 text-xs">{l}</p>
                  </div>
                ))}
              </div>
              {/* Task list */}
              {[
                { title: "Login button broken on mobile", status: "done", time: "2 min ago" },
                { title: "Wrong label on account type field", status: "done", time: "18 min ago" },
                { title: "PDF upload fails on Safari", status: "in_progress", time: "just now" },
                { title: "Add export to CSV feature", status: "pending", time: "5 min ago" },
              ].map(({ title, status, time }) => (
                <div key={title} className="flex items-center gap-3 bg-slate-900/40 rounded-xl px-3 py-2.5 border border-slate-700/30">
                  <div className={`w-2 h-2 rounded-full shrink-0 ${status === "done" ? "bg-emerald-400" : status === "in_progress" ? "bg-amber-400 animate-pulse" : "bg-slate-500"}`} />
                  <p className="text-slate-300 text-xs flex-1 truncate">{title}</p>
                  <p className="text-slate-600 text-xs shrink-0">{time}</p>
                </div>
              ))}
              {/* Toast */}
              <div className="bg-emerald-900/40 border border-emerald-500/30 rounded-xl px-4 py-3 flex items-center gap-3">
                <span className="text-lg">✅</span>
                <div>
                  <p className="text-emerald-300 text-xs font-semibold">Fix complete — Login button fixed</p>
                  <p className="text-emerald-500/70 text-xs">Claude took a screenshot as proof</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Telegram section ── */}
        <div className="w-full max-w-5xl mb-20">
          <div className="rounded-2xl border border-violet-500/20 overflow-hidden"
            style={{ background: "linear-gradient(135deg,rgba(139,92,246,0.07),rgba(99,102,241,0.04))", boxShadow: "0 0 60px rgba(139,92,246,0.08)" }}>
            <div className="p-8 sm:p-12 grid grid-cols-1 sm:grid-cols-2 gap-10 items-center">
              {/* Left — copy */}
              <div>
                <div className="inline-flex items-center gap-2 bg-violet-500/20 rounded-full px-3 py-1 text-violet-400 text-xs font-bold uppercase tracking-wider mb-4">📱 Telegram bot</div>
                <h2 className="text-3xl font-extrabold mb-3">Full control<br />from your phone.</h2>
                <p className="text-slate-400 text-sm leading-relaxed mb-6">
                  Connect your Telegram bot once in Settings. From then on — submit tasks by messaging the bot, get notified the moment Claude picks it up, approve or reject Claude's plan with a single reply, and receive ✅ when it's done.
                  <br /><br />
                  <span className="text-slate-300">No laptop. No VS Code. No terminal.</span>
                </p>
                <div className="space-y-2">
                  {[
                    "📤  Message bot → task created instantly",
                    "⏳  Claude proposes plan → reply 'approve'",
                    "✅  Fix done → proof posted to dashboard",
                    "❓  Claude asks a question → reply to answer",
                  ].map((item) => (
                    <div key={item} className="flex items-center gap-2 text-slate-300 text-sm">
                      <span>{item}</span>
                    </div>
                  ))}
                </div>
              </div>
              {/* Right — Telegram chat mockup */}
              <div className="flex flex-col gap-0">
                {/* Phone frame */}
                <div className="bg-[#0d1117] border border-slate-700/60 rounded-2xl overflow-hidden" style={{ boxShadow: "0 0 40px rgba(139,92,246,0.12)" }}>
                  {/* Header */}
                  <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-700/60 bg-slate-800/60">
                    <div className="w-8 h-8 rounded-full bg-violet-500/30 border border-violet-500/40 flex items-center justify-center text-sm">📥</div>
                    <div>
                      <p className="text-white text-sm font-semibold">AgentInbox Bot</p>
                      <p className="text-emerald-400 text-xs">● online</p>
                    </div>
                  </div>
                  {/* Messages */}
                  <div className="p-4 space-y-3 text-sm">
                    {/* Bot message — new feature */}
                    <div className="flex gap-2">
                      <div className="w-6 h-6 rounded-full bg-violet-500/30 flex items-center justify-center text-xs shrink-0 mt-1">📥</div>
                      <div className="bg-slate-800/80 border border-slate-700/40 rounded-2xl rounded-tl-sm px-3 py-2 max-w-[85%]">
                        <p className="text-slate-200">✨ <span className="font-semibold">New feature:</span> Add export to CSV button</p>
                        <p className="text-slate-500 text-xs mt-1">Project: MBL Account Opening</p>
                        <p className="text-violet-400 text-xs mt-0.5">Claude is on it.</p>
                      </div>
                    </div>
                    {/* Bot — approval needed */}
                    <div className="flex gap-2">
                      <div className="w-6 h-6 rounded-full bg-violet-500/30 flex items-center justify-center text-xs shrink-0 mt-1">📥</div>
                      <div className="bg-slate-800/80 border border-amber-500/20 rounded-2xl rounded-tl-sm px-3 py-2 max-w-[85%]">
                        <p className="text-amber-300 font-semibold text-xs mb-1">⏳ Approval needed</p>
                        <p className="text-slate-300 text-xs">Plan: Add export button to ReportTable.tsx, wire to existing CSV util.</p>
                        <p className="text-slate-500 text-xs mt-1.5">👆 Reply: <span className="text-emerald-400">approve</span> or <span className="text-red-400">reject: reason</span></p>
                      </div>
                    </div>
                    {/* User reply */}
                    <div className="flex justify-end">
                      <div className="bg-indigo-600/80 border border-indigo-500/30 rounded-2xl rounded-tr-sm px-3 py-2 max-w-[60%]">
                        <p className="text-white text-xs">approve</p>
                      </div>
                    </div>
                    {/* Bot — done */}
                    <div className="flex gap-2">
                      <div className="w-6 h-6 rounded-full bg-violet-500/30 flex items-center justify-center text-xs shrink-0 mt-1">📥</div>
                      <div className="bg-slate-800/80 border border-emerald-500/20 rounded-2xl rounded-tl-sm px-3 py-2 max-w-[85%]">
                        <p className="text-emerald-300 font-semibold text-xs mb-1">✅ Fixed: Add export to CSV button</p>
                        <p className="text-slate-400 text-xs">Added ExportButton component in ReportTable.tsx line 84. Uses existing csvUtil.export().</p>
                        <p className="text-slate-500 text-xs mt-1">Proof posted to dashboard →</p>
                      </div>
                    </div>
                    <p className="text-slate-600 text-xs text-center pt-1">One bot. Full control. No laptop needed.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 8-line setup */}
        <div className="w-full max-w-4xl mb-16">
          <div className="rounded-2xl border border-indigo-500/25 overflow-hidden"
            style={{ background: "linear-gradient(135deg,rgba(99,102,241,0.08),rgba(139,92,246,0.05))", boxShadow: "0 0 60px rgba(99,102,241,0.1)" }}>
            <div className="p-8 sm:p-10 grid grid-cols-1 sm:grid-cols-2 gap-8 items-center">
              <div>
                <div className="inline-flex items-center gap-2 bg-indigo-500/20 rounded-full px-3 py-1 text-indigo-400 text-xs font-bold uppercase tracking-wider mb-4">⚡ One paste setup</div>
                <h2 className="text-3xl font-extrabold mb-3">Claude sets itself<br />up for your project.</h2>
                <p className="text-slate-300 text-sm leading-relaxed mb-4">
                  Sign up, download your setup file, paste it into Claude Code in your project root. Claude scans your codebase, writes all config files, and adds itself to your OS startup. Done forever.
                </p>
                <ul className="space-y-2 mb-6">
                  {["Worker runs silently on PC boot — no terminal", "Tasks arrive → Claude wakes → fixes → exits", "Telegram ✅ when done"].map(item => (
                    <li key={item} className="flex items-center gap-2 text-slate-300 text-sm">
                      <span className="text-emerald-400">✓</span> {item}
                    </li>
                  ))}
                </ul>
                <a href="/signup" className="inline-flex items-center gap-2 bg-indigo-500 hover:bg-indigo-400 text-white text-sm font-bold px-5 py-2.5 rounded-xl transition-colors">
                  Get started free →
                </a>
              </div>
              <div className="rounded-xl overflow-hidden border border-slate-700/60 bg-[#0d1117] font-mono">
                <div className="flex items-center gap-1.5 px-4 py-3 border-b border-slate-700/60 bg-slate-800/60">
                  <div className="w-3 h-3 rounded-full bg-red-500/70" />
                  <div className="w-3 h-3 rounded-full bg-yellow-500/70" />
                  <div className="w-3 h-3 rounded-full bg-green-500/70" />
                  <span className="text-slate-400 text-xs ml-2">Claude Code — your project root</span>
                </div>
                <pre className="p-5 text-xs leading-relaxed overflow-x-auto"><code>{`> paste agentinbox-setup.md into Claude

`}<span className="text-slate-500">{`✔ Scanned 312 files
✔ Wrote agentinbox-worker.js
✔ Wrote .mcp.json
✔ Wrote CLAUDE.local.md
✔ Added to Windows Startup`}</span>{`

`}<span className="text-emerald-400">{`Worker started. Listening for tasks.`}</span></code></pre>
                <div className="px-5 py-3 border-t border-slate-700/60 bg-slate-800/40 text-xs text-emerald-400">
                  ✓ Never touch this again — runs on every boot
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Features */}
        <div className="w-full max-w-6xl mb-20">
          <h2 className="text-center text-3xl font-bold mb-2">Everything included</h2>
          <p className="text-center text-slate-300 text-sm mb-10">One pipe. Full loop. No extra billing.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {[
              { icon: "📥", title: "Submission form",       desc: "Shareable link — no account needed. Attach screenshots, PDFs, Word docs. Custom fields for Environment, Module, Priority.", accent: "bg-indigo-500/10" },
              { icon: "⚡", title: "Instant wake-on-task",   desc: "Task arrives → WebSocket push → Claude wakes in seconds. Zero polling, zero idle tokens, no terminal to babysit.", accent: "bg-violet-500/10" },
              { icon: "📱", title: "Telegram control",        desc: "Submit tasks, approve plans, and get ✅ from your phone. One bot per workspace — full control without touching a laptop.", accent: "bg-sky-500/10" },
              { icon: "🤖", title: "Claude Pro as free API", desc: "No Anthropic API key needed. Tasks run through your $20/mo Claude Pro — zero extra AI cost, no usage meter ticking.", accent: "bg-blue-500/10" },
              { icon: "📸", title: "Screenshot proof",       desc: "Claude takes a Playwright screenshot on every fix. PM sees it. Client sees it. No trust gap.", accent: "bg-emerald-500/10" },
              { icon: "✅", title: "Approval gate",          desc: "Claude proposes a plan — PM approves before any code runs. Per-project toggle. Approve from dashboard or Telegram reply.", accent: "bg-amber-500/10" },
              { icon: "🔔", title: "Live notifications",     desc: "Toast alerts with sound the moment Claude completes, escalates, or needs approval. Tab badge. No refreshing.", accent: "bg-pink-500/10" },
              { icon: "📋", title: "Audit log",              desc: "Every status change recorded with actor + timestamp. Escalation history. Rejection reasons. Compliance-ready.", accent: "bg-cyan-500/10" },
              { icon: "🎨", title: "White-label",            desc: "Custom brand name and color per project. Clients see your brand on the submission form, not AgentInbox.", accent: "bg-orange-500/10" },
              { icon: "🔒", title: "Escalation",             desc: "Claude can't solve it? One tool call escalates to human. PM gets red alert. Task stays tracked.", accent: "bg-rose-500/10" },
            ].map((f) => (
              <Card key={f.title} className="p-6 cursor-default">
                <div className={`text-2xl mb-4 w-11 h-11 rounded-xl flex items-center justify-center ${f.accent}`}>{f.icon}</div>
                <h3 className="text-white font-bold text-base mb-2">{f.title}</h3>
                <p className="text-slate-300 text-sm leading-relaxed">{f.desc}</p>
              </Card>
            ))}
          </div>
        </div>

        {/* Pricing */}
        <div className="w-full max-w-4xl mb-24">
          <h2 className="text-center text-3xl font-bold mb-2">Simple pricing</h2>
          <p className="text-center text-slate-300 text-sm mb-10">Priced by projects — not by AI usage or seats.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {[
              { name: "Free",    price: "$0",     projects: "1 project",    tasks: "50 tasks/mo",      highlight: false },
              { name: "Starter", price: "$19/mo", projects: "2 projects",   tasks: "Unlimited tasks",  highlight: false },
              { name: "Growth",  price: "$49/mo", projects: "10 projects",  tasks: "Unlimited tasks",  highlight: true  },
              { name: "Pro",     price: "$99/mo", projects: "Unlimited",    tasks: "Unlimited tasks",  highlight: false },
            ].map((p) => (
              <div key={p.name}
                className={`rounded-2xl p-6 border flex flex-col gap-4 ${p.highlight ? "border-indigo-500/50 bg-indigo-500/8" : "border-slate-700/50 bg-slate-800/40"}`}
                style={p.highlight ? { boxShadow: "0 0 30px rgba(99,102,241,0.12)" } : {}}>
                <div>
                  {p.highlight && <div className="text-xs text-indigo-400 font-bold uppercase tracking-wider mb-2">Most popular</div>}
                  <p className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-1">{p.name}</p>
                  <p className="text-3xl font-extrabold">{p.price}</p>
                </div>
                <div className="space-y-1.5 flex-1 text-sm text-slate-300">
                  <p>✓ {p.projects}</p><p>✓ {p.tasks}</p>
                  <p>✓ PM dashboard</p><p>✓ MCP + WebSocket</p><p>✓ White-label</p>
                </div>
                <a href="/signup"
                  className={`text-center text-sm font-bold py-2.5 rounded-xl transition-colors ${p.highlight ? "bg-indigo-500 hover:bg-indigo-400 text-white" : "bg-slate-700 hover:bg-slate-600 text-white"}`}>
                  Get started
                </a>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom CTA */}
        <div className="text-center mb-24 max-w-2xl">
          <h2 className="text-4xl font-extrabold mb-4">Fix bugs. Ship features.<br />Sleep through it.</h2>
          <p className="text-slate-400 mb-8">Sign up free. Connect Claude. Share a link.<br />Submit. Fix. Proof. Done.</p>
          <a href="/signup"
            className="inline-flex items-center gap-2 bg-indigo-500 hover:bg-indigo-400 text-white font-bold px-10 py-4 rounded-xl text-lg transition-all"
            style={{ boxShadow: "0 0 50px rgba(99,102,241,0.45)" }}>
            Get started free →
          </a>
        </div>

        {/* Footer */}
        <footer className="w-full max-w-6xl border-t border-slate-800/60 py-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-slate-600 text-sm mb-6">
          <span>AgentInbox — MIT License</span>
          <div className="flex items-center gap-6">
            <a href="/pm" className="hover:text-slate-400 transition-colors">PM Dashboard</a>
            <a href="/signup" className="hover:text-slate-400 transition-colors">Sign up</a>
            <a href="https://useagentinbox.com/signup" className="hover:text-slate-400 transition-colors">Sign up free</a>
          </div>
        </footer>

      </div>
    </div>
  );
}
