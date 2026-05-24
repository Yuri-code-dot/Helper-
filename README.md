# 🤖 GitHub Agent

Autonomous GitHub agent powered by **Groq (llama-3.3-70b)**. Control your GitHub in plain English — from a browser or Termux.

---

## ⚡ Setup (5 minutes)

### 1. Get your keys
| Key | Where |
|---|---|
| `GROQ_API_KEY` | [console.groq.com](https://console.groq.com) → API Keys |
| `GITHUB_PAT` | [github.com/settings/tokens](https://github.com/settings/tokens) → needs `repo` scope |

### 2. Upload to GitHub
- Create a new repo on GitHub
- Upload all these files

### 3. Deploy to Vercel
- Go to [vercel.com](https://vercel.com) → New Project
- Import your GitHub repo
- Add environment variables:
  - `GROQ_API_KEY` = your Groq key
  - `GITHUB_PAT` = your GitHub PAT

### 4. Done!
Visit your Vercel URL and start typing commands.

---

## 📱 Use from Termux

```bash
# Install curl if needed
pkg install curl

# Run a command
curl -X POST https://your-app.vercel.app/api/agent \
  -H "Content-Type: application/json" \
  -d '{"command": "list my repos"}' | python3 -m json.tool
```

Or save as a script:

```bash
#!/bin/bash
# Save as ~/gh.sh and run: bash ~/gh.sh "create a repo called my-app"
curl -s -X POST https://your-app.vercel.app/api/agent \
  -H "Content-Type: application/json" \
  -d "{\"command\": \"$1\"}" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('summary', d.get('error')))"
```

---

## 💬 Example commands
- `"List all my repos"`
- `"Create a repo called my-portfolio"`
- `"Show open PRs in my-app"`
- `"Create a branch called feature/auth in my-app"`
- `"Merge PR #2 in my-app"`
- `"Add a file called README.md to my-app"`

---

## 🔒 Security
- Your keys live in Vercel's environment variables (never in code)
- `.env` is in `.gitignore` — never committed
- Only you can use this agent (your PAT is hardcoded server-side)
