function formatPhoneForSheet(raw) {
  const cleaned = (raw || "").trim();
  if (!cleaned) return "";
  // Prepend apostrophe so Sheets keeps leading zeros
  return `'${cleaned}`;
}

function toDigits(raw) {
  return (raw || "").replace(/\D/g, "");
}
const express = require("express");
const path = require("path");
const { JWT } = require("google-auth-library");

require("dotenv").config({ path: path.join(__dirname, ".env.local") });

const app = express();
const PORT = process.env.PORT || 3000;

const SCOPES = ["https://www.googleapis.com/auth/spreadsheets"];
const phoneStore = new Map(); // fallback cache: phone -> { code, used }
const codeStore = new Map();  // fallback cache: code -> { phone, used }
const startRow = Number(process.env.SHEET_START_ROW || 2);

function parseRange(range) {
  if (!range || !range.includes("!")) return { sheetName: range || "Sheet1" };
  const [sheetName] = range.split("!");
  return { sheetName };
}

app.use(express.json());
app.use(express.static(path.join(__dirname)));

function makeJwt() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!email || !key) throw new Error("Missing GOOGLE_SERVICE_ACCOUNT_EMAIL or GOOGLE_SERVICE_ACCOUNT_KEY");
  return new JWT({ email, key: key.replace(/\\n/g, "\n"), scopes: SCOPES });
}

async function appendRow({ sheetId, range, values }) {
  const jwt = makeJwt();
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
  const jwt = makeJwt();
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
  const jwt = makeJwt();
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

app.post("/api/register", async (req, res) => {
  const { name = "", phone = "" } = req.body || {};
  const sheetId = process.env.SHEET_ID;
  const range = process.env.SHEET_RANGE || "GIEO QUÊ!A:E";
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
        const existingCode = hit.row[2] || code;
        if (spins > 0) {
          phoneStore.set(phoneDigits, { code: existingCode, used: false });
          codeStore.set(existingCode, { phone: phoneDigits, used: false });
          res.json({ code: existingCode, reused: true });
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
      console.warn("Register sheet failure:", err.message);
    }
  }

  phoneStore.set(phoneDigits, { code, used: false });
  codeStore.set(code, { phone: phoneDigits, used: false });

  res.json({ code, reused: false });
});

app.post("/api/redeem", async (req, res) => {
  const { code = "" } = req.body || {};
  const normalizedCode = code.toString().trim().toUpperCase();
  if (!normalizedCode) {
    res.status(400).json({ error: "Invalid code" });
    return;
  }

  const sheetId = process.env.SHEET_ID;
  const range = process.env.SHEET_RANGE || "GIEO QUÊ!A:E";
  const { sheetName } = parseRange(range);

  if (sheetId) {
    try {
      const rows = await getRows({ sheetId, sheetName });
      const hit = findRowByCode(rows, normalizedCode);
      if (!hit) {
        res.status(400).json({ error: "Mã không hợp lệ" });
        return;
      }
      const spins = Number(hit.row[3] || 0);
      if (spins <= 0) {
        res.status(400).json({ error: "Mã đã hết lượt" });
        return;
      }

      codeStore.set(normalizedCode, { phone: hit.row[1] || "", used: false });
      if (hit.row[1]) phoneStore.set(hit.row[1], { code: normalizedCode, used: false });
      res.json({ ok: true, code: normalizedCode });
      return;
    } catch (err) {
      console.warn("Redeem sheet failure:", err.message);
    }
  }

  const cache = codeStore.get(normalizedCode);
  if (!cache) {
    res.status(400).json({ error: "Mã không hợp lệ" });
    return;
  }
  if (cache.used) {
    res.status(400).json({ error: "Mã đã hết lượt" });
    return;
  }

  res.json({ ok: true, code: normalizedCode });
});

app.post("/api/log-voucher", async (req, res) => {
  const sheetId = process.env.SHEET_ID;
  const range = process.env.SHEET_RANGE || "GIEO QUÊ!A:E";
  const { sheetName } = parseRange(range);

  if (!sheetId) {
    res.status(500).json({ error: "Missing SHEET_ID env" });
    return;
  }

  const { code, amount, name = "", phone = "" } = req.body || {};
  const normalizedCode = (code || "").toString().trim().toUpperCase();
  if (!normalizedCode) {
    res.status(400).json({ error: "Missing code" });
    return;
  }

  const voucherStr = typeof amount === "number" ? amount : amount || "";

  try {
    const rows = await getRows({ sheetId, sheetName });
    const hit = findRowByCode(rows, normalizedCode);
    if (!hit) {
      res.status(400).json({ error: "Mã không hợp lệ" });
      return;
    }
    const spins = Number(hit.row[3] || 0);
    if (spins <= 0) {
      res.status(400).json({ error: "Mã đã hết lượt" });
      return;
    }

    const rowNumber = startRow + hit.rowIndex;
    await updateRow({
      sheetId,
      sheetName,
      rowNumber,
      values: [[0, voucherStr]]
    });
  } catch (err) {
    res.status(500).json({ error: err.message || "Failed to append sheet" });
    return;
  }

  const cachePhone = (phone || codeStore.get(normalizedCode)?.phone || "").trim();
  codeStore.set(normalizedCode, { phone: cachePhone, used: true });
  if (cachePhone) phoneStore.set(cachePhone, { code: normalizedCode, used: true });

  res.json({ ok: true });
});

app.get("/api/health", (_req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`Dev server running at http://localhost:${PORT}`);
});
