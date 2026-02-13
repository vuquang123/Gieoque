export default function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const code = Math.random().toString(36).substring(2, 8).toUpperCase();
  res.status(200).json({ code });
}
