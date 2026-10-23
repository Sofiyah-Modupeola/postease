import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY
)

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()

  try {
    if (req.method === 'GET') {
      const { data, error } = await supabase.from('queue').select('*').order('created_at', { ascending: false }).limit(100)
      if (error) throw error
      return res.status(200).json(data || [])
    }

    if (req.method === 'POST') {
      const b = req.body
      const selectedPages = b.selectedPages || b.selectedPageIds || []
      const selectedPageIds = Array.isArray(selectedPages) ? selectedPages.map(p=> typeof p === 'string' ? p : p.id) : []
      const includePersonal = b.includePersonal || false

      const payload = {
        caption: b.caption || '',
        imageurl: b.imageUrl || (b.media && b.media[0]) || null,
        imageUrl: b.imageUrl || (b.media && b.media[0]) || null,
        media: b.media || [],
        scheduledat: b.scheduledAt || new Date().toISOString(),
        scheduledAt: b.scheduledAt || new Date().toISOString(),
        status: b.status || 'queued',
        user_id: b.user_id || 'sofiyah',
        main_prompt: b.mainPrompt || '',
        selected_pages: selectedPages,
        selected_page_ids: selectedPageIds,
        include_personal: includePersonal,
        toggle_linkedin: b.toggle_linkedin ?? true,
        toggle_ig: b.toggle_ig ?? true,
        whatsapp_excluded: true,
        linkedin: b.linkedIn || null,
        fb_page_ids: selectedPageIds
      }

      const { data, error } = await supabase.from('queue').insert([payload]).select()
      if (error) throw error
      return res.status(200).json({ 
        success: true, 
        queued: data[0],
        message: `No WhatsApp mode - queued to ${selectedPageIds.length} page(s) + Personal (just name) + IG + LinkedIn`
      })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
