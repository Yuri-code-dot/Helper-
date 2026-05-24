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
      "endpoint": "/user/repos",
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

CRITICAL RULES — NEVER BREAK THESE:
- Base URL is https://api.github.com
- Use {OWNER} as placeholder for the authenticated GitHub username
- ALWAYS use POST /user/repos to create a repo, NEVER /repos/{OWNER}
- When creating a repo ALWAYS include "private": false in body to make it public
- ALWAYS use PUT /repos/{OWNER}/{repo}/contents/{filename} to push or update files, NEVER POST
- For updating an existing file you MUST include the file "sha" in the body — first GET the file to get its sha
- For listing branches use GET /repos/{OWNER}/{repo}/branches
- For creating a branch use POST /repos/{OWNER}/{repo}/git/refs
- For opening a PR use POST /repos/{OWNER}/{repo}/pulls with head and base branch
- For merging a PR use PUT /repos/{OWNER}/{repo}/pulls/{pull_number}/merge
- For creating an issue use POST /repos/{OWNER}/{repo}/issues
- For adding topics use PUT /repos/{OWNER}/{repo}/topics with body: { "names": ["topic1"] }
- For creating a release use POST /repos/{OWNER}/{repo}/releases
- For starring a repo use PUT /user/starred/{OWNER}/{repo} with empty body
- For unstarring use DELETE /user/starred/{OWNER}/{repo}
- For forking use POST /repos/{OWNER}/{repo}/forks
- For listing repos use GET /user/repos?per_page=5
- Steps execute in order
- If user wants code generated and pushed set generate_code.needed to true
- Only return valid JSON, nothing else`;

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
      model: "llama-3.1-8b-instant",
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
        model: "llama-3.1-8b-instant",
        messages: [
          {
            role: "system",
            content: "You are a code generator. Return ONLY the raw code, no explanation, no markdown backticks, no comments.",
          },
          { role: "user", content: plan.generate_code.prompt },
        ],
        max_tokens: 2000,
      });
      const code = codeRes.choices[0]?.message?.content || "";
      const base64 = Buffer.from(code).toString("base64");

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

    // Execute steps
    const results = [];
    for (const step of plan.steps) {
      const result = await callGitHub(step.method, step.endpoint, step.body || {}, token, owner);
      results.push({ step, result });
    }

    // Simple summary without extra Groq call
    const succeeded = results.filter(r => r.result.ok).length;
    const failed = results.filter(r => !r.result.ok).length;

    // Extract useful URLs from results
    const urls = results
      .map(r => r.result.data?.html_url)
      .filter(Boolean);

    const summaryText = `Done! ${succeeded} step(s) succeeded${failed > 0 ? `, ${failed} failed` : ""}${urls.length > 0 ? `. Check it out: ${urls.join(", ")}` : ". Check your GitHub!"}`;

    return res.status(200).json({
      thoughts: plan.thoughts,
      steps: plan.steps,
      results,
      summary: summaryText,
      owner,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
