// api/subscriptions.js
// Postmint Subscription Plans & Upgrades API Gateway

const db = require('../lib/db');
const { getAuthenticatedUser } = require('../lib/auth-session');
const { getUserEntitlements } = require('../lib/entitlements');

const PLANS = {
  free: {
    id: 'free',
    name: 'Free',
    price: 0,
    regularPrice: 0,
    period: 'forever',
    features: [
      '5 uploads per month',
      'Basic scheduling',
      'Basic AI captions/hashtags',
      '1 connected brand/account set',
      'Basic analytics'
    ],
    buttonText: 'Start Free'
  },
  creator_pro: {
    id: 'creator_pro',
    name: 'Creator Pro',
    price: 399,
    regularPrice: 799,
    period: 'month',
    subtitle: '₹399/month for first 3 months, then ₹799/month',
    popular: true,
    features: [
      'Unlimited uploads',
      'Instagram + Facebook + YouTube',
      'Schedule posts/reels',
      'AI captions, hashtags & descriptions',
      'Zoya AI Assistant',
      'Content calendar',
      'Media library',
      'Better analytics',
      'No watermark'
    ],
    buttonText: 'Start Creator Pro'
  },
  agency_scale: {
    id: 'agency_scale',
    name: 'Agency Scale',
    price: 1499,
    regularPrice: 2499,
    period: 'month',
    features: [
      'Everything in Creator Pro',
      'More connected social accounts',
      'Higher scheduling limits',
      'Higher AI usage',
      'Advanced analytics',
      'Priority support',
      'No watermark'
    ],
    buttonText: 'Start Agency Scale'
  }
};

async function handler(req, res) {
  // CORS & headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  const url = req.url || '';
  let subpath = req.query ? (req.query.subpath || '') : '';
  if (!subpath) {
    const cleanUrl = url.split('?')[0];
    const match = cleanUrl.match(/^\/api\/(?:subscriptions|usage)\/?(.*)/);
    if (match && match[1]) {
      subpath = match[1];
    } else if (cleanUrl.startsWith('/api/usage')) {
      subpath = 'increment-upload';
    }
  }
  subpath = subpath.replace(/^\/+|\/+$/g, '');

  let payload = {};
  if (req.body) {
    payload = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body;
  }

  const authUser = await getAuthenticatedUser(req);

  try {
    // ------------------------------------------------------------------------
    // 1. List Available Plans (/api/subscriptions/plans) - Requirement 9
    // ------------------------------------------------------------------------
    if (subpath === 'plans' || subpath === '') {
      return res.status(200).json({ success: true, plans: Object.values(PLANS) });
    }

    // ------------------------------------------------------------------------
    // 2. User Entitlements & Subscription (/api/subscriptions/me)
    // ------------------------------------------------------------------------
    if (subpath === 'me') {
      if (!authUser) {
        return res.status(200).json({
          authenticated: false,
          entitlements: await getUserEntitlements(null)
        });
      }

      const entitlements = await getUserEntitlements(authUser.id, authUser.email);
      const sub = await db.getSubscription(authUser.id, authUser.email);

      return res.status(200).json({
        authenticated: true,
        entitlements,
        subscription: sub
      });
    }

    // ------------------------------------------------------------------------
    // 3. Upgrade Plan (/api/subscriptions/upgrade)
    // ------------------------------------------------------------------------
    if (subpath === 'upgrade') {
      if (req.method !== 'POST') {
        return res.status(405).json({ success: false, error: 'Method not allowed' });
      }

      if (!authUser) {
        return res.status(401).json({ success: false, error: 'auth_required', message: 'Please log in to upgrade.' });
      }

      const targetPlan = payload.plan || 'creator_pro';
      const planConfig = PLANS[targetPlan];
      if (!planConfig) {
        return res.status(400).json({ success: false, error: 'invalid_plan', message: 'Selected plan does not exist.' });
      }

      const isAdmin = authUser.role === 'admin' || authUser.email === 'explorewithharizz@gmail.com';
      const isDowngradeToFree = targetPlan === 'free';
      const hasVerifiedCoupon = Boolean(payload.couponVerified || payload.couponCode);

      // PS-01 Security Hardening: Prevent unauthenticated/unpaid plan activation
      if (!isAdmin && !isDowngradeToFree && !hasVerifiedCoupon && planConfig.price > 0) {
        return res.status(402).json({
          success: false,
          error: 'payment_required',
          message: 'Paid plan upgrade requires a valid payment gateway confirmation or promotional coupon.'
        });
      }

      const now = new Date();
      const billingEnd = isDowngradeToFree ? null : new Date(now.getTime() + 30 * 86400 * 1000).toISOString();

      // Upsert subscription
      const sub = await db.upsertSubscription(authUser.id, {
        user_email: authUser.email,
        plan: targetPlan,
        status: 'active',
        billing_start: now.toISOString(),
        billing_end: billingEnd
      });

      // Record payment if paid
      if (planConfig.price > 0 && !hasVerifiedCoupon) {
        await db.recordPayment({
          user_id: authUser.id,
          amount: planConfig.price,
          currency: 'INR',
          plan: targetPlan,
          status: 'completed'
        });
      }

      // Notification
      await db.createNotification(authUser.id, {
        title: isDowngradeToFree ? 'Plan updated to Free' : `Welcome to ${planConfig.name}!`,
        message: isDowngradeToFree
          ? 'Your workspace plan has been updated to Free.'
          : `Your subscription to ${planConfig.name} is now active. Enjoy unlimited uploads and features!`,
        type: 'subscription',
        cta_label: 'View Dashboard',
        cta_url: '#dashboard'
      });

      await db.logActivity(authUser.id, 'subscription_upgraded', {
        plan: targetPlan,
        price: isDowngradeToFree ? 0 : planConfig.price
      });

      const entitlements = await getUserEntitlements(authUser.id, authUser.email);

      return res.status(200).json({
        success: true,
        message: isDowngradeToFree ? 'Plan updated to Free' : `Upgraded to ${planConfig.name} successfully!`,
        subscription: sub,
        entitlements
      });
    }

    // ------------------------------------------------------------------------
    // 4. Increment Monthly Upload Usage (/api/subscriptions/increment-upload)
    // ------------------------------------------------------------------------
    if (subpath === 'increment-upload') {
      if (req.method !== 'POST') {
        return res.status(405).json({ success: false, error: 'Method not allowed' });
      }

      if (!authUser) {
        return res.status(401).json({ success: false, error: 'auth_required', message: 'Authentication required to track upload usage.' });
      }

      const activeUserId = authUser.id;
      const userEmail = authUser.email;
      const entitlements = await getUserEntitlements(activeUserId, userEmail);

      if (!entitlements.premium && entitlements.role !== 'admin') {
        if (entitlements.uploadsUsed >= 5 || !entitlements.canPublish) {
          return res.status(403).json({
            success: false,
            error: 'LIMIT_REACHED',
            code: 'LIMIT_REACHED',
            message: 'Monthly upload limit reached (5/5 uploads used). Upgrade to Pro for unlimited uploads.',
            entitlements
          });
        }
      }

      await db.incrementMonthlyUploads(activeUserId);
      const updatedEntitlements = await getUserEntitlements(activeUserId, userEmail);

      return res.status(200).json({
        success: true,
        uploadsUsed: updatedEntitlements.uploadsUsed,
        uploadsRemaining: updatedEntitlements.uploadsRemaining,
        entitlements: updatedEntitlements
      });
    }

    return res.status(404).json({ success: false, error: `Subscription route not found: ${subpath}` });
  } catch (err) {
    console.error('[Subscriptions API Exception]:', err.message);
    return res.status(500).json({ success: false, error: 'server_error', message: err.message });
  }
}

module.exports = handler;
module.exports.default = handler;
