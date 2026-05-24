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
  ],
  "generate_code": {
    "needed": false,
    "repo": "",
    "filename": "",
    "prompt": ""
  }
}

Rules:
- Base URL is https://api.github.com
- Use {OWNER} as placeholder for the authenticated GitHub username
- Steps execute in order
- For pushing a file use PUT /repos/{OWNER}/{repo}/contents/{path} with body: { message, content (base64) }
- If user wants code generated and pushed, set generate_code.needed to true
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
    const userRes = await fetch("https://api.github.com/user", {
      headers: { Authorization: `Bearer ${token}`, "User-Agent": "github-agent" },
    });
    const userData = await userRes.json();
    const owner = userData.login;

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

    // Generate code if needed
    if (plan.generate_code?.needed) {
      const codeRes = await groq.chat.completions.create({
        model: "llama3-8b-8192",
        messages: [
          { role: "system", content: "You are a code generator. Return ONLY the raw code, no explanation, no markdown backticks." },
          { role: "user", content: plan.generate_code.prompt },
        ],
        max_tokens: 2000,
      });
      const code = codeRes.choices[0]?.message?.content || "";
      const base64 = Buffer.from(code).toString("base64");

      // Add push step
      plan.steps.push({
        description: `Push ${plan.generate_code.filename} to ${plan.generate_code.repo}`,
        method: "PUT",
        endpoint: `/repos/{OWNER}/${plan.generate_code.repo}/contents/${plan.generate_code.filename}`,
        body: {
          message: `Add ${plan.generate_code.filename}`,
          content: base64,
        },
      });
    }

    const results = [];
    for (const step of plan.steps) {
      const result = await callGitHub(step.method, step.endpoint, step.body || {}, token, owner);
      results.push({ step, result });
    }

    const summary = await groq.chat.completions.create({
      model: "llama3-8b-8192",
      messages: [
        { role: "system", content: "Summarize the GitHub API results concisely. Include any URLs. Be brief and friendly." },
        { role: "user", content: `Command: "${command}"\nResults: ${JSON.stringify(results, null, 2)}` },
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
