export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const token = process.env.FB_PAGE_ACCESS_TOKEN || process.env.FB_PAGE_TOKEN || ''
  const tokenPresent = token.length > 20
  const tokenPreview = tokenPresent ? token.slice(0,25)+'...' : 'MISSING'

  try {
    const { createClient } = await import('@supabase/supabase-js')
    const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY
    const supabase = createClient(supabaseUrl, supabaseKey)
    
    const { data: allQueued } = await supabase.from('queue').select('*').eq('status','queued').order('created_at',{ascending:false}).limit(20)
    const now = new Date()
    const due = (allQueued||[]).filter(i=>{
      const t = i.scheduledat || i.scheduledAt || i.scheduled_at
      if(!t) return true
      try{ return new Date(t) <= now }catch{ return true }
    })
    if(due.length===0) return res.status(200).json({tokenPresent,tokenPreview,message:`No posts due - ${allQueued?.length||0} queued`,now:now.toISOString(),allQueuedCount:allQueued?.length||0})

    // Get real page ID from token
    let realPageId = null, realPageName = null
    try{
      const meRes = await fetch(`https://graph.facebook.com/v19.0/me?fields=id,name&access_token=${encodeURIComponent(token)}`)
      const meJson = await meRes.json()
      if(meJson.id){ realPageId = meJson.id; realPageName = meJson.name }
    }catch{}

    let results = []
    for(let item of due){
      const caption = item.caption || item.main_prompt || 'PostEase auto post'
      let imageUrls = item.media_urls || item.image_urls || []
      if(!Array.isArray(imageUrls)) imageUrls = imageUrls ? [imageUrls] : []
      if(item.imageurl && !imageUrls.includes(item.imageurl)) imageUrls.unshift(item.imageurl)
      if(item.imageUrl && !imageUrls.includes(item.imageUrl)) imageUrls.unshift(item.imageUrl)
      imageUrls = imageUrls.filter(Boolean).slice(0,10) // max 10

      const targetId = realPageId || 'me'

      try{
        let fbJson = null

        if(imageUrls.length === 0){
          // TEXT ONLY
          const r = await fetch(`https://graph.facebook.com/v19.0/${targetId}/feed`,{
            method:'POST', headers:{'Content-Type':'application/json'},
            body:JSON.stringify({access_token:token, message:caption})
          })
          fbJson = await r.json()
        }
        else if(imageUrls.length === 1){
          // SINGLE IMAGE - supports http and data: base64
          const url = imageUrls[0]
          if(url.startsWith('data:')){
            // Convert data: URL to Blob via FormData
            const base64Data = url.split(',')[1]
            const mime = url.split(';')[0].split(':')[1] || 'image/jpeg'
            const buffer = Buffer.from(base64Data,'base64')
            const form = new FormData()
            form.append('access_token', token)
            form.append('message', caption)
            form.append('source', new Blob([buffer], {type:mime}), 'image.jpg')
            const r = await fetch(`https://graph.facebook.com/v19.0/${targetId}/photos`,{method:'POST', body:form})
            fbJson = await r.json()
          } else {
            const r = await fetch(`https://graph.facebook.com/v19.0/${targetId}/photos`,{
              method:'POST', headers:{'Content-Type':'application/json'},
              body:JSON.stringify({access_token:token, message:caption, url:url})
            })
            fbJson = await r.json()
          }
        }
        else{
          // MULTIPLE IMAGES 2-10: upload unpublished then post with attached_media
          let mediaIds = []
          for(let imgUrl of imageUrls){
            try{
              let uploadRes
              if(imgUrl.startsWith('data:')){
                const base64Data = imgUrl.split(',')[1]
                const mime = imgUrl.split(';')[0].split(':')[1] || 'image/jpeg'
                const buffer = Buffer.from(base64Data,'base64')
                const form = new FormData()
                form.append('access_token', token)
                form.append('published','false')
                form.append('temporary','true')
                form.append('source', new Blob([buffer],{type:mime}), 'image.jpg')
                uploadRes = await fetch(`https://graph.facebook.com/v19.0/${targetId}/photos`,{method:'POST', body:form})
              } else {
                uploadRes = await fetch(`https://graph.facebook.com/v19.0/${targetId}/photos`,{
                  method:'POST', headers:{'Content-Type':'application/json'},
                  body:JSON.stringify({access_token:token, published:false, temporary:true, url:imgUrl})
                })
              }
              const upJson = await uploadRes.json()
              if(upJson.id) mediaIds.push(upJson.id)
            }catch(e){}
          }
          if(mediaIds.length>0){
            const attached = {}
            mediaIds.forEach((id, idx)=>{ attached[`media[${idx}]`] = JSON.stringify({media_fbid:id}) })
            const form = new URLSearchParams()
            form.append('access_token', token)
            form.append('message', caption)
            Object.entries(attached).forEach(([k,v])=>form.append(k,v))
            // Graph expects attached_media as JSON array via attached_media[0] style, try feed
            const bodyObj = {access_token:token, message:caption}
            mediaIds.forEach((id,idx)=>{ bodyObj[`attached_media[${idx}]`] = JSON.stringify({media_fbid:id}) })
            const r = await fetch(`https://graph.facebook.com/v19.0/${targetId}/feed`,{
              method:'POST', headers:{'Content-Type':'application/json'},
              body:JSON.stringify(bodyObj)
            })
            fbJson = await r.json()
          } else {
            // fallback to single
            const r = await fetch(`https://graph.facebook.com/v19.0/${targetId}/feed`,{
              method:'POST', headers:{'Content-Type':'application/json'},
              body:JSON.stringify({access_token:token, message:caption})
            })
            fbJson = await r.json()
          }
        }

        // If image post failed, try fallback to text-only
        if(fbJson && fbJson.error && imageUrls.length>0){
          try{
            const fallback = await fetch(`https://graph.facebook.com/v19.0/${targetId}/feed`,{
              method:'POST', headers:{'Content-Type':'application/json'},
              body:JSON.stringify({access_token:token, message:caption + "\n\n[Image upload failed - text posted]"})
            })
            const fbFallback = await fallback.json()
            if(fbFallback.id || fbFallback.post_id){
              fbJson = fbFallback
            }
          }catch{}
        }

        results.push({targetId, realPageId, realPageName, imageCount:imageUrls.length, fb:fbJson})
        if(fbJson && (fbJson.id || fbJson.post_id)){
          await supabase.from('queue').update({status:'posted'}).eq('id',item.id)
        } else if(fbJson && fbJson.error){
          // Keep as queued for retry instead of failed, so you can retry
          // await supabase.from('queue').update({status:'failed'}).eq('id',item.id)
          results.push({note:"Will retry next cron - not marking failed to allow retry"})
        }

      }catch(e){
        results.push({targetId, error:e.message})
      }
    }

    return res.status(200).json({tokenPresent,tokenPreview,realPageId,realPageName,message:`Cron ran ${due.length} due`,now:now.toISOString(),dueCount:due.length,results})

  }catch(err){
    return res.status(200).json({tokenPresent,tokenPreview,error:err.message})
  }
                }
            
