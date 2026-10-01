import type OpenAI from "openai";
import * as crm from "./zoho";
import { isValidEmail, normalizeIndianPhone } from "./validate";
import type { Session } from "./session";

export const toolSchemas: OpenAI.Chat.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "get_vehicle_info",
      description: "Get specs, variants and indicative ex-showroom pricing for a Mahindra model.",
      parameters: {
        type: "object",
        properties: { model: { type: "string", enum: ["XUV700", "Thar", "Scorpio-N"] } },
        required: ["model"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_lead",
      description: "Create a new lead AFTER collecting name, phone, email and city. Checks for duplicates.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string" },
          phone: { type: "string" },
          email: { type: "string" },
          city: { type: "string" },
          vehicle_model: { type: "string" },
        },
        required: ["name", "phone", "email", "city", "vehicle_model"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_deal_status",
      description: "Look up an active deal (test drive, quotation, dealer) by phone number or deal ID.",
      parameters: {
        type: "object",
        properties: { phone_or_deal_id: { type: "string" } },
        required: ["phone_or_deal_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_followup_preference",
      description: "Update how/when the customer wants to be followed up. Needs a deal found earlier.",
      parameters: {
        type: "object",
        properties: { preference: { type: "string", description: "e.g. 'WhatsApp, evenings'" } },
        required: ["preference"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_booking_status",
      description: "Get allocation/delivery status for a booked vehicle by Booking ID (MAH-xxxx) or phone.",
      parameters: {
        type: "object",
        properties: { booking_id_or_phone: { type: "string" } },
        required: ["booking_id_or_phone"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_service_case",
      description: "Log a service request or complaint. Needs phone, registration number, odometer, issue/service type and service center.",
      parameters: {
        type: "object",
        properties: {
          phone: { type: "string" },
          registration_no: { type: "string" },
          odometer_km: { type: "number" },
          issue: { type: "string" },
          service_type: { type: "string", enum: ["Periodic Maintenance", "Complaint", "Repair", "Other"] },
          service_center: { type: "string" },
        },
        required: ["phone", "registration_no", "odometer_km", "issue", "service_type", "service_center"],
      },
    },
  },
];

const VEHICLES: Record<string, unknown> = {
  XUV700: {
    body: "7-seat SUV",
    engines: ["2.0L mStallion turbo petrol", "2.2L mHawk diesel"],
    variants: ["MX", "AX3", "AX5", "AX7", "AX7L"],
    notes: "ADAS on AX7/AX7L, AWD on select diesel AX7/AX7L",
    price: "Indicative range; confirm with dealer",
  },
  Thar: {
    body: "Lifestyle 4x4 SUV",
    engines: ["2.0L mStallion petrol", "2.2L mHawk diesel"],
    variants: ["AX(O)", "LX"],
    notes: "4x4 and RWD options",
    price: "Indicative range; confirm with dealer",
  },
  "Scorpio-N": {
    body: "7-seat SUV",
    engines: ["2.0L mStallion petrol", "2.2L mHawk diesel"],
    variants: ["Z2", "Z4", "Z6", "Z8", "Z8L"],
    notes: "4WD on select variants",
    price: "Indicative range; confirm with dealer",
  },
};

type Handler = (args: any, s: Session) => Promise<unknown>;

export const handlers: Record<string, Handler> = {
  async get_vehicle_info({ model }) {
    return VEHICLES[model] ?? { error: "Model not found" };
  },

  async create_lead(a, s) {
    const PLACEHOLDER =
      /^\s*(\[.*\]|<.*>|unknown|n\/a|none|null|undefined|not provided|tbd)\s*$/i;
    const bad = ["name", "phone", "email", "city", "vehicle_model"].filter(
      (k) => !a[k] || PLACEHOLDER.test(String(a[k])),
    );
    if (bad.length) {
      return {
        error: "missing_fields",
        missing: bad,
        message:
          "Do NOT call this tool again yet. Ask the user for only the first missing field, in one short question.",
      };
    }
    const phone = normalizeIndianPhone(a.phone);
    if (!phone) return { error: "invalid_phone", message: "Phone must be a 10-digit Indian mobile number." };
    if (!isValidEmail(a.email)) return { error: "invalid_email" };

    const existing = await crm.findLeadByPhoneOrEmail(phone, undefined);
    if (existing) {
      return {
        status: "duplicate",
        leadId: existing.id,
        message: "Lead already exists; do not create another.",
      };
    }

    const res = await crm.createLead({ ...a, phone });
    s.leadDraft = {};
    return { status: "created", leadId: res.details?.id };
  },

  async get_deal_status({ phone_or_deal_id }, s) {
    const key = /^\d{15,}$/.test(phone_or_deal_id)
      ? phone_or_deal_id
      : normalizeIndianPhone(phone_or_deal_id) ?? phone_or_deal_id;

    const deal = await crm.findDeal(key);
    if (!deal) return { found: false };
    s.dealId = deal.id;

    return {
      found: true,
      dealId: deal.id,
      name: deal.Deal_Name,
      stage: deal.Stage,
      vehicle: deal.Vehicle_Model,
      testDrive: deal.Test_Drive_Time,
      followup: deal.Followup_Preference,
    };
  },

  async update_followup_preference({ preference }, s) {
    if (!s.dealId) {
      return { error: "no_deal_selected", message: "Look up the deal first." };
    }

    await crm.updateDeal(s.dealId, { Followup_Preference: preference });
    return { status: "updated" };
  },

  async get_booking_status({ booking_id_or_phone }) {
    const key = booking_id_or_phone.toUpperCase().startsWith("MAH-")
      ? booking_id_or_phone
      : normalizeIndianPhone(booking_id_or_phone) ?? booking_id_or_phone;

    const b = await crm.findBooking(key);
    if (!b) return { found: false };

    return {
      found: true,
      bookingId: b.Booking_ID,
      vehicle: b.Vehicle_Model,
      allocationStage: b.Allocation_Stage,
      vin: b.VIN ?? "Not yet allocated",
    };
  },

  async create_service_case(a, s) {
    const phone = normalizeIndianPhone(a.phone);
    if (!phone) return { error: "invalid_phone" };

    const contact = await crm.findContactByPhone(phone);
    if (!contact) {
      return { error: "contact_not_found", message: "No owner record for this number." };
    }

    s.contactId = contact.id;
    const res = await crm.createCase({ ...a, contactId: contact.id, odometer_km: a.odometer_km });
    return { status: "created", caseId: res.details?.id };
  },
};

export async function runTool(name: string, rawArgs: string, s: Session): Promise<string> {
  try {
    const args = JSON.parse(rawArgs || "{}");
    return JSON.stringify(await handlers[name](args, s));
  } catch (e: any) {
    return JSON.stringify({
      error: "tool_failed",
      message: String(e.message).slice(0, 200),
    });
  }
}
