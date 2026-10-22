res.setHeader('Access-Control-Allow-Origin', '*');
res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

if (req.method === 'OPTIONS') return res.status(200).end();
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const { default: supabase } = await import('../lib/supabase.js');
    if (!supabase) {
      return res.json({ error: "Supabase env missing", env_url: !!process.env.SUPABASE_URL, env_key: !!process.env.SUPABASE_SERVICE_KEY });
    }
    
    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      const { data, error } = await supabase.from('queue').insert({
        caption: body.caption,
        imageUrl: body.imageUrl,
        scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : new Date(),
        user_id: body.userId || '104675814724498',
        status: 'queued'
      }).select();
      if (error) return res.status(500).json({ error: error.message });
      return res.json({ success: true, data });
    }

    const { data, error } = await supabase.from('queue').select('*').order('scheduledAt', { ascending: false }).limit(20);
    if (error) return res.status(500).json({ error: error.message, fix: "Did you run the SQL tables?" });
    return res.json(data || []);

  } catch (e) {
    return res.status(500).json({ error: e.message, stack: e.stack?.slice(0,500) });
  }
}
