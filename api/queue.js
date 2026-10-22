import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY
)

export default async function handler(req, res) {
  // CORS - Allow your frontend + any origin to connect
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()

  try {
    if (req.method === 'GET') {
      const { data, error } = await supabase.from('queue').select('*').order('created_at', { ascending: false }).limit(50)
      if (error) throw error
      return res.status(200).json(data || [])
    }

    if (req.method === 'POST') {
      const body = req.body
      // Build payload that supports ALL your goals: FB, IG, LinkedIn, WA Status
      const payload = {
        caption: body.caption || '',
        imageurl: body.imageUrl || (body.media && body.media[0]) || null,
        imageUrl: body.imageUrl || (body.media && body.media[0]) || null,
        media: body.media || [],
        scheduledat: body.scheduledAt || body.scheduledat || new Date().toISOString(),
        scheduledAt: body.scheduledAt || body.scheduledat || new Date().toISOString(),
        status: body.status || 'queued',
        user_id: body.user_id || body.userId || 'sofiyah-pure-merch',
        // New fields for your full goals
        business_name: body.businessName || body.bizName || '',
        handle: body.handle || '',
        about: body.about || body.aboutBiz || '',
        type: body.type || 'Product Sales',
        days: body.days || '',
        time: body.time || body.postTime || '18:00',
        platforms: body.platforms || 'All (FB+IG+LinkedIn+WA Status)',
        // LinkedIn + WA specific
        linkedin_status: body.platforms && body.platforms.toLowerCase().includes('linkedin') ? 'queued' : 'skipped',
        whatsapp_status: body.platforms && (body.platforms.toLowerCase().includes('whatsapp') || body.platforms.toLowerCase().includes('wa') || body.platforms.toLowerCase().includes('all')) ? 'ready_to_share' : 'skipped'
      }

      const { data, error } = await supabase.from('queue').insert([payload]).select()
      if (error) throw error
      return res.status(200).json({ success: true, queued: data[0], message: 'Queued to FB + IG + LinkedIn + WA Status' })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
