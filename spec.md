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
index.html      ← all HTML + CSS + JS inline
db.json         ← { "posts": [] }
package.json    ← { "dependencies": { "json-server": "^0.17.4" } }
```

## UI requirements
- Clean editorial design — white background, max-width 700px centered
- Header with site title "The Blog" and a "New Post" button that toggles the form
- Post cards with: title (bold), author (muted), date, first 100 chars as excerpt
- Expanded post shows full body below the excerpt
- New post form slides in below header — fields: Title, Author, Body (textarea)
- Submit button: "Publish" — clears form and refreshes list on success
- No frameworks — plain DOM APIs only

## After building — screenshot proof (REQUIRED)
When the build is complete, you MUST take a screenshot and attach it:

1. Start json-server: `json-server db.json --port 3000`
2. Start HTTP server: `python -m http.server 8081` (run from the project root folder)
3. Use Playwright MCP: `browser_navigate` to `http://localhost:8081`
4. Use Playwright MCP: `browser_take_screenshot` — save the result
5. Read the saved screenshot file as base64
6. Call `complete_task` with `screenshot_base64` set to the base64 string

The screenshot will appear as a photo in Telegram and as a proof card on the PM dashboard.
