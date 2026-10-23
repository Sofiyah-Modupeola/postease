import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  if (req.method === 'OPTIONS') return res.status(200).end()

  try {
    const { data: queued, error } = await supabase
      .from('queue')
      .select('*')
      .lte('scheduledat', new Date().toISOString())
      .eq('status', 'queued')
      .limit(20)

    if (error) throw error
    if (!queued?.length) return res.status(200).json({ message: 'No posts due - WhatsApp excluded', queued: [] })

    for (let item of queued) {
      const pageIds = item.selected_page_ids || []
      console.log(`[NO WA MODE] Post ${item.id}: Pages ${pageIds.join(',')} - Personal just name no suffix - IG via Pages - LinkedIn - No WhatsApp`)
    }

    return res.status(200).json({ message: `${queued.length} processed - No WhatsApp - FB Pages + Personal + IG + LinkedIn only`, queued })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
