# Blog Website Spec

## Stack
- `index.html` — single-file frontend (vanilla HTML, CSS, JavaScript inline)
- `db.json` — JSON Server backend data file
- `package.json` — only dependency: json-server

## How to run
```
npm install
npx json-server db.json --port 3000
```
Open `index.html` in a browser (no build step needed).

## Features
1. **Post list** — homepage shows all posts as cards (title, excerpt, date, author)
2. **Read post** — clicking a card shows full post content inline (expand/collapse)
3. **New post form** — title, author, and body fields; POST /posts on submit
4. **Delete post** — delete button on each card; DELETE /posts/:id
5. **Empty state** — friendly message when no posts exist

## File structure
```
index.html      ← all HTML + CSS + JS inline — MUST be in project root, NOT in a public/ subfolder
db.json         ← { "posts": [] }
package.json    ← { "dependencies": { "json-server": "^0.17.4" } }
```

IMPORTANT: Do NOT create a `public/` folder. `index.html` goes directly in the project root.

## UI requirements
- Clean editorial design — white background, max-width 700px centered
- Header with site title "The Blog" and a "New Post" button that toggles the form
- Post cards with: title (bold), author (muted), date, first 100 chars as excerpt
- Expanded post shows full body below the excerpt
- New post form slides in below header — fields: Title, Author, Body (textarea)
- Submit button: "Publish" — clears form and refreshes list on success
- No frameworks — plain DOM APIs only

## After building — screenshot proof (REQUIRED)
When the build is complete, you MUST take a screenshot:

1. Start json-server in background: `Start-Process npx -ArgumentList "json-server","db.json","--port","3000","--static","." -WindowStyle Hidden` (Windows) or `npx json-server db.json --port 3000 --static . &` (Mac/Linux)
2. Wait 3 seconds: `Start-Sleep 3` (Windows) or `sleep 3` (Mac/Linux)
3. Use Playwright MCP: `browser_resize` width=1280 height=900
4. Use Playwright MCP: `browser_navigate` to `http://localhost:3000`
5. Use Playwright MCP: `browser_take_screenshot` type=png — base64 is in the response directly
6. Call `complete_task` with `screenshot_base64` set to that base64 string

Do NOT use file:// URLs — they are blocked. Do NOT use python. Always use http://localhost.
