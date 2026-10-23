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
    // Get latest user with fb_pages - now return ALL pages
    const { data, error } = await supabase.from('users').select('fb_pages, name, fb_user_id, user_access_token').order('created_at',{ascending:false}).limit(5)
    if(error) throw error
    if(!data || data.length===0) return res.status(200).json([])

    // Merge all pages from last 5 logins to ensure we list all pages user manages (deduplicate)
    const allPagesMap = {}
    for(let u of data){
      const pages = u.fb_pages || []
      for(let p of pages){
        if(p && p.id) allPagesMap[p.id] = p
      }
    }
    const mergedPages = Object.values(allPagesMap)

    // Also try to refresh from Graph API using latest user token to get ALL pages
    const latestUser = data[0]
    if(latestUser?.user_access_token){
      try{
        const pagesRes = await fetch(`https://graph.facebook.com/v18.0/me/accounts?access_token=${latestUser.user_access_token}&limit=100`)
        const pagesData = await pagesRes.json()
        if(pagesData.data && Array.isArray(pagesData.data)){
          for(let p of pagesData.data){
            if(!allPagesMap[p.id]){
              mergedPages.push({id:p.id, name:p.name, access_token:p.access_token, category:p.category})
              allPagesMap[p.id]=p
            }
          }
          // Update DB with refreshed list
          await supabase.from('users').update({fb_pages: mergedPages}).eq('fb_user_id', latestUser.fb_user_id)
        }
      }catch(e){
        console.log('Graph refresh failed', e.message)
      }
    }

    return res.status(200).json(mergedPages)
  }catch(e){
    console.log('api-pages error', e.message)
    return res.status(200).json([])
  }
}
