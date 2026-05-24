import Groq from "groq-sdk";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const SYSTEM_PROMPT = `You are an autonomous GitHub agent. The user gives you natural language commands and you execute them using the GitHub REST API.

Respond ONLY with a valid JSON object, no markdown, no explanation. Format:
{
  "thoughts": "brief explanation of what you will do",
  "steps": [
    {
      "description": "what this step does",
      "method": "GET|POST|PATCH|DELETE|PUT",
      "endpoint": "/repos/{OWNER}/{repo}",
      "body": {}
    }
  ]
}

Rules:
- Base URL is https://api.github.com
- Use {OWNER} as placeholder for the authenticated GitHub username
- Steps execute in order
- For creating PRs: head is the source branch, base is the target branch
- body can be empty {} if not needed
- Only return JSON, nothing else`;

async function callGitHub(method, endpoint, body, token, owner) {
  const url = `https://api.github.com${endpoint.replace(/\{OWNER\}/g, owner)}`;
  const opts = {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "User-Agent": "github-agent",
      Accept: "application/vnd.github+json",
    },
  };
  if (body && Object.keys(body).length > 0) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  return { ok: res.ok, status: res.status, data };
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { command } = req.body;
  if (!command) return res.status(400).json({ error: "No command provided" });

  const token = process.env.GITHUB_PAT;
  if (!token) return res.status(500).json({ error: "GITHUB_PAT not configured" });

  try {
    // Get GitHub username
    const userRes = await fetch("https://api.github.com/user", {
      headers: { Authorization: `Bearer ${token}`, "User-Agent": "github-agent" },
    });
    const userData = await userRes.json();
    const owner = userData.login;

    // Ask Groq to plan steps
    const completion = await groq.chat.completions.create({
      model: "llama3-8b-8192",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: command },
      ],
      temperature: 0.1,
      max_tokens: 1000,
    });

    const raw = completion.choices[0]?.message?.content || "";
    let plan;
    try {
      plan = JSON.parse(raw.replace(/```json|```/g, "").trim());
    } catch {
      return res.status(200).json({ thoughts: "Done", steps: [], results: [], summary: raw });
    }

    // Execute each step
    const results = [];
    for (const step of plan.steps) {
      const result = await callGitHub(step.method, step.endpoint, step.body || {}, token, owner);
      results.push({ step, result });
    }

    // Ask Groq to summarize
    const summary = await groq.chat.completions.create({
      model: "llama3-8b-8192",
      messages: [
        {
          role: "system",
          content: "Summarize the GitHub API results concisely. If there are URLs (html_url), include them. Be brief and friendly.",
        },
        {
          role: "user",
          content: `Command: "${command}"\nResults: ${JSON.stringify(results, null, 2)}`,
        },
      ],
      max_tokens: 500,
    });

    return res.status(200).json({
      thoughts: plan.thoughts,
      steps: plan.steps,
      results,
      summary: summary.choices[0]?.message?.content || "Done!",
      owner,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
