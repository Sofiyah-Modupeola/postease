import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY
)

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()

  try {
    if (req.method === 'GET') {
      const { data, error } = await supabase.from('queue').select('*').order('created_at', { ascending: false }).limit(100)
      if (error) throw error
      return res.status(200).json(data || [])
    }

    if (req.method === 'POST') {
      const b = req.body
      
      // Support multiple pages + personal + toggles
      const selectedPages = b.selectedPages || b.selectedPageIds || []
      const selectedPageIds = Array.isArray(selectedPages) ? selectedPages.map(p=> typeof p === 'string' ? p : p.id) : []
      const includePersonal = b.includePersonal || b.personalEnabled || false

      const payload = {
        caption: b.caption || '',
        imageurl: b.imageUrl || (b.media && b.media[0]) || null,
        imageUrl: b.imageUrl || (b.media && b.media[0]) || null,
        media: b.media || [],
        scheduledat: b.scheduledAt || new Date().toISOString(),
        scheduledAt: b.scheduledAt || new Date().toISOString(),
        status: b.status || 'queued',
        user_id: b.user_id || 'sofiyah',
        business_name: b.businessName || '',
        main_prompt: b.mainPrompt || '',
        cover_duration: b.coverDuration || '30',
        posts_count: b.postsCount || '15',
        handle: b.handle || '',
        about: b.about || '',
        type: b.type || 'Product Sales',
        days: b.days || '',
        time: b.time || '18:00',
        platforms: b.platforms || 'All',
        // NEW: multi-page support
        selected_pages: selectedPages,
        selected_page_ids: selectedPageIds,
        selectedpages: selectedPages,
        include_personal: includePersonal,
        includepersonal: includePersonal,
        toggle_linkedin: b.toggleLinkedIn ?? true,
        toggle_ig: b.toggleIG ?? true,
        toggle_wa: b.toggleWA ?? true,
        toggle_wa_biz: b.toggle_wa_biz ?? true,
        wa_biz: b.wa_biz || null,
        wa_phone_id: b.wa_phone_id || '',
        linkedin: b.linkedIn || b.linkedin || null,
        all_pages: b.allPages || [],
        // For backward compatibility
        fb_page_ids: selectedPageIds
      }

      const { data, error } = await supabase.from('queue').insert([payload]).select()
      if (error) throw error
      return res.status(200).json({ 
        success: true, 
        queued: data[0],
        message: `Queued to ${selectedPageIds.length} page(s) ${includePersonal ? '+ Personal' : ''} + LinkedIn/IG/WA toggles`
      })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
          }
