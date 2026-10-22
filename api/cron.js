import supabase from '../lib/supabase.js';
import { postToFacebook } from '../lib/facebook.js';

export default async function handler(req, res) {
  // Allow manual trigger + Vercel cron
  const now = new Date();
  
  // Get all queued posts that are due
  const { data: queued, error } = await supabase
    .from('queue')
    .select('*, users!inner(fb_page_id, fb_page_token)')
    .eq('status', 'queued')
    .lte('scheduledAt', now.toISOString())
    .limit(10);

  if (error) return res.json({ error: error.message, queued: [] });
  
  if (!queued || queued.length === 0) {
    return res.json({ success: true, message: 'No posts due', time: now });
  }

  let posted = 0;
  for (const job of queued) {
    const pageId = job.users?.fb_page_id || job.user_id;
    const pageToken = job.users?.fb_page_token || process.env.FB_PAGE_TOKEN;
    
    if (!pageToken) continue;

    const result = await postToFacebook(pageId, pageToken, job.caption, job.imageUrl);
    
    if (result.id || result.post_id) {
      await supabase.from('queue').update({ status: 'posted', postedAt: now.toISOString() }).eq('id', job.id);
      posted++;
    } else {
      await supabase.from('queue').update({ status: 'failed', error: JSON.stringify(result).slice(0, 500) }).eq('id', job.id);
    }
  }

  return res.json({ success: true, checked: queued.length, posted });
}
