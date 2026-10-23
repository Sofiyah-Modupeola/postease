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
    
    if (!supabaseUrl || !supabaseKey) {
      return res.status(200).json({ tokenPresent, tokenPreview, message: 'Supabase env missing' })
    }

    const supabase = createClient(supabaseUrl, supabaseKey)
    
    const { data: allQueued, error } = await supabase
      .from('queue')
      .select('*')
      .eq('status', 'queued')
      .order('created_at', { ascending: false })
      .limit(20)

    if (error) {
      return res.status(200).json({ tokenPresent, tokenPreview, error: error.message })
    }

    const now = new Date()
    const due = (allQueued || []).filter(item => {
      const t = item.scheduledat || item.scheduledAt || item.scheduled_at || null
      if (!t) return true
      try { return new Date(t) <= now } catch { return true }
    })

    if (due.length === 0) {
      return res.status(200).json({ 
        tokenPresent, tokenPreview, 
        message: `No posts due - found ${allQueued?.length || 0} queued total`, 
        now: now.toISOString(), 
        allQueuedCount: allQueued?.length || 0
      })
    }

    // STEP 1: Find which page this token belongs to
    let realPageId = null
    let realPageName = null
    try {
      const meRes = await fetch(`https://graph.facebook.com/v19.0/me?fields=id,name&access_token=${encodeURIComponent(token)}`)
      const meJson = await meRes.json()
      if (meJson.id) {
        realPageId = meJson.id
        realPageName = meJson.name
      }
    } catch(e){}

    let results = []
    for (let item of due) {
      const caption = item.caption || item.main_prompt || 'Die Empty - PostEase test'
      
      if (!tokenPresent) {
        results.push({ error: 'No FB token set' })
        continue
      }

      // Try 3 ways: realPageId, me/feed, and stored IDs
      const targets = []
      if (realPageId) targets.push(realPageId)
      targets.push('me')
      const storedIds = item.selected_page_ids || item.fb_page_ids || []
      for (let sid of storedIds) {
        if (sid && !String(sid).startsWith('manual_') && !String(sid).startsWith('me_') && !targets.includes(sid)) {
          targets.push(sid)
        }
      }
      if (targets.length === 0) targets.push('me')

      let posted = false
      for (let targetId of targets.slice(0,1)) { // Only post once per item to avoid duplicates - use token's own page
        try {
          const fbRes = await fetch(`https://graph.facebook.com/v19.0/${targetId}/feed`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ access_token: token, message: caption })
          })
          const fbJson = await fbRes.json()
          results.push({ targetId, realPageId, realPageName, fb: fbJson })
          if (fbJson.id) {
            await supabase.from('queue').update({ status: 'posted' }).eq('id', item.id)
            posted = true
            break
          } else {
            // don't mark failed yet, try next target if any
            if (targetId === targets[0]) continue
          }
        } catch (e) {
          results.push({ targetId, error: e.message })
        }
      }
      if (!posted && results[results.length-1]?.fb?.error) {
        await supabase.from('queue').update({ status: 'failed' }).eq('id', item.id)
      }
    }

    return res.status(200).json({ tokenPresent, tokenPreview, message: `Cron ran - found ${due.length} due`, realPageId, realPageName, now: now.toISOString(), dueCount: due.length, results })

  } catch (err) {
    return res.status(200).json({ tokenPresent, tokenPreview, error: err.message, note: 'Endpoint alive' })
  }
}
