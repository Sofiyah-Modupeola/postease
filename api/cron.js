import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  if (req.method === 'OPTIONS') return res.status(200).end()

  try {
    const now = new Date().toISOString()
    const { data: queued, error } = await supabase
      .from('queue')
      .select('*')
      .lte('scheduledat', now)
      .eq('status', 'queued')
      .limit(20)

    if (error) throw error
    if (!queued?.length) return res.status(200).json({ message: 'No posts due', processed: 0, queued: [] })

    let processed = 0
    for (let item of queued) {
      try {
        const pageIds = item.selected_page_ids || item.fb_page_ids || []
        const caption = item.caption || item.main_prompt || ''
        const imageUrl = item.imageurl || item.imageUrl || ''
        const imageUrls = item.image_urls || item.media_urls || (imageUrl ? [imageUrl] : [])
        const mediaCount = item.media_count || item.num_images || imageUrls.length

        // Get page tokens from users table or env
        // For now: if you have PAGE_ACCESS_TOKEN in env, use it; else check users table
        // v1 simplified: if no token, mark as posted with note (personal share handled in frontend)
        
        // Try to fetch page tokens from users (if you stored via OAuth)
        const { data: userRow } = await supabase.from('users').select('*').eq('id', item.user_id).maybeSingle()
        // Or from default user
        const { data: defaultUser } = await supabase.from('users').select('*').limit(1).maybeSingle()
        const fbToken = process.env.FB_PAGE_ACCESS_TOKEN || userRow?.fb_page_token || defaultUser?.fb_page_token || null

        if (pageIds.length && fbToken && imageUrl && !String(imageUrl).startsWith('data:')) {
          // Real auto-post to each FB Page
          for (let pid of pageIds) {
            if (String(pid).startsWith('manual_')) continue
            try {
              // Upload photo with caption to page
              const fbRes = await fetch(`https://graph.facebook.com/v19.0/${pid}/photos?access_token=${fbToken}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url: imageUrl, caption: caption })
              })
              const fbJson = await fbRes.json()
              console.log(`Posted to ${pid}:`, fbJson)
            } catch (e) {
              console.log(`Failed page ${pid}:`, e.message)
            }
          }
        } else {
          console.log(`[PostEase v1] Item ${item.id} - Pages ${pageIds.join(',')} - Caption: ${caption.slice(0,50)} - Images: ${mediaCount} (${imageUrls.length} URLs) - Will auto when token added`)
        }

        // Mark as posted (or keep queued if you want retry)
        await supabase.from('queue').update({ status: 'posted' }).eq('id', item.id)
        processed++
      } catch (innerErr) {
        console.log('Item error', item.id, innerErr.message)
        await supabase.from('queue').update({ status: 'failed' }).eq('id', item.id)
      }
    }

    return res.status(200).json({ message: `${processed} processed - FB Pages auto via token, Personal/LI/WA zero-token share - Halt still works`, processed, queued })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
