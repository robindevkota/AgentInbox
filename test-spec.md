# Test Spec — Hello World

## Task
Create a single `index.html` file in the project root that displays "Hello World" in large centered text.

## index.html content
```html
<!DOCTYPE html>
<html>
<head>
  <style>
    body { display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; font-family: sans-serif; background: #f0f0f0; }
    h1 { font-size: 4rem; color: #333; }
  </style>
</head>
<body>
  <h1>Hello World</h1>
</body>
</html>
```

## Screenshot proof (REQUIRED)
1. Write index.html to project root
2. Use the Bash tool to start a background server: `npx serve . --listen 8080 &`
3. Wait 3 seconds: `sleep 3`
4. Use Playwright MCP: `browser_resize` width=1280 height=900
5. Use Playwright MCP: `browser_navigate` to `http://localhost:8080`
6. Use Playwright MCP: `browser_take_screenshot` type=png — base64 is in the tool response
7. Call `complete_task` with `screenshot_base64` set to that base64

IMPORTANT:
- Use Bash tool for steps 2 and 3 (not PowerShell)
- Do NOT use file:// URLs — Playwright blocks them
- The base64 comes directly from browser_take_screenshot response — do not read any file
