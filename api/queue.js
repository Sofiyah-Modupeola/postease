import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY
)

export default async function handler(req, res) {
  // --- CORS FIX - ALLOWS YOUR PHONE TO CONNECT ---
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()
  // --- END CORS FIX ---

  try {
    if (req.method === 'GET') {
      const { data, error } = await supabase.from('queue').select('*').order('created_at', { ascending: false }).limit(50)
      if (error) throw error
      return res.status(200).json(data || [])
    }

    if (req.method === 'POST') {
      const { caption, imageUrl, scheduledAt, user_id, status } = req.body
      
      // Support both camelCase and snake_case
      const payload = {
        caption: caption || '',
        imageUrl: imageUrl || null,
        scheduledAt: scheduledAt || new Date().toISOString(),
        imageurl: imageUrl || null,
        scheduledat: scheduledAt || new Date().toISOString(),
        user_id: user_id || 'sofiyah',
        status: status || 'queued'
      }

      const { data, error } = await supabase.from('queue').insert([payload]).select()
      if (error) throw error
      return res.status(200).json({ success: true, data: data[0] })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
