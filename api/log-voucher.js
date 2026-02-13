import { JWT } from "google-auth-library";

const SCOPES = ["https://www.googleapis.com/auth/spreadsheets"]; // needs edit scope to append

const startRow = Number(process.env.SHEET_START_ROW || 2);

function parseRange(range) {
  if (!range || !range.includes("!")) return { sheetName: range || "Sheet1" };
  const [sheetName] = range.split("!");
  return { sheetName };
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

async function updateRow({ sheetId, sheetName, rowNumber, values }) {
  const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;

  if (!clientEmail || !privateKey) {
    throw new Error("Missing GOOGLE_SERVICE_ACCOUNT_EMAIL or GOOGLE_SERVICE_ACCOUNT_KEY env");
  }

  const jwt = new JWT({ email: clientEmail, key: privateKey.replace(/\\n/g, "\n"), scopes: SCOPES });
  const { access_token: accessToken } = await jwt.authorize();

  const range = `${sheetName}!D${rowNumber}:E${rowNumber}`;
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`;

  const response = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ values })
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || `Sheets update failed (${response.status})`);
  }

  return response.json();
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

  if (!sheetId) {
    res.status(500).json({ error: "Missing SHEET_ID env" });
    return;
  }

  const { code, amount, name = "", phone = "" } = req.body || {};
  if (!code) {
    res.status(400).json({ error: "Missing code" });
    return;
  }

  const voucherStr = typeof amount === "number" ? amount : amount || "";
  try {
    const rows = await getRows({ sheetId, sheetName });
    const hit = findRowByCode(rows, code);
    if (!hit) {
      res.status(400).json({ error: "Mã không hợp lệ" });
      return;
    }
    const rowNumber = startRow + hit.rowIndex;
    const spins = Number(hit.row[3] || 0);
    if (spins <= 0) {
      res.status(400).json({ error: "Mã đã hết lượt" });
      return;
    }

    await updateRow({
      sheetId,
      sheetName,
      rowNumber,
      values: [[0, voucherStr]]
    });

    res.status(200).json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message || "Failed to append sheet" });
  }
}
