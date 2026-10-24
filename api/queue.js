
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY
)

const DAY_MAP = { Sun:0, Mon:1, Tue:2, Wed:3, Thu:4, Fri:5, Sat:6 }

function generateScheduledDates(startDate, numDays, selectedDays, postTime) {
  // startDate: Date object, numDays: int, selectedDays: array like ['Mon','Fri'], postTime: "19:00"
  const result = []
  const [hh, mm] = (postTime || '19:00').split(':').map(Number)
  let cur = new Date(startDate)
  cur.setHours(hh||19, mm||0, 0, 0)
  
  // If no selectedDays or empty, treat as daily
  const wanted = selectedDays && selectedDays.length ? selectedDays.map(d=>DAY_MAP[d]).filter(v=>v!==undefined) : [0,1,2,3,4,5,6]
  
  // Generate up to numDays occurrences that match wanted days
  // Safety cap: look ahead max 2 years (730 days) to avoid infinite loop
  let checked = 0
  while (result.length < numDays && checked < 800) {
    const dow = cur.getDay()
    if (wanted.includes(dow)) {
      // Only include if time is in future relative to now (if first day is today but time already passed, skip to next matching day)
      result.push(new Date(cur))
    }
    cur.setDate(cur.getDate()+1)
    checked++
  }
  return result
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()

  try {
    if (req.method === 'GET') {
      const { data, error } = await supabase.from('queue').select('*').order('created_at', { ascending: false }).limit(200)
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
      
      const numDays = Math.min(Math.max(parseInt(b.numDays)||1, 1), 365) // clamp 1-365
      const selectedDays = b.selectedDays || []
      const postTime = b.postTime || '19:00'
      const startDate = b.scheduledAt ? new Date(b.scheduledAt) : new Date()
      
      const dates = generateScheduledDates(startDate, numDays, selectedDays, postTime)
      
      const payloads = dates.map((d, idx) => ({
        caption: b.caption || '',
        imageurl: (imageUrls[0] || ''),
        imageUrl: (imageUrls[0] || ''),
        image_urls: imageUrls,
        media_urls: mediaUrls,
        media_count: mediaUrls.length,
        num_images: mediaUrls.length,
        scheduledat: d.toISOString(),
        scheduledAt: d.toISOString(),
        status: 'queued',
        user_id: b.user_id || 'sofiyah',
        main_prompt: b.mainPrompt || '',
        num_days: numDays,
        selected_days: selectedDays,
        post_time: postTime,
        selected_pages: selectedPages,
        selected_page_ids: selectedPageIds,
        fb_page_ids: selectedPageIds,
        include_personal: b.includePersonal || false,
        batch_index: idx+1,
        batch_total: dates.length
      }))

      const { data, error } = await supabase.from('queue').insert(payloads).select()
      if (error) throw error
      return res.status(200).json({ success: true, queued: data, count: data.length, dates: dates.map(d=>d.toISOString()), message: `✅ Queued ${data.length} posts for ${numDays} days (${selectedDays.join(',')||'Daily'} at ${postTime}) - ${imageUrls.length} images each` })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
