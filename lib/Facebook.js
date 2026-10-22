import fetch from 'node-fetch';

export async function postToFacebook(pageId, pageToken, message, imageUrl) {
  try {
    let url = `https://graph.facebook.com/v20.0/${pageId}/feed`;
    let body = { message, access_token: pageToken };

    if (imageUrl) {
      url = `https://graph.facebook.com/v20.0/${pageId}/photos`;
      body = { caption: message, url: imageUrl, access_token: pageToken };
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await res.json();
    return data;
  } catch (e) {
    return { error: e.message };
  }
}
