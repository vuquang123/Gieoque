import { JWT } from "google-auth-library";

const SCOPES = ["https://www.googleapis.com/auth/spreadsheets"]; // needs edit scope to append

const startRow = Number(process.env.SHEET_START_ROW || 2);

function parseRange(range) {
  if (!range || !range.includes("!")) return { sheetName: range || "Sheet1" };
  const [sheetName] = range.split("!");
  return { sheetName };
}

function formatPhoneForSheet(raw) {
  const cleaned = (raw || "").trim();
  if (!cleaned) return "";
  return `'${cleaned}`; // force plain text so leading zeros stay
}

function toDigits(raw) {
  return (raw || "").replace(/\D/g, "");
}

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

function findRowByPhone(rows, phone) {
  if (!phone) return null;
  for (let idx = 0; idx < rows.length; idx++) {
    const row = rows[idx] || [];
    if ((row[1] || "").trim() === phone) {
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
  const { name = "", phone = "" } = req.body || {};
  const { sheetName } = parseRange(range);

  const code = Math.random().toString(36).substring(2, 8).toUpperCase();
  const phoneDigits = toDigits(phone);
  if (!phoneDigits) {
    res.status(400).json({ error: "Missing phone" });
    return;
  }
  if (phoneDigits.length !== 10) {
    res.status(400).json({ error: "Số điện thoại phải đủ 10 số" });
    return;
  }

  const sheetPhone = formatPhoneForSheet(phoneDigits);

  if (sheetId) {
    try {
      const rows = await getRows({ sheetId, sheetName });
      const hit = findRowByPhone(rows, phoneDigits);
      if (hit) {
        const spins = Number(hit.row[3] || 0);
        const existingCode = hit.row[2] || "";
        if (spins > 0) {
          res.status(200).json({ code: existingCode, reused: true });
          return;
        }
        res.status(400).json({ error: "Số điện thoại này đã hết lượt" });
        return;
      }

      await appendRow({
        sheetId,
        range,
        values: [[name, sheetPhone, code, 1, ""]]
      });
    } catch (err) {
      console.warn("Append/register failed:", err.message);
    }
  }

  res.status(200).json({ code });
}
