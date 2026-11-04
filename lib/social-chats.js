// lib/social-chats.js
// Postmint Social Inbox, Video Comments & Direct Messaging Service
// Real-time reply dispatch for YouTube Data API v3 and Meta Graph API v21.0 (Instagram & Facebook)

const db = require('./db');
const youtube = require('./youtube');
const crypto = require('crypto');

const META_GRAPH_VERSION = 'v21.0';
const META_GRAPH_BASE = `https://graph.facebook.com/${META_GRAPH_VERSION}`;

/**
 * Resolves active social tokens from DB
 */
async function resolveAccountToken(platform, userId = 'usr_default_postmint') {
  try {
    const accounts = await db.getConnectedAccounts(userId);
    const platKey = platform.toLowerCase();
    const acc = accounts.find(a => a.platform.toLowerCase() === platKey && a.status === 'active');
    if (!acc) return null;
    return await db.getAccountWithTokens(acc.id, userId);
  } catch (e) {
    console.warn(`[SocialChats] Token lookup failed for ${platform}:`, e.message);
    return null;
  }
}

/**
 * Dispatches a comment reply to YouTube, Facebook, or Instagram
 */
async function replyToComment({ platform, commentId, postId, text, author = 'Postmint Studio', userId = 'usr_default_postmint' }) {
  if (!commentId || !text) {
    throw new Error('Comment ID and reply text are required.');
  }

  const normPlat = (platform || '').toLowerCase();
  let liveDispatched = false;
  let liveReplyId = null;
  let liveError = null;

  console.log(`[SocialChats] Replying to comment ${commentId} on ${platform}: "${text.slice(0, 40)}..."`);

  // --- 1. YOUTUBE COMMENT REPLY ---
  if (normPlat === 'youtube') {
    try {
      const ytAcc = await resolveAccountToken('youtube', userId);
      if (ytAcc && ytAcc.accessToken) {
        let token = ytAcc.accessToken;
        // Check if token expired
        const isExpired = !ytAcc.expiresAt || (new Date(ytAcc.expiresAt).getTime() - Date.now() < 5 * 60 * 1000);
        if (isExpired && ytAcc.refreshToken) {
          try {
            const refreshed = await youtube.refreshGoogleAccessToken(ytAcc.refreshToken, { accountId: ytAcc.id, userId });
            token = refreshed.accessToken;
          } catch (rErr) {
            console.warn('[SocialChats] YouTube token refresh failed:', rErr.message);
          }
        }

        const ytRes = await fetch('https://www.googleapis.com/youtube/v3/comments?part=snippet', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            snippet: {
              parentId: commentId,
              textOriginal: text
            }
          })
        });

        const ytData = await ytRes.json();
        if (ytRes.ok && ytData.id) {
          liveDispatched = true;
          liveReplyId = ytData.id;
          console.log(`[SocialChats] Live YouTube reply created with ID: ${ytData.id}`);
        } else {
          liveError = ytData.error?.message || `YouTube API HTTP ${ytRes.status}`;
          console.warn('[SocialChats] YouTube comment reply API warning:', liveError);
        }
      }
    } catch (e) {
      liveError = e.message;
      console.warn('[SocialChats] YouTube comment reply exception:', e.message);
    }
  }

  // --- 2. FACEBOOK COMMENT REPLY ---
  else if (normPlat === 'facebook') {
    try {
      const fbAcc = await resolveAccountToken('facebook', userId);
      if (fbAcc && fbAcc.accessToken) {
        const fbUrl = `${META_GRAPH_BASE}/${encodeURIComponent(commentId)}/comments`;
        const fbRes = await fetch(fbUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            message: text,
            access_token: fbAcc.accessToken
          })
        });
        const fbData = await fbRes.json();
        if (fbRes.ok && fbData.id) {
          liveDispatched = true;
          liveReplyId = fbData.id;
          console.log(`[SocialChats] Live Facebook reply created with ID: ${fbData.id}`);
        } else {
          liveError = fbData.error?.message || `Facebook API HTTP ${fbRes.status}`;
          console.warn('[SocialChats] Facebook comment reply API warning:', liveError);
        }
      }
    } catch (e) {
      liveError = e.message;
      console.warn('[SocialChats] Facebook comment reply exception:', e.message);
    }
  }

  // --- 3. INSTAGRAM COMMENT REPLY ---
  else if (normPlat === 'instagram') {
    try {
      let igAcc = await resolveAccountToken('instagram', userId);
      if (!igAcc) igAcc = await resolveAccountToken('facebook', userId);

      if (igAcc && igAcc.accessToken) {
        const igUrl = `${META_GRAPH_BASE}/${encodeURIComponent(commentId)}/replies`;
        const igRes = await fetch(igUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            message: text,
            access_token: igAcc.accessToken
          })
        });
        const igData = await igRes.json();
        if (igRes.ok && igData.id) {
          liveDispatched = true;
          liveReplyId = igData.id;
          console.log(`[SocialChats] Live Instagram reply created with ID: ${igData.id}`);
        } else {
          liveError = igData.error?.message || `Instagram API HTTP ${igRes.status}`;
          console.warn('[SocialChats] Instagram comment reply API warning:', liveError);
        }
      }
    } catch (e) {
      liveError = e.message;
      console.warn('[SocialChats] Instagram comment reply exception:', e.message);
    }
  }

  // Persist reply in Postmint Database
  const replyObj = await db.replyToComment(userId, {
    commentId,
    text,
    author,
    platform: platform || (normPlat === 'youtube' ? 'YouTube' : normPlat === 'instagram' ? 'Instagram' : 'Facebook')
  });

  return {
    success: true,
    liveDispatched,
    liveReplyId,
    liveError,
    reply: replyObj
  };
}

/**
 * Dispatches a Direct Message to Facebook Messenger or Instagram Direct
 */
async function sendDirectMessage({ platform, recipientId, conversationId, text, senderName = 'Postmint Studio', userId = 'usr_default_postmint' }) {
  if (!text || (!recipientId && !conversationId)) {
    throw new Error('Message text and recipient or conversation ID are required.');
  }

  const normPlat = (platform || '').toLowerCase();
  let liveDispatched = false;
  let liveMessageId = null;
  let liveError = null;

  console.log(`[SocialChats] Sending DM via ${platform} to ${recipientId || conversationId}: "${text.slice(0, 40)}..."`);

  // --- 1. FACEBOOK MESSENGER ---
  if (normPlat === 'facebook') {
    try {
      const fbAcc = await resolveAccountToken('facebook', userId);
      if (fbAcc && fbAcc.accessToken && recipientId && !recipientId.startsWith('demo_')) {
        const msgRes = await fetch(`${META_GRAPH_BASE}/me/messages`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${fbAcc.accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            recipient: { id: recipientId },
            message: { text },
            messaging_type: 'RESPONSE'
          })
        });
        const msgData = await msgRes.json();
        if (msgRes.ok && msgData.message_id) {
          liveDispatched = true;
          liveMessageId = msgData.message_id;
          console.log(`[SocialChats] Live Facebook message sent with ID: ${msgData.message_id}`);
        } else {
          liveError = msgData.error?.message || `Facebook Messenger HTTP ${msgRes.status}`;
          console.warn('[SocialChats] Facebook Messenger warning:', liveError);
        }
      }
    } catch (e) {
      liveError = e.message;
      console.warn('[SocialChats] Facebook Messenger exception:', e.message);
    }
  }

  // --- 2. INSTAGRAM DIRECT ---
  else if (normPlat === 'instagram') {
    try {
      let igAcc = await resolveAccountToken('instagram', userId);
      if (!igAcc) igAcc = await resolveAccountToken('facebook', userId);

      if (igAcc && igAcc.accessToken && recipientId && !recipientId.startsWith('demo_')) {
        const msgRes = await fetch(`${META_GRAPH_BASE}/me/messages`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${igAcc.accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            recipient: { id: recipientId },
            message: { text }
          })
        });
        const msgData = await msgRes.json();
        if (msgRes.ok && msgData.message_id) {
          liveDispatched = true;
          liveMessageId = msgData.message_id;
          console.log(`[SocialChats] Live Instagram message sent with ID: ${msgData.message_id}`);
        } else {
          liveError = msgData.error?.message || `Instagram Messaging HTTP ${msgRes.status}`;
          console.warn('[SocialChats] Instagram message warning:', liveError);
        }
      }
    } catch (e) {
      liveError = e.message;
      console.warn('[SocialChats] Instagram message exception:', e.message);
    }
  }

  // Persist in DB
  const msgObj = await db.addConversationMessage(userId, {
    conversationId,
    text,
    sender: 'you',
    senderName,
    platform: platform || 'Instagram'
  });

  return {
    success: true,
    liveDispatched,
    liveMessageId,
    liveError,
    message: msgObj
  };
}

/**
 * Empty seeds - fake comments removed
 */
function getSeedComments(posts = []) {
  return [];
}

/**
 * Empty seeds - fake direct messages removed
 */
function getSeedConversations() {
  return [];
}

/**
 * Fetches real comments for published posts from YouTube and Meta APIs
 */
async function fetchRemoteComments(userId = 'usr_default_postmint') {
  const remoteComments = [];
  try {
    const posts = await db.getAllPosts(userId);

    // 1. YouTube Comments
    const ytAcc = await resolveAccountToken('youtube', userId);
    if (ytAcc && ytAcc.accessToken) {
      let token = ytAcc.accessToken;
      if (ytAcc.refreshToken && (!ytAcc.expiresAt || new Date(ytAcc.expiresAt).getTime() - Date.now() < 5 * 60 * 1000)) {
        try {
          const refreshed = await youtube.refreshGoogleAccessToken(ytAcc.refreshToken, { accountId: ytAcc.id, userId });
          token = refreshed.accessToken;
        } catch (e) {}
      }

      for (const p of posts) {
        const ytRes = (p.results || []).find(r => r.platform?.toLowerCase() === 'youtube' && r.videoId);
        const videoId = ytRes?.videoId || p.youtubeVideoId || p.videoId;
        if (videoId) {
          try {
            const apiRes = await fetch(`https://www.googleapis.com/youtube/v3/commentThreads?part=snippet,replies&videoId=${encodeURIComponent(videoId)}&maxResults=20`, {
              headers: { Authorization: `Bearer ${token}` }
            });
            if (apiRes.ok) {
              const data = await apiRes.json();
              if (data.items) {
                for (const item of data.items) {
                  const top = item.snippet?.topLevelComment?.snippet;
                  if (top) {
                    const replies = [];
                    if (item.replies?.comments) {
                      for (const rep of item.replies.comments) {
                        replies.push({
                          id: rep.id,
                          author: rep.snippet?.authorDisplayName || 'YouTube User',
                          text: rep.snippet?.textDisplay || '',
                          createdAt: rep.snippet?.publishedAt || new Date().toISOString(),
                          platform: 'YouTube'
                        });
                      }
                    }
                    remoteComments.push({
                      id: item.id,
                      postId: p.id,
                      videoTitle: p.title || p.caption || 'YouTube Video',
                      videoThumb: p.mediaUrl || '/campaign-1.webp',
                      platform: 'YouTube',
                      author: top.authorDisplayName || 'YouTube User',
                      authorHandle: top.authorChannelUrl ? '@channel' : '',
                      authorAvatar: top.authorProfileImageUrl || '',
                      text: top.textDisplay || '',
                      createdAt: top.publishedAt || new Date().toISOString(),
                      likes: top.likeCount || 0,
                      replies
                    });
                  }
                }
              }
            }
          } catch (err) {
            console.warn(`[SocialChats] Failed to fetch YouTube comments for video ${videoId}:`, err.message);
          }
        }
      }
    }

    // 2. Facebook Comments
    const fbAcc = await resolveAccountToken('facebook', userId);
    if (fbAcc && fbAcc.accessToken) {
      for (const p of posts) {
        const fbRes = (p.results || []).find(r => r.platform?.toLowerCase() === 'facebook' && (r.postId || r.videoId));
        const fbTargetId = fbRes?.postId || fbRes?.videoId;
        if (fbTargetId) {
          try {
            const apiRes = await fetch(`${META_GRAPH_BASE}/${encodeURIComponent(fbTargetId)}/comments?fields=id,from,message,created_time,like_count,comments{id,from,message,created_time}&access_token=${fbAcc.accessToken}`);
            if (apiRes.ok) {
              const data = await apiRes.json();
              if (data.data) {
                for (const c of data.data) {
                  const replies = [];
                  if (c.comments?.data) {
                    for (const rep of c.comments.data) {
                      replies.push({
                        id: rep.id,
                        author: rep.from?.name || 'Page',
                        text: rep.message || '',
                        createdAt: rep.created_time || new Date().toISOString(),
                        platform: 'Facebook'
                      });
                    }
                  }
                  remoteComments.push({
                    id: c.id,
                    postId: p.id,
                    videoTitle: p.title || p.caption || 'Facebook Post',
                    videoThumb: p.mediaUrl || '/campaign-1.webp',
                    platform: 'Facebook',
                    author: c.from?.name || 'Facebook User',
                    authorHandle: '',
                    authorAvatar: '',
                    text: c.message || '',
                    createdAt: c.created_time || new Date().toISOString(),
                    likes: c.like_count || 0,
                    replies
                  });
                }
              }
            }
          } catch (err) {
            console.warn(`[SocialChats] Failed to fetch Facebook comments:`, err.message);
          }
        }
      }
    }
  } catch (e) {
    console.warn('[SocialChats] fetchRemoteComments error:', e.message);
  }
  return remoteComments;
}

/**
 * Fetches real conversations for connected Meta accounts (Facebook & Instagram DMs)
 */
async function fetchRemoteConversations(userId = 'usr_default_postmint') {
  const remoteConversations = [];
  try {
    const fbAcc = await resolveAccountToken('facebook', userId);
    if (fbAcc && fbAcc.accessToken) {
      const pageId = fbAcc.accountId || fbAcc.id || 'me';
      const convRes = await fetch(`${META_GRAPH_BASE}/${encodeURIComponent(pageId)}/conversations?fields=id,snippet,updated_time,participants,messages{id,message,from,created_time}&access_token=${fbAcc.accessToken}`);
      if (convRes.ok) {
        const data = await convRes.json();
        if (data.data) {
          for (const conv of data.data) {
            const otherParticipant = (conv.participants?.data || []).find(p => p.id !== pageId) || conv.participants?.data?.[0];
            const messages = (conv.messages?.data || []).reverse().map(m => ({
              id: m.id,
              sender: m.from?.id === pageId ? 'you' : 'them',
              senderName: m.from?.name || 'Participant',
              text: m.message || '',
              createdAt: m.created_time || new Date().toISOString()
            }));

            remoteConversations.push({
              id: conv.id,
              platform: 'Facebook',
              participantName: otherParticipant?.name || 'Facebook User',
              participantHandle: otherParticipant?.email || '',
              participantAvatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=128&q=80',
              recipientId: otherParticipant?.id,
              unread: false,
              lastMessage: conv.snippet || messages[messages.length - 1]?.text || '',
              updatedAt: conv.updated_time || new Date().toISOString(),
              messages
            });
          }
        }
      }
    }
  } catch (e) {
    console.warn('[SocialChats] fetchRemoteConversations error:', e.message);
  }
  return remoteConversations;
}

module.exports = {
  replyToComment,
  sendDirectMessage,
  fetchRemoteComments,
  fetchRemoteConversations,
  getSeedComments,
  getSeedConversations
};

