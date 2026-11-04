// api/admin.js
// Postmint Protected Admin Gateway & Management API
// Strictly enforced server-side authentication and role validation for explorewithharizz@gmail.com

const db = require('../lib/db');
const { getAuthenticatedUser } = require('../lib/auth-session');
const { getUserEntitlements, ADMIN_EMAIL } = require('../lib/entitlements');

async function handler(req, res) {
  // CORS & headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  // 1. Strict Server-Side Admin Authorization (Requirement 1)
  const authUser = await getAuthenticatedUser(req);
  const normalizedEmail = (authUser?.email_normalized || authUser?.email || '').trim().toLowerCase();
  const isAdmin = (authUser?.role === 'admin') || (normalizedEmail === ADMIN_EMAIL);

  if (!authUser || !isAdmin) {
    return res.status(403).json({
      success: false,
      error: 'forbidden',
      message: 'Access Denied. Only the administrator (explorewithharizz@gmail.com) can access this resource.'
    });
  }

  const query = req.query || {};
  const url = req.url || '';
  let subpath = query.subpath || '';
  if (!subpath) {
    const cleanUrl = url.split('?')[0];
    const match = cleanUrl.match(/^\/api\/admin\/?(.*)/);
    if (match) subpath = match[1];
  }
  subpath = subpath.replace(/^\/+|\/+$/g, '');

  let payload = {};
  if (req.body) {
    payload = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body;
  }

  try {
    // ------------------------------------------------------------------------
    // Overview Metrics (Requirement 2)
    // ------------------------------------------------------------------------
    if (subpath === 'overview' || subpath === '') {
      const stats = await db.getAdminOverviewStats();
      return res.status(200).json({ success: true, stats });
    }

    // ------------------------------------------------------------------------
    // User Management (Requirement 3)
    // ------------------------------------------------------------------------
    if (subpath === 'users' || subpath.startsWith('users/')) {
      const parts = subpath.split('/').filter(Boolean);

      // GET /api/admin/users - List users with entitlements and usage (Optimized High-Performance Batch Loading)
      if (req.method === 'GET' && parts.length === 1) {
        const [rawUsers, allSubs, allFreeMembers, allUsage, allCoupons, allRedemptions, allSocialAccounts] = await Promise.all([
          db.getAllUsers(req.query || {}),
          db.getAllSubscriptions(),
          db.getAllFreeMembers(),
          db.getAllUsage(),
          db.getAllCoupons(),
          db.getAllCouponRedemptions(),
          db.getAllConnectedAccounts ? db.getAllConnectedAccounts() : []
        ]);

        const now = new Date();
        const periodMonth = now.toISOString().slice(0, 7);

        // Build fast in-memory lookup maps
        const subByUserId = new Map();
        const subByEmail = new Map();
        allSubs.forEach(s => {
          if (s.user_id) subByUserId.set(s.user_id, s);
          if (s.email_normalized) subByEmail.set(s.email_normalized, s);
        });

        const freeMemberByEmail = new Map();
        allFreeMembers.forEach(fm => {
          if (fm.email_normalized) freeMemberByEmail.set(fm.email_normalized, fm);
        });

        const redemptionsByUserId = new Map();
        allRedemptions.forEach(r => {
          if (r.user_id) {
            if (!redemptionsByUserId.has(r.user_id)) redemptionsByUserId.set(r.user_id, []);
            redemptionsByUserId.get(r.user_id).push(r);
          }
        });

        const usageByUserId = new Map();
        allUsage.forEach(u => {
          if (u.user_id && u.period_month === periodMonth) {
            usageByUserId.set(u.user_id, (usageByUserId.get(u.user_id) || 0) + (Number(u.uploads_used) || 0));
          }
        });

        const socialByUserId = new Map();
        allSocialAccounts.forEach(sa => {
          if (sa.userId) {
            if (!socialByUserId.has(sa.userId)) socialByUserId.set(sa.userId, []);
            socialByUserId.get(sa.userId).push(sa.platform);
          }
        });

        const enrichedUsers = rawUsers.map((u) => {
          const normEmail = (u.email_normalized || u.email || '').trim().toLowerCase();
          const isAdmin = (u.role === 'admin') || (normEmail === ADMIN_EMAIL);

          let effectivePlan = 'free';
          let premiumSource = 'none';
          let premiumExpiry = null;

          if (isAdmin) {
            effectivePlan = 'agency_scale';
            premiumSource = 'admin';
            premiumExpiry = 'permanent';
          } else {
            const sub = subByUserId.get(u.id) || subByEmail.get(normEmail);
            if (sub && sub.status === 'active' && (!sub.billing_end || now < new Date(sub.billing_end))) {
              effectivePlan = sub.plan || 'creator_pro';
              premiumSource = sub.source === 'coupon' ? 'coupon' : 'paid';
              premiumExpiry = sub.billing_end || sub.promo_end || null;
            } else {
              const fm = freeMemberByEmail.get(normEmail);
              if (fm && fm.status === 'active' && (fm.expiry_date === 'permanent' || !fm.expiry_date || now < new Date(fm.expiry_date))) {
                effectivePlan = fm.plan || 'creator_pro';
                premiumSource = 'admin_grant';
                premiumExpiry = fm.expiry_date;
              } else {
                const userReds = redemptionsByUserId.get(u.id) || [];
                const activeRed = userReds.find(r => !r.access_end || now < new Date(r.access_end));
                if (activeRed) {
                  effectivePlan = activeRed.plan || 'creator_pro';
                  premiumSource = 'coupon';
                  premiumExpiry = activeRed.access_end;
                } else if (u.plan === 'agency_scale' || u.plan === 'creator_pro') {
                  effectivePlan = u.plan;
                  premiumSource = 'account_setting';
                }
              }
            }
          }

          const isPremium = effectivePlan !== 'free';
          let daysRemaining = null;
          let expiryBadgeText = 'Free Plan (5/mo)';
          if (isAdmin) {
            expiryBadgeText = 'Admin Unlimited';
          } else if (isPremium) {
            if (premiumExpiry === 'permanent' || !premiumExpiry) {
              expiryBadgeText = 'Lifetime Access';
            } else {
              const diffMs = new Date(premiumExpiry).getTime() - now.getTime();
              daysRemaining = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
              expiryBadgeText = daysRemaining === 1 ? '1 day left' : `${daysRemaining} days left`;
            }
          }

          const userReds = redemptionsByUserId.get(u.id) || [];
          const couponUsed = userReds[0]?.coupon_code || null;
          const uploadsUsed = usageByUserId.get(u.id) || 0;
          const monthlyUploadLimit = (isAdmin || effectivePlan === 'agency_scale' || effectivePlan === 'creator_pro') ? Infinity : 5;
          const connectedPlatforms = socialByUserId.get(u.id) || [];

          return {
            id: u.id,
            name: u.name || 'Unnamed Creator',
            email: u.email,
            avatarUrl: u.avatar_url || '/mint-avatar.jpg',
            role: u.role || 'user',
            status: u.status || 'active',
            authProvider: u.auth_provider || 'google',
            createdAt: u.created_at || u.createdAt,
            lastLogin: u.last_login || null,
            effectivePlan,
            subscriptionStatus: isPremium ? (premiumSource === 'paid' ? 'Active Paid' : 'Promotional') : 'Free',
            premiumSource,
            premiumExpiry,
            daysRemaining,
            expiryBadgeText,
            uploadsUsed,
            monthlyUploadLimit,
            couponUsed,
            connectedPlatforms
          };
        });

        return res.status(200).json({ success: true, count: enrichedUsers.length, users: enrichedUsers });
      }

      // Action: Grant Free Premium Access (Requirement 4)
      if (req.method === 'POST' && (parts[1] === 'grant-free' || payload.action === 'grant_free')) {
        const targetUserId = parts[0] !== 'users' ? parts[0] : payload.userId;
        const targetUser = await db.findUserById(targetUserId) || await db.findUserByEmail(payload.email);
        if (!targetUser) {
          return res.status(404).json({ success: false, error: 'User not found' });
        }

        const grantPlan = payload.plan || 'creator_pro';
        const duration = payload.duration || '14 days';
        const expiryDate = payload.expiryDate || null;

        const freeMember = await db.addFreeMember({
          email: targetUser.email,
          plan: grantPlan,
          duration,
          expiry_date: expiryDate,
          created_by: authUser.email
        });

        await db.logActivity(authUser.id, 'admin_grant_free_access', {
          targetUserId: targetUser.id,
          targetEmail: targetUser.email,
          plan: grantPlan,
          duration
        });

        const newEnt = await getUserEntitlements(targetUser.id);
        return res.status(200).json({ success: true, message: `Granted ${grantPlan} (${duration}) to ${targetUser.email}`, freeMember, entitlements: newEnt });
      }

      // Action: Revoke Free Premium Access
      if (req.method === 'POST' && (parts[1] === 'remove-free' || payload.action === 'remove_free')) {
        const targetUserId = parts[0] !== 'users' ? parts[0] : payload.userId;
        const targetUser = await db.findUserById(targetUserId) || await db.findUserByEmail(payload.email);
        if (targetUser) {
          await db.removeFreeMember(targetUser.email);
          await db.logActivity(authUser.id, 'admin_remove_free_access', { targetUserId: targetUser.id, targetEmail: targetUser.email });
        }
        return res.status(200).json({ success: true, message: 'Free premium access revoked.' });
      }

      // Action: Change Plan
      if (req.method === 'POST' && (parts[1] === 'change-plan' || payload.action === 'change_plan')) {
        const targetUserId = parts[0] !== 'users' ? parts[0] : payload.userId;
        const newPlan = payload.plan || 'free';
        const targetUser = await db.findUserById(targetUserId) || await db.findUserByEmail(payload.email);
        if (!targetUser) {
          return res.status(404).json({ success: false, error: 'User not found' });
        }

        const normalizedEmail = (targetUser.email || '').toLowerCase();

        // 1. Update user record
        await db.updateUser(targetUser.id, {
          plan: newPlan,
          effective_plan: newPlan,
          updated_at: new Date().toISOString()
        });

        if (newPlan === 'free') {
          // Downgrade to Free Plan: cancel subscriptions, revoke free_members grants, expire redemptions
          await db.upsertSubscription(targetUser.id, {
            plan: 'free',
            status: 'canceled',
            billing_end: new Date().toISOString()
          });
          await db.removeFreeMember(normalizedEmail);

          const localData = db.loadLocalDb();
          if (localData.coupon_redemptions) {
            localData.coupon_redemptions.forEach(r => {
              if (r.user_id === targetUser.id) r.access_end = new Date(Date.now() - 1000).toISOString();
            });
            db.saveLocalDb(localData);
          }
        } else {
          // Upgrade to Creator Pro or Agency Scale: upsert active subscription and permanent grant
          await db.upsertSubscription(targetUser.id, {
            plan: newPlan,
            status: 'active',
            billing_start: new Date().toISOString(),
            billing_end: null
          });
          await db.addFreeMember({
            email: normalizedEmail,
            plan: newPlan,
            duration: 'Permanent',
            created_by: authUser.email
          });
        }

        await db.logActivity(authUser.id, 'admin_change_plan', { targetUserId: targetUser.id, targetEmail: normalizedEmail, newPlan });
        const newEnt = await getUserEntitlements(targetUser.id, normalizedEmail);
        return res.status(200).json({
          success: true,
          message: `Plan changed to ${newPlan.replace('_', ' ').toUpperCase()} for ${targetUser.email}.`,
          entitlements: newEnt
        });
      }

      // Action: Reset Upload Usage
      if (req.method === 'POST' && (parts[1] === 'reset-usage' || payload.action === 'reset_usage')) {
        const targetUserId = parts[0] !== 'users' ? parts[0] : payload.userId;
        await db.resetMonthlyUploads(targetUserId);
        await db.logActivity(authUser.id, 'admin_reset_usage', { targetUserId });
        return res.status(200).json({ success: true, message: 'Monthly upload usage reset to 0.' });
      }

      // Action: Suspend / Unsuspend User
      if (req.method === 'POST' && (parts[1] === 'suspend' || payload.action === 'suspend')) {
        const targetUserId = parts[0] !== 'users' ? parts[0] : payload.userId;
        const suspend = payload.suspend !== false;
        const targetUser = await db.findUserById(targetUserId) || await db.findUserByEmail(payload.email);
        if (!targetUser) {
          return res.status(404).json({ success: false, error: 'User not found' });
        }

        const newStatus = suspend ? 'suspended' : 'active';
        await db.updateUser(targetUser.id, {
          status: newStatus,
          account_status: newStatus,
          updated_at: new Date().toISOString()
        });

        await db.logActivity(authUser.id, suspend ? 'admin_suspend_user' : 'admin_unsuspend_user', { targetUserId: targetUser.id, targetEmail: targetUser.email });
        const newEnt = await getUserEntitlements(targetUser.id);
        return res.status(200).json({
          success: true,
          message: suspend ? `User ${targetUser.email} has been deactivated/suspended.` : `User ${targetUser.email} has been reactivated.`,
          status: newStatus,
          entitlements: newEnt
        });
      }

      // Action: Delete User
      if ((req.method === 'POST' && (parts[1] === 'delete' || payload.action === 'delete_user')) || (req.method === 'DELETE' && parts[1])) {
        const targetUserId = parts[0] !== 'users' ? parts[0] : (parts[1] || payload.userId);
        const targetUser = await db.findUserById(targetUserId) || await db.findUserByEmail(payload.email);
        if (targetUser && (targetUser.email || '').toLowerCase() !== ADMIN_EMAIL) {
          await db.deleteUser(targetUser.id);
          await db.removeFreeMember(targetUser.email);
          await db.logActivity(authUser.id, 'admin_delete_user', { targetUserId: targetUser.id, targetEmail: targetUser.email });
        }
        return res.status(200).json({ success: true, message: 'User deleted successfully.' });
      }

      // Action: Disconnect Social Accounts
      if (req.method === 'POST' && (parts[1] === 'disconnect-accounts' || payload.action === 'disconnect_accounts')) {
        const targetUserId = parts[0] !== 'users' ? parts[0] : payload.userId;
        const localData = db.loadLocalDb();
        if (localData.socialAccounts) {
          localData.socialAccounts = localData.socialAccounts.map(acc => {
            if (acc.userId === targetUserId) acc.status = 'revoked';
            return acc;
          });
          db.saveLocalDb(localData);
        }
        await db.logActivity(authUser.id, 'admin_disconnect_user_accounts', { targetUserId });
        return res.status(200).json({ success: true, message: 'All social accounts disconnected for user.' });
      }
    }

    // ------------------------------------------------------------------------
    // Free Members System (Requirement 4)
    // ------------------------------------------------------------------------
    if (subpath === 'free-members' || subpath.startsWith('free-members/')) {
      if (req.method === 'GET') {
        const members = await db.getAllFreeMembers();
        return res.status(200).json({ success: true, members });
      }

      if (req.method === 'POST') {
        const { email, plan, duration, expiryDate } = payload;
        if (!email || !email.includes('@')) {
          return res.status(400).json({ success: false, error: 'Valid email is required.' });
        }

        const member = await db.addFreeMember({
          email,
          plan: plan || 'creator_pro',
          duration: duration || '14 days',
          expiry_date: expiryDate || null,
          created_by: authUser.email
        });

        await db.logActivity(authUser.id, 'admin_add_free_member', { email, plan, duration });
        return res.status(200).json({ success: true, message: `Free premium member added: ${email}`, member });
      }

      if (req.method === 'DELETE') {
        const id = query.id || payload.id;
        if (!id) return res.status(400).json({ success: false, error: 'Member ID or email is required.' });
        await db.removeFreeMember(id);
        await db.logActivity(authUser.id, 'admin_remove_free_member', { id });
        return res.status(200).json({ success: true, message: 'Free access revoked.' });
      }
    }

    // ------------------------------------------------------------------------
    // Coupon Management (Requirement 5, 6, 7)
    // ------------------------------------------------------------------------
    if (subpath === 'coupons' || subpath.startsWith('coupons/')) {
      const parts = subpath.split('/').filter(Boolean);
      const couponId = parts[1] || query.id || payload.id;

      if (req.method === 'GET') {
        const coupons = await db.getAllCoupons();
        const redemptions = await db.getAllCouponRedemptions();
        return res.status(200).json({ success: true, coupons, redemptions });
      }

      if (req.method === 'POST') {
        try {
          const coupon = await db.createCoupon(payload);
          await db.logActivity(authUser.id, 'admin_create_coupon', { code: coupon.code, discount: coupon.discount_value });
          return res.status(201).json({ success: true, message: `Coupon ${coupon.code} created successfully.`, coupon });
        } catch (err) {
          return res.status(400).json({ success: false, error: err.message, message: err.message });
        }
      }

      if (req.method === 'PATCH') {
        const updated = await db.updateCoupon(couponId, payload);
        if (!updated) return res.status(404).json({ success: false, error: 'Coupon not found' });
        await db.logActivity(authUser.id, 'admin_update_coupon', { couponId, updates: payload });
        return res.status(200).json({ success: true, message: 'Coupon updated successfully.', coupon: updated });
      }

      if (req.method === 'DELETE') {
        await db.deleteCoupon(couponId);
        await db.logActivity(authUser.id, 'admin_delete_coupon', { couponId });
        return res.status(200).json({ success: true, message: 'Coupon deleted successfully.' });
      }
    }

    // ------------------------------------------------------------------------
    // Announcements Broadcast (Requirement: updates to all users via Notifications)
    // ------------------------------------------------------------------------
    if (subpath === 'announcements' || subpath.startsWith('announcements/')) {
      const parts = subpath.split('/').filter(Boolean);
      const annId = parts[1] || query.id || payload.id;

      if (req.method === 'GET') {
        const announcements = await db.getAnnouncements();
        return res.status(200).json({ success: true, announcements });
      }

      if (req.method === 'POST') {
        const title = (payload.title || '').trim();
        const message = (payload.message || '').trim();
        if (!message) {
          return res.status(400).json({ success: false, message: 'Announcement message is required.' });
        }
        const ann = await db.createAnnouncement({
          title: title || 'Postsprint Update',
          message,
          cta_label: payload.cta_label || null,
          cta_url: payload.cta_url || null,
          created_by: authUser.email || 'admin'
        });
        await db.logActivity(authUser.id, 'admin_broadcast_announcement', { announcementId: ann.id, title: ann.title });
        return res.status(201).json({ success: true, message: 'Announcement broadcasted to all users successfully!', announcement: ann });
      }

      if (req.method === 'DELETE') {
        if (!annId) return res.status(400).json({ success: false, message: 'Missing announcement ID' });
        await db.deleteAnnouncement(annId);
        await db.logActivity(authUser.id, 'admin_delete_announcement', { announcementId: annId });
        return res.status(200).json({ success: true, message: 'Announcement removed.' });
      }
    }

    // ------------------------------------------------------------------------
    // Music Library Management (Admin Audio Upload & Google Drive Musics)
    // ------------------------------------------------------------------------
    if (subpath === 'music' || subpath.startsWith('music/')) {
      const parts = subpath.split('/').filter(Boolean);
      const trackId = parts[1] || query.id || payload.id || payload.trackId;

      if (req.method === 'GET') {
        const tracks = await db.getMusicTracks();
        return res.status(200).json({ success: true, count: tracks.length, tracks });
      }

      if (req.method === 'POST') {
        const title = (payload.title || '').trim();
        const audioUrl = (payload.audioUrl || '').trim();
        const driveUrl = (payload.driveUrl || '').trim();
        if (!title) {
          return res.status(400).json({ success: false, message: 'Track title is required.' });
        }
        if (!audioUrl && !driveUrl) {
          return res.status(400).json({ success: false, message: 'Audio URL or Google Drive link is required.' });
        }
        const createdTrack = await db.createMusicTrack({
          ...payload,
          title,
          audioUrl,
          driveUrl,
          createdBy: authUser.email || authUser.id
        });
        await db.logActivity(authUser.id, 'admin_upload_music', { trackId: createdTrack.id, title: createdTrack.title });
        return res.status(201).json({ success: true, message: 'Music track added to catalog!', track: createdTrack });
      }

      if (req.method === 'DELETE') {
        if (!trackId) return res.status(400).json({ success: false, message: 'Missing track ID to delete' });
        await db.deleteMusicTrack(trackId);
        await db.logActivity(authUser.id, 'admin_delete_music', { trackId });
        return res.status(200).json({ success: true, message: 'Track deleted from music library.' });
      }
    }

    // ------------------------------------------------------------------------
    // Subscriptions, Usage, Social Connections, Payments & Activity Logs
    // ------------------------------------------------------------------------
    if (subpath === 'subscriptions') {
      const subs = await db.getAllSubscriptions();
      return res.status(200).json({ success: true, subscriptions: subs });
    }

    if (subpath === 'usage') {
      const usageList = await db.getAllUsage(query.periodMonth);
      return res.status(200).json({ success: true, usage: usageList });
    }

    if (subpath === 'social-connections') {
      const localData = db.loadLocalDb();
      const accounts = localData.socialAccounts || [];
      return res.status(200).json({ success: true, count: accounts.length, accounts });
    }

    if (subpath === 'payments') {
      const payments = await db.getPayments(100);
      return res.status(200).json({ success: true, payments });
    }

    if (subpath === 'activity') {
      const logs = await db.getActivityLogs(100);
      return res.status(200).json({ success: true, logs });
    }

    if (subpath === 'settings') {
      return res.status(200).json({
        success: true,
        settings: {
          adminEmail: ADMIN_EMAIL,
          platformName: 'Postmint Social Studio',
          freeUploadLimitMonthly: 5,
          creatorProPriceMonthly: 399,
          agencyScalePriceMonthly: 1499,
          supportedPlatforms: ['Instagram', 'Facebook', 'YouTube']
        }
      });
    }

    return res.status(404).json({ success: false, error: `Admin route not found: ${subpath}` });
  } catch (err) {
    console.error('[Admin API Exception]:', err.message);
    return res.status(500).json({ success: false, error: 'server_error', message: err.message });
  }
}

module.exports = handler;
module.exports.default = handler;
