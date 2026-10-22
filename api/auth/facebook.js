import supabase from '../../lib/supabase.js';

export default async function handler(req, res) {
  const { code } = req.query;
  
  if (!code) {
    const authUrl = `https://www.facebook.com/v20.0/dialog/oauth?client_id=${process.env.FB_APP_ID}&redirect_uri=${process.env.FB_REDIRECT_URI}&scope=pages_show_list,pages_read_engagement,pages_manage_posts,pages_manage_engagement&response_type=code`;
    return res.redirect(authUrl);
  }

  // Exchange code for token
  const tokenRes = await fetch(`https://graph.facebook.com/v20.0/oauth/access_token?client_id=${process.env.FB_APP_ID}&client_secret=${process.env.FB_APP_SECRET}&redirect_uri=${process.env.FB_REDIRECT_URI}&code=${code}`);
  const tokenData = await tokenRes.json();
  
  const accountsRes = await fetch(`https://graph.facebook.com/v20.0/me/accounts?access_token=${tokenData.access_token}`);
  const accountsData = await accountsRes.json();
  
  if (accountsData.data && accountsData.data[0]) {
    const page = accountsData.data[0];
    await supabase.from('users').upsert({
      id: page.id,
      fb_page_id: page.id,
      fb_page_token: page.access_token,
      fb_page_name: page.name,
      fb_user_token: tokenData.access_token
    });
    return res.json({ success: true, page: page.name, page_id: page.id });
  }
  
  return res.json(tokenData);
}
