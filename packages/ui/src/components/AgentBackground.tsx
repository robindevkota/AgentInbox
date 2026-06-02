import { useEffect, useRef } from "react";

export function AgentBackground() {
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
        g.addColorStop(0, `rgba(129,140,248,${a.toFixed(3)})`); g.addColorStop(1, "rgba(129,140,248,0)");
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
