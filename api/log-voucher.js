import { JWT } from "google-auth-library";

const SCOPES = ["https://www.googleapis.com/auth/spreadsheets"]; // needs edit scope to append

async function appendRow({ sheetId, range, values }) {
  const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;

  if (!clientEmail || !privateKey) {
    throw new Error("Missing GOOGLE_SERVICE_ACCOUNT_EMAIL or GOOGLE_SERVICE_ACCOUNT_KEY env");
  }

  const jwt = new JWT({ email: clientEmail, key: privateKey.replace(/\\n/g, "\n"), scopes: SCOPES });
  const { access_token: accessToken } = await jwt.authorize();

  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ values })
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || `Sheets append failed (${response.status})`);
  }

  return response.json();
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const sheetId = process.env.SHEET_ID;
  const range = process.env.SHEET_RANGE || "GIEO QUÊ!A:E";

  if (!sheetId) {
    res.status(500).json({ error: "Missing SHEET_ID env" });
    return;
  }

  const { code, amount, message, name = "", phone = "" } = req.body || {};
  if (!code) {
    res.status(400).json({ error: "Missing code" });
    return;
  }

  const voucherStr = typeof amount === "number" ? amount : amount || "";
  const now = new Date();
  const timestamp = now.toISOString();

  try {
    await appendRow({
      sheetId,
      range,
      values: [[name, phone, code, 1, voucherStr, message || "", timestamp]]
    });
    res.status(200).json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message || "Failed to append sheet" });
  }
}
