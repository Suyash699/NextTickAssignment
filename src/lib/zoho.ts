const {
  ZOHO_CLIENT_ID,
  ZOHO_CLIENT_SECRET,
  ZOHO_REFRESH_TOKEN,
  ZOHO_ACCOUNTS_URL,
  ZOHO_API_DOMAIN,
} = process.env;

let cached: { token: string; expiresAt: number } | null = null;
let inflight: Promise<string> | null = null;

async function getAccessToken(): Promise<string> {
  if (cached && Date.now() < cached.expiresAt - 60_000) return cached.token;
  if (inflight) return inflight; // avoid parallel refreshes (Zoho rate-limits them)
  inflight = (async () => {
    const res = await fetch(`${ZOHO_ACCOUNTS_URL}/oauth/v2/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        client_id: ZOHO_CLIENT_ID!,
        client_secret: ZOHO_CLIENT_SECRET!,
        refresh_token: ZOHO_REFRESH_TOKEN!,
      }),
    });
    const data = await res.json();
    if (!data.access_token)
      throw new Error(`Zoho auth failed: ${JSON.stringify(data)}`);
    cached = {
      token: data.access_token,
      expiresAt: Date.now() + data.expires_in * 1000,
    };
    return cached.token;
  })().finally(() => (inflight = null));
  return inflight;
}

async function zoho<T = any>(
  path: string,
  init: RequestInit = {},
  retry = true,
): Promise<T | null> {
  const token = await getAccessToken();
  const res = await fetch(`${ZOHO_API_DOMAIN}/crm/v6${path}`, {
    ...init,
    headers: {
      Authorization: `Zoho-oauthtoken ${token}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
  if (res.status === 204) return null; // search with no results
  if (res.status === 401 && retry) {
    cached = null;
    return zoho(path, init, false);
  }
  if (!res.ok) throw new Error(`Zoho ${res.status}: ${await res.text()}`);
  return res.json();
}

const q = encodeURIComponent;

export async function findLeadByPhoneOrEmail(phone?: string, email?: string) {
  const criteria = phone
    ? `(Phone:equals:${phone})`
    : `(Email:equals:${email})`;
  const r = await zoho(`/Leads/search?criteria=${q(criteria)}`);
  return r?.data?.[0] ?? null;
}

export async function createLead(d: {
  name: string;
  phone: string;
  email: string;
  city: string;
  vehicle_model: string;
}) {
  const [first, ...rest] = d.name.trim().split(" ");
  const r = await zoho("/Leads", {
    method: "POST",
    body: JSON.stringify({
      data: [
        {
          First_Name: rest.length ? first : "",
          Last_Name: rest.length ? rest.join(" ") : first,
          Phone: d.phone,
          Email: d.email,
          City: d.city,
          Vehicle_Model: d.vehicle_model,
          Lead_Source: "AI Chat Agent",
        },
      ],
    }),
  });
  return r.data[0]; // { code, details: { id }, status }
}

export async function findDeal(phoneOrId: string) {
  const isId = /^\d{15,}$/.test(phoneOrId);
  if (isId) {
    const r = await zoho(`/Deals/${phoneOrId}`);
    return r?.data?.[0] ?? null;
  }
  const r = await zoho(
    `/Deals/search?criteria=${q(`(Customer_Phone:equals:${phoneOrId})`)}`,
  );
  return r?.data?.[0] ?? null;
}

export async function updateDeal(id: string, fields: Record<string, unknown>) {
  const r = await zoho("/Deals", {
    method: "PUT",
    body: JSON.stringify({ data: [{ id, ...fields }] }),
  });
  return r.data[0];
}

export async function findBooking(bookingIdOrPhone: string) {
  const criteria = bookingIdOrPhone.toUpperCase().startsWith("MAH-")
    ? `(Booking_ID:equals:${bookingIdOrPhone})`
    : `(Customer_Phone:equals:${bookingIdOrPhone})`;
  const r = await zoho(`/Deals/search?criteria=${q(criteria)}`);
  return (
    r?.data?.find((d: any) => d.Stage === "Closed Won - Booking Done") ?? null
  );
}

export async function findContactByPhone(phone: string) {
  const r = await zoho(`/Contacts/search?phone=${q(phone)}`);
  return r?.data?.[0] ?? null;
}

export async function createCase(d: {
  contactId: string;
  registration_no: string;
  odometer_km: number;
  issue: string;
  service_type: string;
  service_center: string;
}) {
  const r = await zoho("/Cases", {
    method: "POST",
    body: JSON.stringify({
      data: [
        {
          Subject: `${d.service_type}: ${d.registration_no}`,
          Contact_Name: { id: d.contactId },
          Description: d.issue,
          Registration_No: d.registration_no,
          Odometer_KM: d.odometer_km,
          Service_Center: d.service_center,
          Service_Type: d.service_type,
          Origin: "Chat",
        },
      ],
    }),
  });
  return r.data[0];
}
