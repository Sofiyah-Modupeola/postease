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
      const selectedPages = b.selectedPages || []
      const selectedPageIds = selectedPages.map(p=> p.id || p).filter(Boolean)
      const mediaUrls = b.mediaUrls || b.imageUrls || (b.imageUrl ? [b.imageUrl] : [])
      const imageUrls = b.imageUrls || b.mediaUrls || mediaUrls
      
      const payload = {
        caption: b.caption || '',
        imageurl: (imageUrls[0] || ''),
        imageUrl: (imageUrls[0] || ''),
        image_urls: imageUrls,
        media_urls: mediaUrls,
        media_count: mediaUrls.length,
        num_images: mediaUrls.length,
        scheduledat: b.scheduledAt || new Date().toISOString(),
        scheduledAt: b.scheduledAt || new Date().toISOString(),
        status: 'queued',
        user_id: b.user_id || 'sofiyah',
        main_prompt: b.mainPrompt || '',
        num_days: b.numDays || 7,
        selected_days: b.selectedDays || ['Mon','Fri'],
        post_time: b.postTime || '19:00',
        selected_pages: selectedPages,
        selected_page_ids: selectedPageIds,
        fb_page_ids: selectedPageIds,
        include_personal: b.includePersonal || false
      }
      const { data, error } = await supabase.from('queue').insert([payload]).select()
      if (error) throw error
      return res.status(200).json({ success: true, queued: data[0], message: `Queued ${payload.num_days}d ${payload.selected_days.join(',')} - ${payload.num_images} images - Pages ${selectedPageIds.length}` })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
        }
