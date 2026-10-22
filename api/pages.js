import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export default async function handler(req, res){
  res.setHeader('Access-Control-Allow-Origin','*')
  res.setHeader('Access-Control-Allow-Methods','GET, OPTIONS')
  if(req.method==='OPTIONS') return res.status(200).end()

  try{
    // Fetch pages for current user - from users table
    const { data, error } = await supabase.from('users').select('fb_pages').order('created_at',{ascending:false}).limit(1)
    if(error) throw error
    // If no user, return empty - frontend will show demo
    const pages = data?.[0]?.fb_pages || []
    return res.status(200).json(pages)
  }catch(e){
    return res.status(200).json([])
  }
}
