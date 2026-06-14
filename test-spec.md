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

## Screenshot
The worker handles screenshots automatically after you exit.
Pass the URL to your file in `complete_task` as `verification_url` and the worker will serve and screenshot it.

Example: `complete_task(id, summary_technical, summary_plain, verification_url="http://localhost:3000/index.html")`

Do NOT start any server or take screenshots yourself.
