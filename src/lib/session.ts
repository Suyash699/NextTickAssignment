import type OpenAI from "openai";
import { normalizeIndianPhone } from "./validate";

export type Stage = "unknown" | "new_lead" | "pipeline" | "booking" | "service";

export interface Session {
  messages: OpenAI.Chat.ChatCompletionMessageParam[];
  stage: Stage;
  leadDraft: Partial<{
    name: string;
    phone: string;
    email: string;
    city: string;
    vehicle_model: string;
  }>;
  contactId?: string;
  dealId?: string;
}

const store = new Map<string, Session>();

const leadFields = ["name", "phone", "email", "city"] as const;

export function getSession(id: string): Session {
  if (!store.has(id)) {
    store.set(id, { messages: [], stage: "unknown", leadDraft: {} });
  }
  return store.get(id)!;
}

export function updateLeadDraftFromUserText(s: Session, text: string) {
  const value = text.trim();
  if (!value) return;

  const lower = value.toLowerCase();

  const emailMatch = value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  if (emailMatch && !s.leadDraft.email) {
    s.leadDraft.email = emailMatch[0];
  }

  const phoneMatch = value.match(/(?:\+?91[-\s]?)?(?:\d{10}|\d{3}[-\s]?\d{3}[-\s]?\d{4})/);
  const phone = phoneMatch ? normalizeIndianPhone(phoneMatch[0]) : null;
  if (phone && !s.leadDraft.phone) {
    s.leadDraft.phone = phone;
  }

  const cityMatch = value.match(/(?:from|in|live in|city|located in)\s+([A-Z][A-Za-z .'-]+?)(?:\?|[.,]|$)/i);
  if (cityMatch && !s.leadDraft.city) {
    s.leadDraft.city = cityMatch[1].trim();
  }

  if (!s.leadDraft.name) {
    const nameCandidates = [
      value.match(/(?:my name is|i am|i'm|this is|call me)\s+([A-Z][A-Za-z'-.]+(?:\s+[A-Z][A-Za-z'-.]+){0,3})/i),
      value.match(/^([A-Z][A-Za-z'-.]+(?:\s+[A-Z][A-Za-z'-.]+){0,3})$/),
      value.match(/\b([A-Z][A-Za-z'-.]+(?:\s+[A-Z][A-Za-z'-.]+){0,3})\b/),
    ];

    for (const match of nameCandidates) {
      if (!match) continue;
      const raw = match[1].trim();
      if (!raw || /\b(?:phone|email|city|test drive|book|login|address|number)\b/i.test(raw)) {
        continue;
      }
      s.leadDraft.name = raw;
      break;
    }
  }

  if (/test drive|book a test drive|test-drive/i.test(lower)) {
    s.stage = "new_lead";
  }
}

export function getNextLeadQuestion(s: Session): string | null {
  const missing = leadFields.find((field) => !s.leadDraft[field]);
  if (!missing) return null;

  const questions: Record<string, string> = {
    name: "May I have your full name, please?",
    phone: "May I have your phone number, please?",
    email: "Could you provide your email address?",
    city: "What city are you located in?",
  };

  return questions[missing] ?? null;
}
