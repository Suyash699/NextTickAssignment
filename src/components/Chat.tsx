"use client";

import { useEffect, useRef, useState } from "react";

type Msg = { role: "user" | "assistant"; text: string };

export default function Chat() {
  const [msgs, setMsgs] = useState<Msg[]>([
    { role: "assistant", text: "Welcome to Mahindra. How can I help you today?" },
  ]);
  const [input, setInput] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const sessionId = useRef(crypto.randomUUID());
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs, status]);

  async function send() {
    const text = input.trim();
    if (!text || busy) return;

    setInput("");
    setBusy(true);
    setMsgs((m) => [...m, { role: "user", text }, { role: "assistant", text: "" }]);

    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: sessionId.current, message: text }),
    });

    const reader = res.body?.getReader();
    if (!reader) {
      setBusy(false);
      setStatus("");
      return;
    }

    const dec = new TextDecoder();
    let buf = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buf += dec.decode(value, { stream: true });
      const parts = buf.split("\n\n");
      buf = parts.pop() ?? "";

      for (const p of parts) {
        const ev = JSON.parse(p.replace(/^data: /, ""));
        if (ev.type === "token") {
          setStatus("");
          setMsgs((m) => {
            const c = [...m];
            c[c.length - 1] = {
              role: "assistant",
              text: c[c.length - 1].text + ev.text,
            };
            return c;
          });
        } else if (ev.type === "tool") {
          setStatus(ev.name);
        } else if (ev.type === "done") {
          setStatus("");
        } else if (ev.type === "reset") {
          setMsgs((m) => {
            const c = [...m];
            c[c.length - 1] = { role: "assistant", text: "" };
            return c;
          });
        }
      }
    }

    setBusy(false);
    setStatus("");
  }

  return (
    <div className="mx-auto flex h-dvh max-w-2xl flex-col p-4">
      <header className="pb-3">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-red-700">Mahindra Assist</p>
        <h1 className="mt-2 text-2xl font-semibold text-gray-900">Virtual assistant</h1>
      </header>

      <div className="flex-1 space-y-3 overflow-y-auto rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        {msgs.map((m, i) => (
          <div key={i} className={m.role === "user" ? "text-right" : "text-left"}>
            <span
              className={`inline-block max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2 text-sm leading-6 ${
                m.role === "user"
                  ? "bg-red-700 text-white"
                  : "bg-gray-100 text-gray-900"
              }`}
            >
              {m.text || "…"}
            </span>
          </div>
        ))}
        {status && <p className="text-sm italic text-gray-500">{status}</p>}
        <div ref={bottom} />
      </div>

      <div className="mt-3 flex gap-2">
        <input
          className="flex-1 rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-red-700"
          value={input}
          disabled={busy}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="Ask about a model, booking, or service…"
        />
        <button
          onClick={send}
          disabled={busy}
          className="rounded-xl bg-red-700 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          Send
        </button>
      </div>
    </div>
  );
}
