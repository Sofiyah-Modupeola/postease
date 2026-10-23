
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const token = process.env.FB_PAGE_ACCESS_TOKEN || process.env.FB_PAGE_TOKEN || ''
  const tokenPresent = token.length > 20
  const tokenPreview = tokenPresent ? token.slice(0,25)+'...' : 'MISSING'

  // Step 1: always return token check even if supabase fails - so we KNOW endpoint works
  try {
    const { createClient } = await import('@supabase/supabase-js')
    const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY
    
    if (!supabaseUrl || !supabaseKey) {
      return res.status(200).json({ tokenPresent, tokenPreview, message: 'Supabase env missing', supabaseUrl: !!supabaseUrl, supabaseKey: !!supabaseKey })
    }

    const supabase = createClient(supabaseUrl, supabaseKey)
    const now = new Date().toISOString()
    
    const { data: queued, error } = await supabase
      .from('queue')
      .select('*')
      .lte('scheduledat', now)
      .eq('status', 'queued')
      .limit(5)

    if (error) {
      return res.status(200).json({ tokenPresent, tokenPreview, message: 'Supabase query error', error: error.message })
    }

    if (!queued || queued.length === 0) {
      return res.status(200).json({ tokenPresent, tokenPreview, message: 'No posts due - endpoint WORKS', now, processed: 0 })
    }

    let results = []
    for (let item of queued) {
      const pageIds = item.selected_page_ids || item.fb_page_ids || []
      const caption = item.caption || item.main_prompt || item.text || 'Test from PostEase'
      
      for (let pid of pageIds) {
        if (!pid || String(pid).startsWith('manual_')) continue
        try {
          if (!tokenPresent) {
            results.push({ pid, error: 'No FB token' })
            continue
          }
          // Simplest post - text only first to prove token works
          const fbRes = await fetch(`https://graph.facebook.com/v19.0/${pid}/feed`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ access_token: token, message: caption })
          })
          const fbJson = await fbRes.json()
          results.push({ pid, fb: fbJson })
          if (fbJson.id) {
            await supabase.from('queue').update({ status: 'posted' }).eq('id', item.id)
          }
        } catch (e) {
          results.push({ pid, error: e.message })
        }
      }
    }

    return res.status(200).json({ tokenPresent, tokenPreview, message: 'Cron ran', processed: queued.length, results })

  } catch (err) {
    // NEVER 500 - always return 200 with error message
    return res.status(200).json({ tokenPresent, tokenPreview, error: err.message, stack: err.stack?.slice(0,500), note: 'Endpoint alive but error inside' })
  }
}
