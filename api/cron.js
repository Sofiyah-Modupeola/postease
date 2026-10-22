import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  if (req.method === 'OPTIONS') return res.status(200).end()

  try {
    const { data: queued, error } = await supabase
      .from('queue')
      .select('*')
      .lte('scheduledat', new Date().toISOString())
      .eq('status', 'queued')
      .limit(10)

    if (error) throw error
    if (!queued || queued.length === 0) {
      return res.status(200).json({ message: 'No posts due', queued: [] })
    }

    // Example posting logic for 4 platforms
    for (let item of queued) {
      const platforms = (item.platforms || 'All').toLowerCase()
      
      // 1. Facebook + Instagram (uses FB token)
      if (platforms.includes('fb') || platforms.includes('ig') || platforms.includes('all')) {
        // await postToFacebook(item) - your existing logic
        console.log('Would post to FB/IG:', item.id)
      }
      
      // 2. LinkedIn (needs LinkedIn token - add LINKEDIN_ACCESS_TOKEN env)
      if (platforms.includes('linkedin') || platforms.includes('all')) {
        // await postToLinkedIn(item)
        console.log('Would post to LinkedIn:', item.id)
      }
      
      // 3. WhatsApp Status - can't auto-post via API, so we generate shareable image
      // For WA, we mark as 'ready_for_whatsapp' and frontend shows Download button
      if (platforms.includes('whatsapp') || platforms.includes('wa') || platforms.includes('all')) {
        console.log('WA Status ready for:', item.id)
      }

      // Mark as posted (for demo - comment out when you add real posting)
      // await supabase.from('queue').update({ status: 'posted' }).eq('id', item.id)
    }

    return res.status(200).json({ message: `Found ${queued.length} due - FB+IG+LinkedIn+WA ready`, queued })
  } catch (err) {
    return res.status(500).json({ error: err.message, queued: [] })
  }
}
