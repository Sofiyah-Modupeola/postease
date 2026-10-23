
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
    
    // Fetch all queued without date filter - then filter in JS to avoid column name case issues
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
    // Filter: scheduledat OR scheduledAt <= now
    const due = (allQueued || []).filter(item => {
      const t = item.scheduledat || item.scheduledAt || item.scheduled_at || null
      if (!t) return true // if no time, consider due
      try {
        return new Date(t) <= now
      } catch { return true }
    })

    if (due.length === 0) {
      return res.status(200).json({ 
        tokenPresent, tokenPreview, 
        message: `No posts due - endpoint WORKS - found ${allQueued?.length || 0} queued total, but none past time`, 
        now: now.toISOString(), 
        allQueuedCount: allQueued?.length || 0,
        sampleTimes: (allQueued || []).slice(0,3).map(q=>({ id: q.id, scheduledat: q.scheduledat, scheduledAt: q.scheduledAt }))
      })
    }

    let results = []
    for (let item of due) {
      const pageIds = item.selected_page_ids || item.fb_page_ids || item.selected_pages?.map(p=>p.id) || ['104675814724498']
      const caption = item.caption || item.main_prompt || 'Test from PostEase - Die Empty'
      
      for (let pid of pageIds) {
        if (!pid || String(pid).startsWith('manual_') || String(pid).startsWith('me_')) continue
        if (!tokenPresent) {
          results.push({ pid, error: 'No FB token set' })
          continue
        }
        try {
          // Text-only post for now to prove token works (image upload next step after this works)
          const fbRes = await fetch(`https://graph.facebook.com/v19.0/${pid}/feed`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ access_token: token, message: caption })
          })
          const fbJson = await fbRes.json()
          results.push({ pid, fb: fbJson })
          if (fbJson.id) {
            await supabase.from('queue').update({ status: 'posted' }).eq('id', item.id)
          } else {
            // Save error for debug
            await supabase.from('queue').update({ status: 'failed' }).eq('id', item.id)
          }
        } catch (e) {
          results.push({ pid, error: e.message })
        }
      }
    }

    return res.status(200).json({ tokenPresent, tokenPreview, message: `Cron ran - found ${due.length} due`, now: now.toISOString(), dueCount: due.length, results })

  } catch (err) {
    return res.status(200).json({ tokenPresent, tokenPreview, error: err.message, note: 'Endpoint alive' })
  }
}
