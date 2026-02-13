export default function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const { code } = req.body || {};
  if (!code || typeof code !== "string") {
    res.status(400).json({ error: "Invalid code" });
    return;
  }

  res.status(200).json({ ok: true, code });
}
