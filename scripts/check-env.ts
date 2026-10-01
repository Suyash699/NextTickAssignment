const keys = [
  "ZOHO_CLIENT_ID",
  "ZOHO_CLIENT_SECRET",
  "ZOHO_REFRESH_TOKEN",
  "ZOHO_ACCOUNTS_URL",
  "ZOHO_API_DOMAIN",
];
for (const k of keys)
  console.log(
    k,
    process.env[k] ? `length ${process.env[k]!.length}` : "MISSING",
  );