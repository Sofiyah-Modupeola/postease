export default function handler(req, res) {
  res.json({ status: "PostEase LIVE", message: "Backend works! Use /api/queue, /api/cron, /api/users", time: new Date() });
}
