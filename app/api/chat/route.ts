import { getSession } from "@/src/lib/session";
import { runAgent } from "@/src/lib/agent";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const { sessionId, message } = await req.json();
  const session = getSession(sessionId);
  const enc = new TextEncoder();

  const body = new ReadableStream({
    async start(controller) {
      try {
        for await (const ev of runAgent(session, message)) {
          controller.enqueue(enc.encode(`data: ${JSON.stringify(ev)}\n\n`));
        }
      } catch (e: any) {
        console.error("CHAT ERROR:", e?.status, e?.message, e?.error ?? e);
        const msg =
          e?.status === 429
            ? "We're experiencing high demand. Please try again in a moment."
            : "Something went wrong. Please try again.";

        controller.enqueue(enc.encode(`data: ${JSON.stringify({ type: "token", text: msg })}\n\n`));
        controller.enqueue(enc.encode(`data: ${JSON.stringify({ type: "done" })}\n\n`));
      }

      controller.close();
    },
  });

  return new Response(body, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
    },
  });
}
