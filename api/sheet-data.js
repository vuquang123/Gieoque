export default async function handler(req, res) {
  const { range = "Trang1!A2:C50" } = req.query;
  const sheetId = process.env.SHEET_ID;
  const apiKey = process.env.GOOGLE_SHEETS_API_KEY || process.env.GOOGLE_API_KEY;

  if (!sheetId || !apiKey) {
    res.status(500).json({ error: "Missing SHEET_ID or GOOGLE_SHEETS_API_KEY env" });
    return;
  }

  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(range)}?key=${apiKey}`;

  try {
    const response = await fetch(url);
    const data = await response.json();
    if (!response.ok) {
      res.status(response.status).json({ error: data.error?.message || "Sheets API error" });
      return;
    }
    res.status(200).json({ values: data.values || [] });
  } catch (err) {
    res.status(500).json({ error: err.message || "Unexpected error" });
  }
}
