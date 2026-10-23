import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  if (req.method === 'OPTIONS') return res.status(200).end()

  try {
    const token = process.env.FB_PAGE_ACCESS_TOKEN || process.env.FB_PAGE_TOKEN || null
    const tokenPresent = !!token

    const now = new Date().toISOString()
    const { data: queued, error } = await supabase
      .from('queue')
      .select('*')
      .lte('scheduledat', now)
      .eq('status', 'queued')
      .limit(20)

    if (error) throw error
    if (!queued?.length) {
      return res.status(200).json({ message: 'No posts due', processed: 0, tokenPresent, hint: tokenPresent ? 'Token found as FB_PAGE_TOKEN or FB_PAGE_ACCESS_TOKEN' : 'Missing FB_PAGE_TOKEN - set in Vercel' })
    }

    let processed = 0
    let results = []
    
    for (let item of queued) {
      try {
        const pageIds = item.selected_page_ids || item.fb_page_ids || []
        const caption = item.caption || item.main_prompt || ''
        const imageUrl = item.imageurl || item.imageUrl || ''
        const imageUrls = item.image_urls || item.media_urls || (imageUrl ? [imageUrl] : [])
        const firstImg = imageUrls[0] || imageUrl || ''

        let fbResults = []

        if (pageIds.length && token) {
          for (let pid of pageIds) {
            if (!pid || String(pid).startsWith('manual_')) continue
            try {
              let fbJson = null
              
              // Handle base64 data: URLs - convert to buffer upload
              if (firstImg && firstImg.startsWith('data:')) {
                try {
                  // Convert data URL to blob via fetch (works in Node 18)
                  const base64Data = firstImg.split(',')[1]
                  const mime = firstImg.split(';')[0].split(':')[1]
                  const buffer = Buffer.from(base64Data, 'base64')
                  
                  // Use form-data manually via native FormData
                  const form = new FormData()
                  form.append('caption', caption)
                  form.append('access_token', token)
                  const blob = new Blob([buffer], { type: mime })
                  form.append('source', blob, 'postease.jpg')
                  
                  const fbRes = await fetch(`https://graph.facebook.com/v19.0/${pid}/photos`, {
                    method: 'POST',
                    body: form
                  })
                  fbJson = await fbRes.json()
                } catch (e) {
                  fbResults.push({ pid, method: 'base64', error: e.message })
                  continue
                }
              } else if (firstImg && firstImg.startsWith('http')) {
                const fbRes = await fetch(`https://graph.facebook.com/v19.0/${pid}/photos`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ access_token: token, url: firstImg, caption: caption })
                })
                fbJson = await fbRes.json()
              } else {
                // Text only
                const fbRes = await fetch(`https://graph.facebook.com/v19.0/${pid}/feed`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ access_token: token, message: caption })
                })
                fbJson = await fbRes.json()
              }
              fbResults.push({ pid, result: fbJson })
            } catch (e) {
              fbResults.push({ pid, error: e.message })
            }
          }
        } else {
          fbResults.push({ note: !token ? 'No token - set FB_PAGE_TOKEN in Vercel' : 'No pageIds' })
        }

        results.push({ id: item.id, fbResults })
        await supabase.from('queue').update({ status: 'posted' }).eq('id', item.id)
        processed++
      } catch (innerErr) {
        await supabase.from('queue').update({ status: 'failed' }).eq('id', item.id)
        results.push({ id: item.id, error: innerErr.message })
      }
    }

    return res.status(200).json({ message: `${processed} processed`, processed, tokenPresent, results })
  } catch (err) {
    return res.status(500).json({ error: err.message, stack: err.stack })
  }
                  }
