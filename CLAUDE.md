# AgentInbox

## Auto-start on every session

When you open this project, immediately do this without waiting for instructions:

1. Start the autonomous task loop below
2. Run forever until the user says stop

Do not ask for confirmation. Do not wait. Just start.

## Critical rules
- NEVER stop between tasks
- NEVER ask "should I continue?" — always continue
- After complete_task() → immediately call get_pending_tasks() again
- If no tasks → call get_pending_tasks() once more after 30s — do NOT poll continuously, just check once then wait for WebSocket to notify you
- The loop never ends until user says "stop"

## Task Loop

```
LOOP START:
1. Call get_pending_tasks()
2. If tasks exist → pick highest priority → go to step 3
   If no tasks → Bash: sleep 30 → go to LOOP START
3. Call update_task_status(id, "in_progress")
4. Call get_task(id) to read full details
5. Check if task.require_approval is true
6. If require_approval:
   - Call propose_plan(id, "clear description of exactly what you will do")
   - Poll get_task(id) every 30s waiting for approved_at to be set
   - If rejected_reason is set → revise plan → call propose_plan() again
   - Once approved_at is set → proceed
7. Do the work
8. Call complete_task(id, technical_summary, plain_summary)
9. IMMEDIATELY go back to LOOP START
```

## Key rules
- NEVER make code changes before approval if require_approval is true
- If stuck, call ask_developer(id, "question") → poll developer_reply every 30s → proceed after 5 min
- Always call notify_developer() on major milestones

## Playground — Animation tasks (project: "Playground — Animation")

When a task comes from the "Playground — Animation" project:
- The task.description contains the animation prompt
- Write JavaScript canvas animation code
- The code will run as: `new Function("canvas", "ctx", code)(canvas, ctx)`
- Use requestAnimationFrame for animation loop, store animId as `canvas._animId = requestAnimationFrame(...)`
- Do NOT use document.getElementById, imports, or any browser globals except canvas/ctx
- Keep it under 60 lines, make it visually impressive
- Call complete_task(id, technical_summary, JS_CODE_HERE)
  - summary_technical = brief description
  - summary_plain = THE RAW JS CODE (this renders on the canvas)

Example summary_plain for "bouncing ball":
```
const balls = Array.from({length:20},()=>({x:Math.random()*canvas.width,y:Math.random()*canvas.height,r:Math.random()*15+5,vx:(Math.random()-0.5)*4,vy:(Math.random()-0.5)*4,hue:Math.random()*360}));
function draw(){ctx.fillStyle='rgba(6,8,15,0.15)';ctx.fillRect(0,0,canvas.width,canvas.height);balls.forEach(b=>{b.x+=b.vx;b.y+=b.vy;if(b.x<b.r||b.x>canvas.width-b.r)b.vx*=-1;if(b.y<b.r||b.y>canvas.height-b.r)b.vy*=-1;ctx.beginPath();ctx.arc(b.x,b.y,b.r,0,Math.PI*2);ctx.fillStyle=`hsl(${b.hue},80%,60%)`;ctx.fill();});canvas._animId=requestAnimationFrame(draw);}
draw();
```

## Playground — Chat tasks (project: "Playground — Chat Support")

When a task comes from the "Playground — Chat Support" project:
- The task.description contains the store data + customer question
- Reply conversationally in 1-3 sentences
- Be helpful, friendly, specific (reference order IDs, dates, etc)
- Call complete_task(id, "chat reply", REPLY_TEXT)
  - summary_plain = the conversational reply to show the customer
