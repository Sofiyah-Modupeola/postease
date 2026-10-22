import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
)

export default async function handler(req, res) {
  try {
    // 1. Get due posts — NO join, just queue table
    const { data: queued, error } = await supabase
      .from('queue')
      .select('*')
      .lte('scheduledAt', new Date().toISOString())
      .eq('status', 'queued')
      .order('scheduledAt', { ascending: true })
      .limit(10)

    if (error) throw error

    if (!queued || queued.length === 0) {
      return res.status(200).json({ message: 'No posts due', queued: [] })
    }

    // 2. Here you would post to Facebook — for now just mark as done for test
    // Comment this out later when you add Facebook posting logic
    /*
    for (let item of queued) {
      // await postToFacebook(item)
      await supabase.from('queue').update({ status: 'posted' }).eq('id', item.id)
    }
    */

    return res.status(200).json({ message: 'Found posts', queued })

  } catch (err) {
    return res.status(500).json({ error: err.message, queued: [] })
  }
}
