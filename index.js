import { useState, useRef, useEffect } from "react";
import Head from "next/head";

const SUGGESTIONS = [
  "List all my repos",
  "Create a repo called my-app",
  "Show my open pull requests",
  "Create a branch called feature/login in my-app",
  "Merge PR #1 in my-app",
];

export default function Home() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState([
    { role: "system", text: "GitHub Agent ready. Type a command below." },
  ]);
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function run(cmd) {
    const command = cmd || input.trim();
    if (!command || loading) return;
    setInput("");
    setLoading(true);
    setMessages((p) => [...p, { role: "user", text: command }]);

    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command }),
      });
      const data = await res.json();

      if (data.error) {
        setMessages((p) => [...p, { role: "error", text: data.error }]);
      } else {
        setMessages((p) => [
          ...p,
          { role: "thinking", text: data.thoughts, steps: data.steps },
          { role: "result", text: data.summary },
        ]);
      }
    } catch (e) {
      setMessages((p) => [...p, { role: "error", text: e.message }]);
    }
    setLoading(false);
  }

  return (
    <>
      <Head>
        <title>GitHub Agent</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </Head>

      <div className="app">
        {/* Header */}
        <header>
          <div className="logo">
            <svg width="20" height="20" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
            </svg>
            <span>GitHub Agent</span>
          </div>
          <div className="powered">powered by llama-3.3-70b</div>
        </header>

        {/* Messages */}
        <main>
          {messages.map((msg, i) => (
            <div key={i} className={`msg msg-${msg.role}`}>
              {msg.role === "system" && (
                <div className="system-msg">⬡ {msg.text}</div>
              )}
              {msg.role === "user" && (
                <div className="bubble user-bubble">{msg.text}</div>
              )}
              {msg.role === "thinking" && (
                <div className="bubble agent-bubble thinking">
                  <div className="thoughts">◎ {msg.text}</div>
                  {msg.steps?.map((s, j) => (
                    <div key={j} className="step">
                      <span className={`method method-${s.method}`}>{s.method}</span>
                      <span className="step-desc">{s.description}</span>
                    </div>
                  ))}
                </div>
              )}
              {msg.role === "result" && (
                <div className="bubble agent-bubble result">{msg.text}</div>
              )}
              {msg.role === "error" && (
                <div className="bubble error-bubble">⚠ {msg.text}</div>
              )}
            </div>
          ))}

          {loading && (
            <div className="msg">
              <div className="bubble agent-bubble loading">
                <span className="dot" />
                <span className="dot" />
                <span className="dot" />
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </main>

        {/* Suggestions */}
        <div className="suggestions">
          {SUGGESTIONS.map((s) => (
            <button key={s} className="chip" onClick={() => run(s)}>
              {s}
            </button>
          ))}
        </div>

        {/* Input */}
        <div className="input-row">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && run()}
            placeholder="Create a repo, open a PR, list branches..."
            disabled={loading}
          />
          <button onClick={() => run()} disabled={loading || !input.trim()}>
            {loading ? "..." : "Run"}
          </button>
        </div>
      </div>

      <style jsx global>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
          background: #0a0c10;
          color: #cdd9e5;
          font-family: 'IBM Plex Sans', sans-serif;
          font-size: 14px;
        }
        .app {
          display: flex;
          flex-direction: column;
          height: 100vh;
          max-width: 720px;
          margin: 0 auto;
        }
        header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 14px 20px;
          border-bottom: 1px solid #1c2128;
          background: #0d1117;
        }
        .logo {
          display: flex;
          align-items: center;
          gap: 10px;
          font-family: 'IBM Plex Mono', monospace;
          font-weight: 600;
          font-size: 14px;
          color: #e6edf3;
        }
        .powered {
          font-family: 'IBM Plex Mono', monospace;
          font-size: 10px;
          color: #3fb950;
          background: #0d2119;
          border: 1px solid #1a7f37;
          border-radius: 20px;
          padding: 2px 10px;
        }
        main {
          flex: 1;
          overflow-y: auto;
          padding: 20px;
          display: flex;
          flex-direction: column;
          gap: 14px;
        }
        .system-msg {
          text-align: center;
          font-family: 'IBM Plex Mono', monospace;
          font-size: 11px;
          color: #484f58;
        }
        .bubble {
          max-width: 80%;
          padding: 12px 16px;
          border-radius: 12px;
          font-size: 13px;
          line-height: 1.6;
          white-space: pre-wrap;
        }
        .user-bubble {
          background: #1f6feb;
          border-radius: 12px 12px 2px 12px;
          margin-left: auto;
          color: #fff;
        }
        .agent-bubble {
          background: #161b22;
          border: 1px solid #21262d;
          border-radius: 12px 12px 12px 2px;
        }
        .agent-bubble.thinking { border-color: #21262d; }
        .agent-bubble.result { border-color: #1a7f37; }
        .error-bubble {
          background: #1a0a0a;
          border: 1px solid #f85149;
          border-radius: 12px 12px 12px 2px;
          color: #f85149;
          font-family: 'IBM Plex Mono', monospace;
          font-size: 12px;
        }
        .thoughts {
          font-family: 'IBM Plex Mono', monospace;
          font-size: 11px;
          color: #8b949e;
          margin-bottom: 10px;
        }
        .step {
          display: flex;
          align-items: flex-start;
          gap: 8px;
          padding: 5px 0;
          border-top: 1px solid #21262d;
          font-family: 'IBM Plex Mono', monospace;
          font-size: 11px;
        }
        .method {
          padding: 1px 6px;
          border-radius: 4px;
          font-weight: 700;
          font-size: 10px;
          flex-shrink: 0;
          margin-top: 1px;
        }
        .method-GET { background: #0d2119; color: #3fb950; }
        .method-POST { background: #0d1a2e; color: #58a6ff; }
        .method-PATCH { background: #1a1a0d; color: #e3b341; }
        .method-DELETE { background: #1a0d0d; color: #f85149; }
        .method-PUT { background: #1a0d2e; color: #bc8cff; }
        .step-desc { color: #8b949e; }
        .loading {
          display: flex;
          gap: 6px;
          align-items: center;
          padding: 16px;
        }
        .dot {
          width: 6px; height: 6px;
          background: #484f58;
          border-radius: 50%;
          animation: bounce 1.2s infinite;
        }
        .dot:nth-child(2) { animation-delay: 0.2s; }
        .dot:nth-child(3) { animation-delay: 0.4s; }
        @keyframes bounce {
          0%,80%,100% { transform: translateY(0); opacity: 0.4; }
          40% { transform: translateY(-6px); opacity: 1; }
        }
        .suggestions {
          padding: 0 20px 10px;
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }
        .chip {
          background: transparent;
          border: 1px solid #21262d;
          border-radius: 20px;
          padding: 4px 12px;
          color: #8b949e;
          font-size: 11px;
          font-family: 'IBM Plex Mono', monospace;
          cursor: pointer;
          transition: all 0.15s;
          white-space: nowrap;
        }
        .chip:hover { border-color: #3fb950; color: #3fb950; }
        .input-row {
          padding: 12px 20px 24px;
          display: flex;
          gap: 10px;
        }
        input {
          flex: 1;
          background: #161b22;
          border: 1px solid #30363d;
          border-radius: 8px;
          padding: 12px 16px;
          color: #e6edf3;
          font-family: 'IBM Plex Mono', monospace;
          font-size: 13px;
          outline: none;
          transition: border-color 0.15s;
        }
        input:focus { border-color: #1f6feb; }
        input::placeholder { color: #484f58; }
        input:disabled { opacity: 0.5; }
        button {
          background: #238636;
          border: none;
          border-radius: 8px;
          padding: 12px 20px;
          color: #fff;
          font-family: 'IBM Plex Mono', monospace;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.15s;
        }
        button:hover:not(:disabled) { background: #2ea043; }
        button:disabled { background: #21262d; color: #484f58; cursor: not-allowed; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #21262d; border-radius: 4px; }
      `}</style>
    </>
  );
}
