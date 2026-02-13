import { JWT } from "google-auth-library";

const SCOPES = ["https://www.googleapis.com/auth/spreadsheets"]; // read needed
const startRow = Number(process.env.SHEET_START_ROW || 2);

function parseRange(range) {
  if (!range || !range.includes("!")) return { sheetName: range || "Sheet1" };
  const [sheetName] = range.split("!");
  return { sheetName };
}

async function getRows({ sheetId, sheetName }) {
  const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;

  if (!clientEmail || !privateKey) {
    throw new Error("Missing GOOGLE_SERVICE_ACCOUNT_EMAIL or GOOGLE_SERVICE_ACCOUNT_KEY env");
  }

  const jwt = new JWT({ email: clientEmail, key: privateKey.replace(/\\n/g, "\n"), scopes: SCOPES });
  const { access_token: accessToken } = await jwt.authorize();

  const readRange = `${sheetName}!A${startRow}:E`;
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(readRange)}`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || `Sheets read failed (${response.status})`);
  }

  const data = await response.json();
  return data.values || [];
}

function findRowByCode(rows, code) {
  if (!code) return null;
  for (let idx = 0; idx < rows.length; idx++) {
    const row = rows[idx] || [];
    if ((row[2] || "").trim().toUpperCase() === code.toUpperCase()) {
      return { rowIndex: idx, row };
    }
  }
  return null;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const sheetId = process.env.SHEET_ID;
  const range = process.env.SHEET_RANGE || "GIEO QUÊ!A:E";
  const { sheetName } = parseRange(range);

  const { code } = req.body || {};
  if (!code || typeof code !== "string") {
    res.status(400).json({ error: "Invalid code" });
    return;
  }

  if (!sheetId) {
    res.status(500).json({ error: "Missing SHEET_ID env" });
    return;
  }

  try {
    const rows = await getRows({ sheetId, sheetName });
    const hit = findRowByCode(rows, code);
    if (!hit) {
      res.status(400).json({ error: "Mã không hợp lệ" });
      return;
    }
    const spins = Number(hit.row[3] || 0);
    if (spins <= 0) {
      res.status(400).json({ error: "Mã đã hết lượt" });
      return;
    }
    res.status(200).json({ ok: true, code });
  } catch (err) {
    res.status(500).json({ error: err.message || "Sheets read error" });
  }
}
