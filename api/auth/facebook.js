import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export default async function handler(req, res){
  res.setHeader('Access-Control-Allow-Origin','*')
  const code = req.query.code
  if(!code){
    return res.status(400).json({error:'No code - Facebook login failed'})
  }
  try{
    const appId = process.env.FB_APP_ID || '1441337958144087'
    const appSecret = process.env.FB_APP_SECRET
    const redirectUri = `${process.env.VERCEL_URL ? 'https://'+process.env.VERCEL_URL : 'https://postease-one.vercel.app'}/api/auth/facebook`
    
    // Exchange code for access token
    const tokenRes = await fetch(`https://graph.facebook.com/v18.0/oauth/access_token?client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&client_secret=${appSecret}&code=${code}`)
    const tokenData = await tokenRes.json()
    if(tokenData.error) throw new Error(tokenData.error.message)
    const userAccessToken = tokenData.access_token

    // Get user's pages
    const pagesRes = await fetch(`https://graph.facebook.com/v18.0/me/accounts?access_token=${userAccessToken}`)
    const pagesData = await pagesRes.json()
    if(pagesData.error) throw new Error(pagesData.error.message)

    // Get user info
    const meRes = await fetch(`https://graph.facebook.com/v18.0/me?access_token=${userAccessToken}&fields=id,name,email`)
    const meData = await meRes.json()

    // Save to Supabase users table - fb_pages column
    const fbPages = pagesData.data.map(p=>({id:p.id, name:p.name, access_token:p.access_token, category:p.category}))
    
    await supabase.from('users').upsert({
      fb_user_id: meData.id,
      name: meData.name,
      email: meData.email || `${meData.id}@fb.local`,
      fb_pages: fbPages,
      user_access_token: userAccessToken,
      created_at: new Date().toISOString()
    }, { onConflict: 'fb_user_id' })

    // Redirect back to frontend with success flag
    return res.redirect(`${process.env.FRONTEND_URL || 'https://postease-one.vercel.app'}?fb_connected=1&user=${meData.name}&pages=${fbPages.length}`)

  }catch(e){
    return res.status(500).json({error:e.message})
  }
}
