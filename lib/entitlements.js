// lib/entitlements.js
// Centralized Entitlement & Subscription Access Engine for Postmint Social Studio
// Implements strict priority-based plan evaluation, countdown logic, and monthly upload limits.

const db = require('./db');

const ADMIN_EMAIL = 'explorewithharizz@gmail.com';

/**
 * Evaluates the effective subscription entitlements for a given user.
 * 
 * Plan Priority (Requirement 25):
 * 1. Active Agency Scale paid subscription
 * 2. Active Creator Pro paid subscription
 * 3. Valid Admin Free Access (via free_members table)
 * 4. Valid 100% Coupon Promotional Access (via coupon_redemptions table)
 * 5. Free Plan (Default: 5 uploads / month)
 *
 * @param {string} userId - User ID
 * @param {string} [email] - User email (optional, fetched if omitted)
 * @returns {Promise<Object>} Entitlements object
 */
async function getUserEntitlements(userId, email = null) {
  const now = new Date();
  const periodMonth = now.toISOString().slice(0, 7); // e.g. '2026-10'

  let user = null;
  if (userId) {
    user = await db.findUserById(userId);
  }
  if (!user && email) {
    user = await db.findUserByEmail(email);
  }

  const normalizedEmail = (user?.email_normalized || user?.email || email || '').trim().toLowerCase();
  const isAdmin = (user?.role === 'admin') || (normalizedEmail === ADMIN_EMAIL);

  // 1. Check if user is suspended or deactivated
  if (user && (user.status === 'suspended' || user.account_status === 'suspended')) {
    return {
      userId: user.id,
      email: normalizedEmail,
      role: user.role || 'user',
      status: 'suspended',
      accountStatus: 'suspended',
      plan: 'free',
      effectivePlan: 'free',
      premium: false,
      premiumSource: 'none',
      premiumExpiry: null,
      daysRemaining: 0,
      expiryBadgeText: 'Suspended',
      periodMonth,
      monthlyUploadLimit: 0,
      uploadsUsed: 0,
      uploadsRemaining: 0,
      canPublish: false,
      canUseZoya: false,
      canUseAdvancedAnalytics: false,
      connectedAccountLimit: 0
    };
  }

  // Admin override: Always Agency Scale Unlimited
  if (isAdmin) {
    return {
      userId: user?.id || userId || 'usr_admin_harizz',
      email: normalizedEmail,
      role: 'admin',
      status: 'active',
      plan: 'agency_scale',
      effectivePlan: 'agency_scale',
      premium: true,
      premiumSource: 'admin',
      premiumExpiry: 'permanent',
      daysRemaining: null,
      expiryBadgeText: 'Admin Unlimited',
      periodMonth,
      monthlyUploadLimit: Infinity,
      uploadsUsed: 0,
      uploadsRemaining: Infinity,
      canPublish: true,
      canUseZoya: true,
      canUseAdvancedAnalytics: true,
      connectedAccountLimit: Infinity
    };
  }

  let effectivePlan = 'free';
  let premiumSource = 'none';
  let premiumExpiry = null;
  let activeRedemption = null;
  let activeFreeGrant = null;

  // PRIORITY 1 & 2: Active Subscriptions (Paid or Promotional Coupon)
  if (userId || normalizedEmail) {
    const sub = await db.getSubscription(userId, normalizedEmail);
    if (sub && sub.status === 'active') {
      const billingEnd = sub.billing_end ? new Date(sub.billing_end) : null;
      if (!billingEnd || now < billingEnd) {
        if (sub.plan === 'agency_scale' || sub.plan === 'creator_pro') {
          effectivePlan = sub.plan;
          premiumSource = sub.source === 'coupon' ? 'coupon' : 'paid';
          premiumExpiry = sub.billing_end || sub.promo_end || null;
        }
      }
    }
  }

  // PRIORITY 3: Valid Admin Free Member Access
  if (effectivePlan === 'free' && normalizedEmail) {
    const freeGrant = await db.getFreeMember(normalizedEmail);
    if (freeGrant && freeGrant.status === 'active') {
      const isPermanent = freeGrant.expiry_date === 'permanent' || !freeGrant.expiry_date;
      const isNotExpired = isPermanent || (now < new Date(freeGrant.expiry_date));
      if (isNotExpired) {
        effectivePlan = freeGrant.plan || 'creator_pro';
        premiumSource = 'admin_grant';
        premiumExpiry = freeGrant.expiry_date;
        activeFreeGrant = freeGrant;
      }
    }
  }

  // PRIORITY 4: Direct Admin Assigned Plan on User Profile
  if (effectivePlan === 'free' && user && (user.plan === 'creator_pro' || user.plan === 'agency_scale')) {
    effectivePlan = user.plan;
    premiumSource = 'admin';
    premiumExpiry = 'permanent';
  }

  // PRIORITY 5: Valid 100% Coupon Promotional Access
  if (effectivePlan === 'free' && (userId || normalizedEmail)) {
    const redemptions = await db.getUserCouponRedemptions(userId, normalizedEmail);
    for (const red of redemptions) {
      if (red.access_end && now < new Date(red.access_end)) {
        effectivePlan = red.plan || 'creator_pro';
        premiumSource = 'coupon';
        premiumExpiry = red.access_end;
        activeRedemption = red;
        break;
      }
    }
  }

  // Populate activeRedemption for coupon subscriptions if missing
  if (premiumSource === 'coupon' && !activeRedemption && (userId || normalizedEmail)) {
    const redemptions = await db.getUserCouponRedemptions(userId, normalizedEmail);
    activeRedemption = redemptions[0] || null;
  }

  // Calculate Days Remaining & Badge Text
  let daysRemaining = null;
  let expiryBadgeText = null;

  if (premiumExpiry) {
    if (premiumExpiry === 'permanent') {
      daysRemaining = null;
      expiryBadgeText = 'Permanent';
    } else {
      const expiryDate = new Date(premiumExpiry);
      const diffMs = expiryDate.getTime() - now.getTime();
      if (diffMs > 0) {
        daysRemaining = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
        if (daysRemaining === 1) {
          expiryBadgeText = '1 day remaining';
        } else if (daysRemaining <= 0) {
          expiryBadgeText = 'Expires today';
        } else {
          expiryBadgeText = `${daysRemaining} days remaining`;
        }
      } else {
        // Expired right now! Downgrade to Free
        effectivePlan = 'free';
        premiumSource = 'none';
        premiumExpiry = null;
        daysRemaining = 0;
        expiryBadgeText = null;
      }
    }
  }

  // Get Monthly Upload Quota Usage
  const usageRecord = userId ? await db.getMonthlyUsage(userId, periodMonth) : null;
  const uploadsUsed = usageRecord ? (usageRecord.uploads_used || 0) : 0;
  const isPremium = effectivePlan !== 'free';

  const monthlyUploadLimit = isPremium ? Infinity : 5;
  const uploadsRemaining = isPremium ? Infinity : Math.max(0, 5 - uploadsUsed);
  const canPublish = isPremium || (uploadsRemaining > 0);

  return {
    userId: user?.id || userId || null,
    email: normalizedEmail,
    role: user?.role || 'user',
    status: user?.status || 'active',
    plan: effectivePlan || user?.plan || 'free',
    effectivePlan,
    premium: isPremium,
    premiumSource,
    premiumExpiry,
    daysRemaining,
    expiryBadgeText,
    couponCode: activeRedemption?.coupon_code || null,
    periodMonth,
    monthlyUploadLimit,
    uploadsUsed,
    uploadsRemaining,
    canPublish,
    canUseZoya: isPremium,
    canUseAdvancedAnalytics: effectivePlan === 'agency_scale',
    connectedAccountLimit: isPremium ? Infinity : 1
  };
}

module.exports = {
  getUserEntitlements,
  ADMIN_EMAIL
};
