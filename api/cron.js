import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

function dataUrlToBlobParts(dataUrl){
  const match = dataUrl.match(/^data:(.*?);base64,(.*)$/)
  if(!match) return null
  const mime = match[1]
  const b64 = match[2]
  const buffer = Buffer.from(b64, 'base64')
  return { mime, buffer }
}

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
    if (!queued?.length) return res.status(200).json({ message: 'No posts due', processed: 0, queued: [], tokenPresent: !!(process.env.FB_PAGE_ACCESS_TOKEN || process.env.FB_PAGE_TOKEN) })

    let processed = 0
    const tokenPresent = !!(process.env.FB_PAGE_ACCESS_TOKEN || process.env.FB_PAGE_TOKEN)
    const tokenPreview = tokenPresent ? (process.env.FB_PAGE_ACCESS_TOKEN || process.env.FB_PAGE_TOKEN).slice(0,20)+'...' : 'MISSING - set FB_PAGE_TOKEN or FB_PAGE_ACCESS_TOKEN in Vercel env and redeploy'

    for (let item of queued) {
      try {
        const pageIds = item.selected_page_ids || item.fb_page_ids || item.selected_pages?.map(p=>p.id) || []
        const caption = item.caption || item.main_prompt || ''
        const imageUrl = item.imageurl || item.imageUrl || ''
        const imageUrls = item.image_urls || item.media_urls || (imageUrl ? [imageUrl] : [])
        const fbToken = process.env.FB_PAGE_ACCESS_TOKEN || process.env.FB_PAGE_TOKEN || null

        let fbResults = []
        if (pageIds.length && fbToken && imageUrls.length) {
          for (let pid of pageIds) {
            if (!pid || String(pid).startsWith('manual_') || String(pid).startsWith('me')) continue
            // Post up to 10 images - Facebook: first image as photo post, or album
            try {
              // If image is data: URL (base64 from PostEase compression) - upload via multipart
              const firstImg = imageUrls[0] || imageUrl
              if (firstImg && firstImg.startsWith('data:')) {
                const parts = dataUrlToBlobParts(firstImg)
                if (parts) {
                  // Build multipart form manually using fetch FormData (Node 18+ supports FormData)
                  const form = new FormData()
                  form.append('caption', caption)
                  form.append('access_token', fbToken)
                  const blob = new Blob([parts.buffer], { type: parts.mime })
                  form.append('source', blob, 'postease.jpg')
                  
                  const fbRes = await fetch(`https://graph.facebook.com/v19.0/${pid}/photos`, {
                    method: 'POST',
                    body: form
                  })
                  const fbJson = await fbRes.json()
                  fbResults.push({ pid, result: fbJson, method: 'base64-upload' })
                  
                  // If multiple images, upload rest as unpublished then create feed with attached_media
                  if (imageUrls.length > 1) {
                    let attachedIds = []
                    if (fbJson.id) attachedIds.push(fbJson.id)
                    for (let i=1; i<Math.min(imageUrls.length, 10); i++) {
                      const img = imageUrls[i]
                      if (!img || !img.startsWith('data:')) continue
                      const p = dataUrlToBlobParts(img)
                      if (!p) continue
                      const f2 = new FormData()
                      f2.append('access_token', fbToken)
                      f2.append('published', 'false')
                      const bl = new Blob([p.buffer], { type: p.mime })
                      f2.append('source', bl, `postease_${i}.jpg`)
                      const r2 = await fetch(`https://graph.facebook.com/v19.0/${pid}/photos`, { method: 'POST', body: f2 })
                      const j2 = await r2.json()
                      if (j2.id) attachedIds.push(j2.id)
                    }
                    if (attachedIds.length > 1) {
                      const feedForm = new FormData()
                      feedForm.append('access_token', fbToken)
                      feedForm.append('message', caption)
                      attachedIds.forEach((id, idx)=>{
                        feedForm.append(`attached_media[${idx}]`, JSON.stringify({ media_fbid: id }))
                      })
                      const feedRes = await fetch(`https://graph.facebook.com/v19.0/${pid}/feed`, { method: 'POST', body: feedForm })
                      const feedJson = await feedRes.json()
                      fbResults.push({ pid, album: feedJson })
                    }
                  }
                }
              } else if (firstImg && firstImg.startsWith('http')) {
                // Remote URL - use url param
                const fbRes = await fetch(`https://graph.facebook.com/v19.0/${pid}/photos?access_token=${fbToken}`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ url: firstImg, caption: caption })
                })
                const fbJson = await fbRes.json()
                fbResults.push({ pid, result: fbJson, method: 'url' })
              } else if (!firstImg) {
                // Text-only post
                const fbRes = await fetch(`https://graph.facebook.com/v19.0/${pid}/feed?access_token=${fbToken}`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ message: caption })
                })
                const fbJson = await fbRes.json()
                fbResults.push({ pid, result: fbJson, method: 'text-only' })
              }
            } catch (e) {
              fbResults.push({ pid, error: e.message })
            }
          }
        }

        // Mark as posted
        await supabase.from('queue').update({ status: 'posted', fb_response: fbResults }).eq('id', item.id)
        processed++
      } catch (innerErr) {
        await supabase.from('queue').update({ status: 'failed', error: innerErr.message }).eq('id', item.id)
      }
    }

    return res.status(200).json({ message: `${processed} processed - tokenPresent: ${tokenPresent} - ${tokenPreview}`, processed, tokenPresent, tokenPreview, queued: queued.length })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
