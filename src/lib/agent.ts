import OpenAI from "openai";
import { SYSTEM_PROMPT } from "./prompt";
import { runTool, toolSchemas } from "./tools";
import { getNextLeadQuestion, updateLeadDraftFromUserText, type Session } from "./session";

const getClient = () => {
  const apiKey = process.env.GROQ_API_KEY ?? process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  return new OpenAI({
    apiKey,
    baseURL: "https://api.groq.com/openai/v1",
  });
};

export type AgentEvent =
  | { type: "token"; text: string }
  | { type: "tool"; name: string }
  | { type: "done" }
  | { type: "reset" };

const TOOL_LABELS: Record<string, string> = {
  get_vehicle_info: "Fetching vehicle details…",
  create_lead: "Saving your details…",
  get_deal_status: "Checking your deal…",
  update_followup_preference: "Updating your preferences…",
  get_booking_status: "Checking your booking…",
  create_service_case: "Logging your service request…",
};

export async function* runAgent(
  s: Session,
  userText: string,
): AsyncGenerator<AgentEvent> {
  updateLeadDraftFromUserText(s, userText);
  s.messages.push({ role: "user", content: userText });

  const leadStarted = /test drive|book a test drive|test-drive|book a drive|drive request/i.test(userText);
  const bookingTimeQuestion = /confirm.*time|time.*test drive|test drive.*time|schedule.*test drive|slot|appointment|when.*test drive|confirm.*slot/i.test(userText);
  const forcedLeadQuestion = leadStarted && !bookingTimeQuestion ? getNextLeadQuestion(s) : null;
  if (forcedLeadQuestion && (s.leadDraft.name || s.leadDraft.phone || s.leadDraft.email || s.leadDraft.city)) {
    yield { type: "token", text: forcedLeadQuestion };
    yield { type: "done" };
    return;
  }

  const client = getClient();
  if (!client) {
    throw new Error("GROQ_API_KEY is not configured.");
  }

  for (let step = 0; step < 6; step++) {
    const stream = await client.chat.completions.create({
      model: process.env.GROQ_MODEL ?? "llama-3.3-70b-versatile",
      messages: [{ role: "system", content: SYSTEM_PROMPT }, ...s.messages.slice(-30)],
      tools: toolSchemas,
      stream: true,
      temperature: 0.3,
    });

    let text = "";
    const calls: Record<number, { id: string; name: string; args: string }> = {};

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta;
      if (delta?.content) {
        text += delta.content;
        yield { type: "token", text: delta.content };
      }

      for (const tc of delta?.tool_calls ?? []) {
        const c = (calls[tc.index] ??= { id: "", name: "", args: "" });
        if (tc.id) c.id = tc.id;
        if (tc.function?.name) c.name += tc.function.name;
        if (tc.function?.arguments) c.args += tc.function.arguments;
      }
    }

    const toolCalls = Object.values(calls);
    if (!toolCalls.length) {
      s.messages.push({ role: "assistant", content: text });
      yield { type: "done" };
      return;
    }

    if (text) yield { type: "reset" };
    s.messages.push({
      role: "assistant",
      content: null,
      tool_calls: toolCalls.map((c) => ({
        id: c.id,
        type: "function",
        function: { name: c.name, arguments: c.args },
      })),
    });

    for (const c of toolCalls) {
      yield { type: "tool", name: TOOL_LABELS[c.name] ?? "Working…" };
      const result = await runTool(c.name, c.args, s);
      s.messages.push({ role: "tool", tool_call_id: c.id, content: result });
    }
  }

  yield { type: "token", text: "I'm having trouble completing that. Could you rephrase or try again?" };
  yield { type: "done" };
}
