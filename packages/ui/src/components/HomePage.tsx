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

    // Layout — phone sits BELOW the path on the right, always visible
    const BUG_X    = 110;   // reporters (left)
    const CENTER_X = 530;   // agent perch (center-top)
    const DEV_X    = 760;   // monitor
    const CLAUDE_X = DEV_X + 85;
    const PHONE_X  = CENTER_X; // phone directly below agent standby position
    const GROUND   = 280;   // walking path y
    const PHONE_Y  = GROUND + 30; // phone sits just below the path
    const PERCH_Y  = 70;
    const SPEED    = 1.2;

    // Single cycle: client submits from left AND phone shows notification simultaneously.
    // After fix: agent delivers to client (left), Telegram ✅ fires at same time.
    // taskType alternates bug/feature each loop.
    type TaskType = "bug" | "feature";
    let loopCount = 0;
    let taskType: TaskType = "bug";

    type Phase = "idle"|"arrive"|"to-bug"|"to-dev"|"fixing"|"handoff"|"to-client"|"deliver"|"to-center";
    let phase: Phase = "idle";
    let tick = 0;
    let subTick = 0;
    let codeFlick = 0;
    let handoffProgress = 0;
    let toastAlpha = 0;
    let phoneNotifAlpha = 0;
    let activeReporter = 0;

    const agent = { x: CENTER_X, y: PERCH_Y + 30, frame: 0, dir: 1, carrying: false, hasScreenshot: false, excited: 0 };
    const taskProj = { x: BUG_X + 30, y: GROUND - 40, done: false };

    let labelText = "💤  AgentInbox on standby — waiting for tasks...";
    let labelAlpha = 0;
    let labelTick = 0;

    const safe = (n: number) => isFinite(n) ? n : 0;
    const rr = (x: number, y: number, w: number, h: number, r: number) => roundRect(ctx, x, y, w, h, r);

    // ── Draw agent ───────────────────────────────────────────────────────
    const drawAgent = () => {
      const { x, y, frame, dir, carrying, hasScreenshot, excited } = agent;
      ctx.save(); ctx.translate(safe(x), safe(y));
      if (dir < 0) ctx.scale(-1, 1);
      const swing = carrying ? Math.sin(frame * 0.3) * 12 : 0;
      const bob   = carrying ? Math.abs(Math.sin(frame * 0.3)) * 6 : Math.abs(Math.sin(tick * 0.03)) * 4;
      const BY    = excited > 0 ? -Math.abs(Math.sin(excited * 0.18)) * 20 : 0;

      ctx.fillStyle = "rgba(99,102,241,0.18)";
      ctx.beginPath(); ctx.ellipse(0, 38 + BY * 0.2, 24, 8, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "#6366f1"; ctx.lineWidth = 6; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(-9, 16 + BY - bob); ctx.lineTo(-9 - swing, 36 + BY - bob); ctx.stroke();
      ctx.beginPath(); ctx.moveTo( 9, 16 + BY - bob); ctx.lineTo( 9 + swing, 36 + BY - bob); ctx.stroke();
      ctx.fillStyle = "#312e81"; ctx.strokeStyle = "#818cf8"; ctx.lineWidth = 3;
      rr(-24, -28 + BY - bob, 48, 44, 8); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#4338ca";
      ctx.beginPath(); ctx.moveTo(-24,-28+BY-bob); ctx.lineTo(0,-10+BY-bob); ctx.lineTo(24,-28+BY-bob); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#e0e7ff"; ctx.font = "bold 10px monospace"; ctx.textAlign = "center";
      ctx.fillText("AgentInbox", 0, 6 + BY - bob);
      const eyeR = excited > 0 ? 5.5 : 4.5;
      ctx.fillStyle = "#e0e7ff";
      ctx.beginPath(); ctx.arc(-8, -13+BY-bob, eyeR, 0, Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.arc( 8, -13+BY-bob, eyeR, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = "#1e1b4b";
      ctx.beginPath(); ctx.arc(-7.5, -13+BY-bob, eyeR*0.55, 0, Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.arc(  8.5, -13+BY-bob, eyeR*0.55, 0, Math.PI*2); ctx.fill();
      if (excited > 0) {
        ctx.fillStyle = "rgba(250,204,21,1)"; ctx.font = "9px serif"; ctx.textAlign = "center";
        ctx.fillText("★", -8, -10+BY-bob); ctx.fillText("★", 8, -10+BY-bob);
      }
      ctx.strokeStyle = "#6366f1"; ctx.lineWidth = 5;
      if (carrying) {
        ctx.beginPath(); ctx.moveTo(-22,-6+BY-bob); ctx.lineTo(-32,-32+BY-bob); ctx.stroke();
        ctx.beginPath(); ctx.moveTo( 22,-6+BY-bob); ctx.lineTo( 32,-32+BY-bob); ctx.stroke();
        if (hasScreenshot) {
          ctx.fillStyle = "#0f172a"; ctx.strokeStyle = "#34d399"; ctx.lineWidth = 2;
          rr(-22,-78+BY-bob,44,32,5); ctx.fill(); ctx.stroke();
          ctx.fillStyle = "rgba(52,211,153,0.45)";
          ctx.fillRect(-16,-72+BY-bob,32,4); ctx.fillRect(-16,-65+BY-bob,22,4); ctx.fillRect(-16,-58+BY-bob,28,4);
          ctx.fillStyle = "#34d399"; ctx.font = "11px serif"; ctx.textAlign = "center";
          ctx.fillText("📸", 10, -55+BY-bob);
          ctx.fillStyle = "rgba(199,210,254,0.8)"; ctx.font = "bold 6px monospace";
          ctx.fillText("fix_proof.png", 0, -44+BY-bob);
        } else {
          const emoji = taskType === "feature" ? "✨" : "🐛";
          const bColor = taskType === "feature" ? "rgba(99,102,241,0.95)" : "rgba(239,68,68,0.95)";
          const sColor = taskType === "feature" ? "rgba(165,180,252,0.7)" : "rgba(252,165,165,0.7)";
          ctx.fillStyle = bColor;
          ctx.beginPath(); ctx.arc(0,-54+BY-bob,16,0,Math.PI*2); ctx.fill();
          ctx.strokeStyle = sColor; ctx.lineWidth = 2; ctx.stroke();
          ctx.font = "16px serif"; ctx.textAlign = "center"; ctx.fillText(emoji, 0, -48+BY-bob);
        }
      } else if (excited > 0) {
        ctx.beginPath(); ctx.moveTo(-22,-6+BY-bob); ctx.lineTo(-36,-28+BY-bob); ctx.stroke();
        ctx.beginPath(); ctx.moveTo( 22,-6+BY-bob); ctx.lineTo( 36,-28+BY-bob); ctx.stroke();
        if (Math.floor(excited/4)%2===0) { ctx.font="16px serif"; ctx.fillText("🎉",-40,-40+BY-bob); ctx.fillText("✨",40,-38+BY-bob); }
      } else {
        ctx.beginPath(); ctx.moveTo(-22,-6+BY-bob); ctx.lineTo(-34,12+BY-bob); ctx.stroke();
        ctx.beginPath(); ctx.moveTo( 22,-6+BY-bob); ctx.lineTo( 34,12+BY-bob); ctx.stroke();
      }
      ctx.restore();
    };

    // ── Draw Claude ──────────────────────────────────────────────────────
    const drawClaude = () => {
      const active = phase === "fixing" || phase === "handoff";
      ctx.save(); ctx.translate(CLAUDE_X, GROUND);
      const bob = active ? Math.abs(Math.sin(codeFlick*0.06))*4 : Math.abs(Math.sin(tick*0.03))*3;
      ctx.fillStyle = "rgba(139,92,246,0.18)";
      ctx.beginPath(); ctx.ellipse(0,36,20,7,0,0,Math.PI*2); ctx.fill();
      ctx.strokeStyle = "#7c3aed"; ctx.lineWidth = 6; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(-8,14-bob); ctx.lineTo(-8,34-bob); ctx.stroke();
      ctx.beginPath(); ctx.moveTo( 8,14-bob); ctx.lineTo( 8,34-bob); ctx.stroke();
      ctx.fillStyle = active ? "#1e1b4b" : "#120e2e";
      ctx.strokeStyle = active ? "#a78bfa" : "rgba(139,92,246,0.3)"; ctx.lineWidth = 3;
      rr(-24,-34-bob,48,48,10); ctx.fill(); ctx.stroke();
      ctx.fillStyle = active ? "#c4b5fd" : "rgba(196,181,253,0.6)";
      ctx.font = "bold 24px monospace"; ctx.textAlign = "center"; ctx.fillText("C", 0, -11-bob);
      ctx.fillStyle = active ? "#e9d5ff" : "rgba(233,213,255,0.55)";
      ctx.font = "bold 10px monospace"; ctx.fillText("Claude", 0, 6-bob);
      ctx.fillStyle = "#e0e7ff";
      ctx.beginPath(); ctx.arc(-8,-20-bob,5,0,Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.arc( 8,-20-bob,5,0,Math.PI*2); ctx.fill();
      ctx.fillStyle = active ? "#818cf8" : "#1e1b4b";
      ctx.beginPath(); ctx.arc(-7,-20-bob,2.8,0,Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.arc( 9,-20-bob,2.8,0,Math.PI*2); ctx.fill();
      ctx.strokeStyle = "#7c3aed"; ctx.lineWidth = 5;
      if (phase === "handoff") {
        ctx.beginPath(); ctx.moveTo(-24,-10-bob); ctx.lineTo(-52,-22-bob); ctx.stroke();
        ctx.beginPath(); ctx.moveTo( 24,-10-bob); ctx.lineTo( 36,  8-bob); ctx.stroke();
      } else {
        ctx.beginPath(); ctx.moveTo(-24,-10-bob); ctx.lineTo(-36, 8-bob); ctx.stroke();
        ctx.beginPath(); ctx.moveTo( 24,-10-bob); ctx.lineTo( 36, 8-bob); ctx.stroke();
      }
      if (active && Math.floor(codeFlick/6)%2===0) { ctx.font="18px serif"; ctx.textAlign="center"; ctx.fillText("⚡",-40,-38-bob); }
      ctx.restore();
    };

    // ── Draw monitor ─────────────────────────────────────────────────────
    const drawMonitor = () => {
      const isActive = phase === "fixing" || phase === "handoff";
      const mx = DEV_X, my = GROUND - 195;
      const g = ctx.createRadialGradient(mx,GROUND,0,mx,GROUND,140);
      g.addColorStop(0,`rgba(139,92,246,${isActive?0.18:0.06})`); g.addColorStop(1,"rgba(139,92,246,0)");
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(mx,GROUND,140,0,Math.PI*2); ctx.fill();
      ctx.fillStyle = "#080612"; ctx.strokeStyle = isActive ? "#7c3aed" : "rgba(139,92,246,0.3)"; ctx.lineWidth = 2.5;
      rr(mx-75,my,150,115,12); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#0d0a1e"; rr(mx-67,my+8,134,99,6); ctx.fill();
      ctx.fillStyle = "#1e1b4b"; ctx.strokeStyle = "rgba(139,92,246,0.25)"; ctx.lineWidth = 1;
      ctx.fillRect(mx-10,my+115,20,16); ctx.fillRect(mx-28,my+131,56,6);
      const files = ["📁 .claude/","  📄 CLAUDE.md","  🤖 agents/","  🛠  skills/","  📋 rules/"];
      const af = isActive ? Math.floor(codeFlick/14)%files.length : -1;
      files.forEach((text,i) => {
        const hl = i===af;
        if (hl) { ctx.fillStyle="rgba(99,102,241,0.2)"; ctx.fillRect(mx-63,my+16+i*17,126,13); }
        ctx.fillStyle = hl?"#c7d2fe":"rgba(165,180,252,0.7)"; ctx.font=`${hl?"bold ":""}11px monospace`; ctx.textAlign="left";
        ctx.fillText(text, mx-60, my+28+i*18);
      });
      if (isActive && codeFlick > 70) {
        const fa = phase==="handoff" ? Math.max(0,1-handoffProgress*2) : Math.min(1,(codeFlick-70)/25);
        ctx.globalAlpha = fa;
        ctx.fillStyle="#0f2218"; ctx.strokeStyle="#34d399"; ctx.lineWidth=1.5;
        rr(mx+20,my+10,40,30,5); ctx.fill(); ctx.stroke();
        ctx.fillStyle="rgba(52,211,153,0.4)"; ctx.fillRect(mx+24,my+15,32,3); ctx.fillRect(mx+24,my+21,22,3); ctx.fillRect(mx+24,my+27,28,3);
        ctx.fillStyle="#34d399"; ctx.font="11px serif"; ctx.textAlign="center"; ctx.fillText("📸",mx+50,my+34);
        ctx.globalAlpha=1;
      }
      ctx.fillStyle="rgba(196,181,253,0.95)"; ctx.font="bold 13px monospace"; ctx.textAlign="center";
      ctx.fillText("Developer Codebase", mx, GROUND+20);
    };

    // ── Draw reporters (left — always visible, active one bounces) ────────
    const drawReporters = () => {
      const reporters = [
        { emoji: "👤", label: "Client",  y: GROUND - 55 },
        { emoji: "🧪", label: "QA",      y: GROUND      },
        { emoji: "📋", label: "PM / CI", y: GROUND + 55 },
      ];
      const isArriving = phase === "arrive" || phase === "to-bug";
      const col = taskType === "feature" ? "99,102,241" : "239,68,68";
      reporters.forEach(({ emoji, label, y }, i) => {
        const active = isArriving && i === activeReporter;
        const bounce = active ? -Math.abs(Math.sin(subTick*0.2))*10 : 0;
        ctx.font = "28px serif"; ctx.textAlign = "center"; ctx.fillText(emoji, BUG_X, y+bounce);
        ctx.fillStyle = active ? (taskType==="feature"?"#a5b4fc":"#fca5a5") : "#cbd5e1";
        ctx.font = "bold 12px monospace"; ctx.textAlign = "center"; ctx.fillText(label, BUG_X, y+20+bounce);
        const a = active ? 0.9 : 0.25;
        ctx.strokeStyle=`rgba(${col},${a})`; ctx.lineWidth=active?2:1; ctx.setLineDash(active?[]:[3,6]);
        ctx.beginPath(); ctx.moveTo(BUG_X+16,y-8); ctx.lineTo(BUG_X+44,y-8); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle=`rgba(${col},${a})`;
        ctx.beginPath(); ctx.moveTo(BUG_X+47,y-8); ctx.lineTo(BUG_X+39,y-13); ctx.lineTo(BUG_X+39,y-3); ctx.closePath(); ctx.fill();
      });
    };

    // ── Draw Telegram phone — sits below path on right, always visible ────
    const drawPhone = () => {
      const px = PHONE_X;
      const pw = 58, ph = 96, pr = 10;
      const pTop = PHONE_Y + 8;
      const isArriving = phase==="arrive" || phase==="to-bug" || phase==="to-dev" || phase==="fixing";
      const isDone = phoneNotifAlpha > 0;

      // glow
      const glowStr = isDone ? phoneNotifAlpha*0.55 : isArriving ? 0.2+Math.abs(Math.sin(tick*0.05))*0.15 : 0.06;
      const g = ctx.createRadialGradient(px,pTop+ph/2,0,px,pTop+ph/2,75);
      g.addColorStop(0,`rgba(34,211,238,${glowStr})`); g.addColorStop(1,"rgba(34,211,238,0)");
      ctx.fillStyle=g; ctx.beginPath(); ctx.arc(px,pTop+ph/2,75,0,Math.PI*2); ctx.fill();

      // phone body
      ctx.fillStyle="#0f172a";
      ctx.strokeStyle = isDone ? "#34d399" : isArriving ? "#22d3ee" : "rgba(34,211,238,0.3)";
      ctx.lineWidth=2.5;
      rr(px-pw/2,pTop,pw,ph,pr); ctx.fill(); ctx.stroke();

      // screen bg
      ctx.fillStyle = isDone ? "#0a1f14" : isArriving ? "#091a2a" : "#080f1a";
      rr(px-pw/2+5,pTop+7,pw-10,ph-15,6); ctx.fill();

      if (isDone) {
        // ✅ reply on screen
        ctx.font="16px serif"; ctx.textAlign="center"; ctx.fillText("✈️",px,pTop+24);
        ctx.fillStyle="#14532d"; ctx.strokeStyle="rgba(52,211,153,0.6)"; ctx.lineWidth=1;
        rr(px-pw/2+6,pTop+31,pw-12,34,5); ctx.fill(); ctx.stroke();
        ctx.fillStyle="#86efac"; ctx.font="bold 9px monospace"; ctx.textAlign="center";
        ctx.fillText(taskType==="feature"?"✅ Feature built!":"✅ Bug fixed!",px,pTop+44);
        ctx.fillStyle="rgba(134,239,172,0.8)"; ctx.font="8px monospace";
        ctx.fillText("📸 proof sent",px,pTop+57);
      } else if (isArriving) {
        // incoming notification on screen — pulsing
        const pa = 0.7+Math.abs(Math.sin(tick*0.07))*0.3;
        ctx.font="16px serif"; ctx.textAlign="center"; ctx.fillText("✈️",px,pTop+24);
        ctx.globalAlpha=pa;
        ctx.fillStyle="#1e3a5f"; ctx.strokeStyle="rgba(34,211,238,0.6)"; ctx.lineWidth=1;
        rr(px-pw/2+6,pTop+31,pw-12,34,5); ctx.fill(); ctx.stroke();
        ctx.fillStyle="#e0f2fe"; ctx.font="bold 9px monospace"; ctx.textAlign="center";
        ctx.fillText(taskType==="feature"?"✨ New feature":"🐛 New bug",px,pTop+44);
        ctx.fillStyle="rgba(148,163,184,0.9)"; ctx.font="8px monospace";
        ctx.fillText("notified via bot",px,pTop+57);
        ctx.globalAlpha=1;
        // red notification dot
        ctx.fillStyle="#ef4444"; ctx.beginPath(); ctx.arc(px+pw/2-6,pTop+6,7,0,Math.PI*2); ctx.fill();
        ctx.fillStyle="white"; ctx.font="bold 8px monospace"; ctx.textAlign="center"; ctx.fillText("1",px+pw/2-6,pTop+10);
      } else {
        // idle screen
        ctx.font="18px serif"; ctx.textAlign="center"; ctx.fillText("✈️",px,pTop+34);
        ctx.fillStyle="rgba(103,232,249,0.5)"; ctx.font="bold 9px monospace"; ctx.textAlign="center";
        ctx.fillText("Telegram",px,pTop+54);
      }

      // home bar
      ctx.fillStyle="rgba(34,211,238,0.3)"; ctx.fillRect(px-10,pTop+ph-8,20,3);

      // label below phone
      ctx.fillStyle="#e2e8f0"; ctx.font="bold 12px monospace"; ctx.textAlign="center";
      ctx.fillText("📱 Telegram Bot",px,pTop+ph+18);

      // ✅ delivered badge above phone — big + bright
      if (isDone) {
        ctx.globalAlpha=Math.min(1,phoneNotifAlpha);
        ctx.fillStyle="#052e16"; ctx.strokeStyle="#34d399"; ctx.lineWidth=2;
        rr(px-65,pTop-52,130,34,8); ctx.fill(); ctx.stroke();
        ctx.fillStyle="#6ee7b7"; ctx.font="bold 12px monospace"; ctx.textAlign="center";
        ctx.fillText(taskType==="feature"?"✅ Feature built! 🎉":"✅ Bug fixed! 📸",px,pTop-29);
        ctx.globalAlpha=1;
      }

      // dashed connector perch → phone
      ctx.strokeStyle="rgba(34,211,238,0.14)"; ctx.lineWidth=1; ctx.setLineDash([3,6]);
      ctx.beginPath(); ctx.moveTo(px,PERCH_Y+62); ctx.lineTo(px,pTop); ctx.stroke();
      ctx.setLineDash([]);
    };

    // ── Draw ground path ─────────────────────────────────────────────────
    const drawPath = () => {
      ctx.strokeStyle = "rgba(99,102,241,0.18)"; ctx.lineWidth = 1.5; ctx.setLineDash([8,10]);
      ctx.beginPath(); ctx.moveTo(BUG_X+52,GROUND+14); ctx.lineTo(DEV_X-80,GROUND+14); ctx.stroke();
      ctx.setLineDash([]);
      ctx.strokeStyle = "rgba(99,102,241,0.06)"; ctx.lineWidth = 6;
      ctx.beginPath(); ctx.moveTo(BUG_X+52,GROUND+14); ctx.lineTo(DEV_X-80,GROUND+14); ctx.stroke();
      ctx.fillStyle = "rgba(99,102,241,0.3)";
      ctx.beginPath(); ctx.moveTo(DEV_X-77,GROUND+14); ctx.lineTo(DEV_X-87,GROUND+8); ctx.lineTo(DEV_X-87,GROUND+20); ctx.closePath(); ctx.fill();
    };

    // ── PM dashboard toast (top center) ──────────────────────────────────
    const drawToast = () => {
      if (toastAlpha <= 0) return;
      ctx.globalAlpha = Math.min(1, toastAlpha);
      ctx.fillStyle = "#052e16"; ctx.strokeStyle = "rgba(52,211,153,0.7)"; ctx.lineWidth = 1.5;
      rr(W/2-230,12,460,44,10); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#6ee7b7"; ctx.font = "bold 13px monospace"; ctx.textAlign = "center";
      const msg = taskType==="feature" ? "✅  Feature built — screenshot on PM Dashboard + Telegram ✅ sent!" : "✅  Bug fixed — screenshot on PM Dashboard + Telegram ✅ sent!";
      ctx.fillText(msg, W/2, 39);
      ctx.globalAlpha = 1;
    };

    // ── Status labels ────────────────────────────────────────────────────
    const getLabels = (): Record<Phase, string> => ({
      idle:        "💤  AgentInbox on standby — waiting for tasks...",
      arrive:      taskType==="feature" ? "✨  Feature request submitted — agent + Telegram both notified!" : "🐛  Bug submitted via form or CI — agent + Telegram both notified!",
      "to-bug":    `🏃  Agent picks up the ${taskType==="feature"?"feature":"bug"} from reporter`,
      "to-dev":    `🏃  Carrying ${taskType==="feature"?"feature spec":"bug"} to developer codebase...`,
      fixing:      "⚡  Claude reads codebase + rules — implementing fix...",
      handoff:     "🤝  Claude hands screenshot proof to AgentInbox agent",
      "to-client": "🏃  Delivering fix + screenshot proof back to client...",
      deliver:     "🎉  Fix delivered to client + Telegram ✅ sent simultaneously!",
      "to-center": "↩️  Agent returns to standby — ready for next task",
    });

    const setPhase = (p: Phase) => {
      phase = p; subTick = 0;
      labelText = getLabels()[p] ?? "";
      labelAlpha = 0; labelTick = 0;
    };
    setTimeout(() => { activeReporter = Math.floor(Math.random()*3); setPhase("arrive"); }, 2000);

    // ── Main loop ────────────────────────────────────────────────────────
    const loop = () => {
      ctx.clearRect(0,0,W,H);
      ctx.fillStyle = "#06080f"; ctx.fillRect(0,0,W,H);
      tick++; subTick++;

      drawPath();
      drawReporters();
      drawPhone();
      drawMonitor();

      if (phase === "idle") {
        agent.x=CENTER_X; agent.y=PERCH_Y+30; agent.dir=1;
        agent.carrying=false; agent.hasScreenshot=false; agent.excited=0; agent.frame=tick;
        phoneNotifAlpha=0;
        ctx.fillStyle="rgba(165,180,252,0.9)"; ctx.font="bold 12px monospace"; ctx.textAlign="center";
        ctx.fillText("💤 on standby", CENTER_X, PERCH_Y-20);

      } else if (phase === "arrive") {
        // task floats RIGHT from reporter, phone simultaneously lights up
        agent.x=CENTER_X; agent.y=PERCH_Y+30; agent.dir=1; agent.carrying=false; agent.excited=0; agent.frame=tick;
        if (!taskProj.done) {
          taskProj.x+=3;
          taskProj.y=GROUND-40+Math.sin(subTick*0.1)*10;
          ctx.font="20px serif"; ctx.textAlign="center";
          ctx.fillText(taskType==="feature"?"✨":"🐛", safe(taskProj.x), safe(taskProj.y));
          ctx.fillStyle=taskType==="feature"?"rgba(99,102,241,0.7)":"rgba(239,68,68,0.55)"; ctx.font="bold 8px monospace";
          ctx.fillText(taskType==="feature"?"feature req":"bug report", safe(taskProj.x), safe(taskProj.y)+14);
          if (taskProj.x > CENTER_X-40) taskProj.done=true;
        } else {
          agent.excited=subTick;
          agent.y=Math.max(PERCH_Y+30, PERCH_Y+30+subTick*3);
          if (subTick>28 || agent.y>=GROUND-10) {
            agent.y=GROUND; taskProj.done=false; taskProj.x=BUG_X+30; setPhase("to-bug");
          }
        }

      } else if (phase === "to-bug") {
        // runs LEFT to pick up task from reporter
        agent.dir=-1; agent.frame++; agent.excited=0; agent.carrying=false;
        agent.x-=SPEED; agent.y=GROUND-Math.abs(Math.sin(agent.frame*0.25))*5;
        if (agent.x <= BUG_X+52) { agent.carrying=true; agent.hasScreenshot=false; setPhase("to-dev"); }

      } else if (phase === "to-dev") {
        // runs RIGHT to codebase
        agent.dir=1; agent.frame++; agent.carrying=true; agent.hasScreenshot=false; agent.excited=0;
        agent.x+=SPEED; agent.y=GROUND-Math.abs(Math.sin(agent.frame*0.25))*5;
        if (agent.x >= DEV_X-100) { agent.x=DEV_X-100; agent.carrying=false; setPhase("fixing"); }

      } else if (phase === "fixing") {
        agent.x=DEV_X-100; agent.y=GROUND; agent.frame=0; agent.carrying=false; agent.excited=0;
        codeFlick++;
        if (codeFlick>150) { setPhase("handoff"); handoffProgress=0; }

      } else if (phase === "handoff") {
        agent.x=DEV_X-100; agent.y=GROUND; agent.frame=0; agent.excited=0; agent.dir=1;
        handoffProgress=Math.min(1, subTick/55);
        if (handoffProgress>=1) { agent.carrying=true; agent.hasScreenshot=true; codeFlick=0; setPhase("to-client"); }

      } else if (phase === "to-client") {
        // runs LEFT back to deliver fix to client/reporter side
        agent.dir=-1; agent.frame++; agent.carrying=true; agent.hasScreenshot=true; agent.excited=0;
        agent.x-=SPEED; agent.y=GROUND-Math.abs(Math.sin(agent.frame*0.25))*5;
        if (agent.x <= BUG_X+60) {
          agent.x=BUG_X+60; agent.carrying=false; agent.hasScreenshot=false;
          setPhase("deliver");
        }

      } else if (phase === "deliver") {
        // at client side: celebrate, PM toast + Telegram ✅ fire together
        agent.x=BUG_X+60; agent.dir=1; agent.carrying=false; agent.hasScreenshot=false;
        agent.excited=subTick;
        agent.y=GROUND-Math.abs(Math.sin(subTick*0.16))*18;
        toastAlpha=Math.min(1, subTick/15);
        phoneNotifAlpha=Math.min(1, subTick/20);
        if (subTick>200) toastAlpha=Math.max(0,1-(subTick-200)/40);
        if (subTick>260) {
          toastAlpha=0; phoneNotifAlpha=0; agent.excited=0; agent.y=GROUND;
          setPhase("to-center");
        }

      } else if (phase === "to-center") {
        // walks RIGHT from client side back up to center perch
        agent.dir=1; agent.frame++; agent.carrying=false; agent.excited=0;
        agent.x+=SPEED;
        const prog=Math.max(0,(agent.x-BUG_X)/(CENTER_X-BUG_X));
        agent.y=GROUND-prog*(GROUND-PERCH_Y-30)-Math.abs(Math.sin(agent.frame*0.25))*4;
        if (agent.x>=CENTER_X) {
          agent.x=CENTER_X; agent.y=PERCH_Y+30;
          taskProj.x=BUG_X+30; codeFlick=0; handoffProgress=0; phoneNotifAlpha=0;
          setPhase("idle");
          setTimeout(() => {
            loopCount++;
            taskType = loopCount%2===0 ? "bug" : "feature";
            activeReporter=Math.floor(Math.random()*3);
            setPhase("arrive");
          }, 2000);
        }
      }

      drawClaude();
      drawAgent();
      drawToast();

      labelTick++;
      labelAlpha=Math.min(1,labelTick/35);
      ctx.fillStyle="rgba(4,6,12,0.9)"; ctx.fillRect(0,H-46,W,46);
      ctx.strokeStyle="rgba(99,102,241,0.25)"; ctx.lineWidth=1;
      ctx.beginPath(); ctx.moveTo(0,H-46); ctx.lineTo(W,H-46); ctx.stroke();
      ctx.globalAlpha=labelAlpha; ctx.fillStyle="#cbd5e1"; ctx.font="bold 14px monospace"; ctx.textAlign="center";
      ctx.fillText(labelText, W/2, H-14);
      ctx.globalAlpha=1;

      animId=requestAnimationFrame(loop);
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
