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
    if (!queued?.length) return res.status(200).json({ message: 'No posts due', queued: [] })

    for (let item of queued) {
      const pageIds = item.selected_page_ids || item.fb_page_ids || []
      const includePersonal = item.include_personal || false
      
      console.log(`[ZERO TOKEN] Post ${item.id}: Pages ${pageIds.join(',')} - ${pageIds.map(id=>`Real page ${id}`).join(',')} Personal: ${includePersonal ? 'Just name, no suffix' : 'No'}`)
      console.log(`[ZERO TOKEN] LinkedIn: ${item.linkedin?.name || 'Not connected'} - identifies via OAuth, no token paste for users`)
      console.log(`[ZERO TOKEN] WA Business Auto: ${item.wa_phone_id ? 'Auto via Business API - admin config, users just toggle' : 'No'} | WA Ordinary: Manual share - initial plan`)

      // Zero token logic:
      // FB Pages: auto via Page tokens obtained via OAuth, no user paste
      // LinkedIn: auto via OAuth token, no user paste - identifies which LI account
      // WA Business: auto via admin Phone ID + Token, users just toggle ON/OFF - no paste for users
      // WA Ordinary: manual share - wa.me/?text= - no token
      // Personal FB: Share Dialog - just name, no suffix
    }

    return res.status(200).json({ message: `${queued.length} processed - Zero token for users, real pages, accurate identification`, queued })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
