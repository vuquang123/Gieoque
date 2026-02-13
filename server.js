const express = require("express");
const path = require("path");
const { JWT } = require("google-auth-library");

const app = express();
const PORT = process.env.PORT || 3000;

const SCOPES = ["https://www.googleapis.com/auth/spreadsheets"];

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

app.post("/api/register", (_req, res) => {
  const code = Math.random().toString(36).substring(2, 8).toUpperCase();
  res.json({ code });
});

app.post("/api/redeem", (req, res) => {
  const { code } = req.body || {};
  if (!code) {
    res.status(400).json({ error: "Invalid code" });
    return;
  }
  res.json({ ok: true, code });
});

app.post("/api/log-voucher", async (req, res) => {
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
  const now = new Date().toISOString();
  try {
    await appendRow({
      sheetId,
      range,
      values: [[name, phone, code, 1, voucherStr, message || "", now]]
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message || "Failed to append sheet" });
  }
});

// Optional health route
app.get("/api/health", (_req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`Dev server running at http://localhost:${PORT}`);
});
