import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY
)

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()

  try {
    if (req.method === 'GET') {
      const { data, error } = await supabase.from('queue').select('*').order('created_at', { ascending: false }).limit(100)
      if (error) throw error
      return res.status(200).json(data || [])
    }

    if (req.method === 'DELETE') {
      const id = req.query.id
      if (!id) return res.status(400).json({ error: 'id required' })
      const { error } = await supabase.from('queue').delete().eq('id', id)
      if (error) throw error
      return res.status(200).json({ success: true })
    }

    if (req.method === 'PATCH') {
      const id = req.query.id
      const b = req.body
      if (!id) return res.status(400).json({ error: 'id required' })
      const { data, error } = await supabase.from('queue').update({ status: b.status || 'halted' }).eq('id', id).select()
      if (error) throw error
      return res.status(200).json({ success: true, data: data[0] })
    }

    if (req.method === 'POST') {
      const b = req.body
      // ONLY use columns that exist in your current queue table - safe minimal payload
      const payload = {
        caption: b.caption || '',
        imageurl: b.imageUrl || '',
        scheduledat: b.scheduledAt || new Date().toISOString(),
        status: 'queued',
        user_id: b.user_id || 'sofiyah'
      }
      // Try minimal insert first
      let { data, error } = await supabase.from('queue').insert([payload]).select()
      if (error) {
        // Fallback: try alternative column names if your table uses camelCase
        const altPayload = {
          caption: b.caption || '',
          imageUrl: b.imageUrl || '',
          scheduledAt: b.scheduledAt || new Date().toISOString(),
          status: 'queued',
          user_id: b.user_id || 'sofiyah'
        }
        const retry = await supabase.from('queue').insert([altPayload]).select()
        if (retry.error) throw retry.error
        data = retry.data
      }
      return res.status(200).json({ success: true, queued: data[0], message: `Queued - ${b.numDays||7} days ${b.selectedDays?.join(',')||''} - Halt anytime` })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
  }
