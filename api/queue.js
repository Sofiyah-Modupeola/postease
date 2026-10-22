import supabase from '../lib/supabase.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'POST') {
    const { caption, imageUrl, scheduledAt, userId, productName, price } = req.body;
    
    const { data, error } = await supabase.from('queue').insert({
      caption,
      imageUrl,
      scheduledAt: scheduledAt ? new Date(scheduledAt) : new Date(),
      user_id: userId || '104675814724498',
      productName,
      price,
      status: 'queued'
    }).select();
    
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ success: true, data: data[0] });
  }

  if (req.method === 'GET') {
    const { data } = await supabase.from('queue').select('*').order('scheduledAt', { ascending: false }).limit(20);
    return res.json(data);
  }
}
