// api/coupons.js
// Postmint Coupon Validation & Free Access Claim Engine

const db = require('../lib/db');
const { getAuthenticatedUser } = require('../lib/auth-session');
const { getUserEntitlements } = require('../lib/entitlements');

const PLAN_PRICES = {
  free: 0,
  creator_pro: 399,
  agency_scale: 1499
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
    const match = cleanUrl.match(/^\/api\/coupons\/?(.*)/);
    if (match) subpath = match[1];
  }
  subpath = subpath.replace(/^\/+|\/+$/g, '');

  let payload = {};
  if (req.body) {
    payload = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body;
  }

  let authUser = await getAuthenticatedUser(req);
  if (authUser && authUser.role === 'admin' && payload.userId) {
    const explicitUser = await db.findUserById(payload.userId);
    if (explicitUser) {
      authUser = explicitUser;
    }
  }
  const now = new Date();

  try {
    // ------------------------------------------------------------------------
    // 1. Validate Coupon (/api/coupons/validate) - Requirement 5 & 6
    // ------------------------------------------------------------------------
    if (subpath === 'validate' || subpath === '') {
      if (req.method !== 'POST') {
        return res.status(405).json({ success: false, error: 'Method not allowed' });
      }

      const rawCode = String(payload.code || '').trim().toUpperCase();
      const targetPlan = String(payload.plan || 'creator_pro').toLowerCase();
      const basePrice = PLAN_PRICES[targetPlan] !== undefined ? PLAN_PRICES[targetPlan] : 399;

      if (!rawCode) {
        return res.status(400).json({ success: false, error: 'coupon_invalid', message: 'Enter a coupon code.' });
      }

      const coupon = await db.getCouponByCode(rawCode);
      if (!coupon) {
        return res.status(404).json({ success: false, error: 'coupon_invalid', message: 'Coupon invalid. Check the code and try again.' });
      }

      if (!coupon.active) {
        return res.status(400).json({ success: false, error: 'coupon_invalid', message: 'Coupon invalid or deactivated.' });
      }

      // Check validity window
      if (coupon.valid_from && now < new Date(coupon.valid_from)) {
        return res.status(400).json({ success: false, error: 'coupon_not_started', message: 'Coupon is not yet active.' });
      }
      if (coupon.valid_until && now > new Date(coupon.valid_until)) {
        return res.status(400).json({ success: false, error: 'coupon_expired', message: 'Coupon expired.' });
      }

      // Check maximum global usage (if max_uses is set and > 0)
      if (coupon.max_uses !== null && coupon.max_uses !== undefined && Number(coupon.max_uses) > 0 && (coupon.uses_count || 0) >= Number(coupon.max_uses)) {
        return res.status(400).json({ success: false, error: 'usage_limit_reached', message: 'Coupon usage limit reached.' });
      }

      // Check per-user usage
      if (authUser) {
        const userRedemptions = await db.getUserCouponRedemptions(authUser.id);
        const matches = userRedemptions.filter(r => r.coupon_code === coupon.code || r.coupon_id === coupon.id);
        const userLimit = coupon.uses_per_user || 1;
        if (matches.length >= userLimit) {
          return res.status(400).json({ success: false, error: 'already_used', message: `You have already used coupon ${coupon.code}. Each user can claim this coupon once.` });
        }
      }

      // Check applicable plan
      const appPlan = coupon.applicable_plan || 'all';
      if (appPlan !== 'all' && appPlan !== targetPlan) {
        return res.status(400).json({
          success: false,
          error: 'invalid_plan',
          message: `Coupon is not valid for this plan. Applicable for ${appPlan.replace('_', ' ').toUpperCase()}.`
        });
      }

      // Calculate discount amount
      let discountAmount = 0;
      let finalPrice = basePrice;
      const isFree = coupon.discount_type === 'free' || Number(coupon.discount_value) >= 100;

      if (isFree) {
        discountAmount = basePrice;
        finalPrice = 0;
      } else if (coupon.discount_type === 'percentage') {
        const pct = Math.min(100, Math.max(0, Number(coupon.discount_value)));
        discountAmount = Math.round((basePrice * pct) / 100);
        finalPrice = Math.max(0, basePrice - discountAmount);
      } else if (coupon.discount_type === 'fixed') {
        discountAmount = Math.min(basePrice, Number(coupon.discount_value));
        finalPrice = Math.max(0, basePrice - discountAmount);
      }

      return res.status(200).json({
        success: true,
        valid: true,
        code: coupon.code,
        isFree,
        isFreeAccess: isFree,
        discountType: coupon.discount_type,
        discountValue: coupon.discount_value,
        basePrice,
        originalPrice: basePrice,
        discountAmount,
        finalPrice,
        premiumDurationDays: coupon.premium_duration_days || 14,
        buttonText: isFree ? 'Activate Creator Pro (100% Free) →' : `Pay ₹${finalPrice}`,
        coupon: {
          code: coupon.code,
          discountType: coupon.discount_type,
          discountValue: coupon.discount_value,
          isFree,
          isFreeAccess: isFree,
          basePrice,
          originalPrice: basePrice,
          discountAmount,
          finalPrice,
          premiumDurationDays: coupon.premium_duration_days || 14,
          buttonText: isFree ? 'Activate Creator Pro (100% Free) →' : `Pay ₹${finalPrice}`
        }
      });
    }

    // ------------------------------------------------------------------------
    // 2. Claim Free Access Coupon (/api/coupons/claim) - Requirement 7
    // ------------------------------------------------------------------------
    if (subpath === 'claim') {
      if (req.method !== 'POST') {
        return res.status(405).json({ success: false, error: 'Method not allowed' });
      }

      if (!authUser) {
        return res.status(401).json({
          success: false,
          error: 'auth_required',
          message: 'Please log in to claim this coupon.'
        });
      }

      const rawCode = String(payload.code || '').trim().toUpperCase();
      const targetPlan = String(payload.plan || 'creator_pro').toLowerCase();

      if (!rawCode) {
        return res.status(400).json({ success: false, error: 'missing_code', message: 'Coupon code is required.' });
      }

      const coupon = await db.getCouponByCode(rawCode);
      if (!coupon || !coupon.active) {
        return res.status(400).json({ success: false, error: 'coupon_invalid', message: 'Coupon invalid or deactivated.' });
      }

      if (coupon.valid_until && now > new Date(coupon.valid_until)) {
        return res.status(400).json({ success: false, error: 'coupon_expired', message: 'Coupon expired.' });
      }

      if (coupon.max_uses !== null && coupon.max_uses !== undefined && Number(coupon.max_uses) > 0 && (coupon.uses_count || 0) >= Number(coupon.max_uses)) {
        return res.status(400).json({ success: false, error: 'usage_limit_reached', message: 'Coupon usage limit reached.' });
      }

      const userRedemptions = await db.getUserCouponRedemptions(authUser.id);
      const matches = userRedemptions.filter(r => r.coupon_code === coupon.code || r.coupon_id === coupon.id);
      const userLimit = coupon.uses_per_user || 1;
      if (matches.length >= userLimit) {
        return res.status(400).json({ success: false, error: 'already_used', message: `You have already claimed coupon ${coupon.code}. Each user can claim this coupon once.` });
      }

      const durationDays = coupon.premium_duration_days || 14;
      const accessStart = now.toISOString();
      const accessEnd = new Date(now.getTime() + durationDays * 86400 * 1000).toISOString();
      const basePrice = PLAN_PRICES[targetPlan] || 399;

      // Record redemption in database
      const redemption = await db.recordCouponRedemption({
        coupon_id: coupon.id,
        coupon_code: coupon.code,
        user_id: authUser.id,
        user_email: authUser.email,
        discount_amount: basePrice,
        access_start: accessStart,
        access_end: accessEnd,
        plan: coupon.applicable_plan !== 'all' ? coupon.applicable_plan : targetPlan
      });

      // Update user subscription
      await db.upsertSubscription(authUser.id, {
        user_email: authUser.email,
        plan: redemption.plan,
        status: 'active',
        source: 'coupon',
        billing_start: accessStart,
        billing_end: accessEnd,
        promo_end: accessEnd
      });

      // Update user profile plan
      await db.updateUser(authUser.id, {
        plan: redemption.plan,
        effective_plan: redemption.plan
      });

      // Notification
      await db.createNotification(authUser.id, {
        title: '🎉 Premium Access Activated!',
        message: `Your ${durationDays}-day free trial of Creator Pro is now active. Enjoy unlimited uploads and Zoya AI!`,
        type: 'subscription',
        cta_label: 'Start Creating',
        cta_url: '#create'
      });

      await db.logActivity(authUser.id, 'coupon_claimed', {
        couponCode: coupon.code,
        plan: redemption.plan,
        durationDays
      });

      const entitlements = await getUserEntitlements(authUser.id, authUser.email);

      return res.status(200).json({
        success: true,
        message: `🎉 Free ${redemption.plan.replace('_', ' ').toUpperCase()} access activated for ${durationDays} days!`,
        plan: redemption.plan,
        premiumDurationDays: durationDays,
        accessStart,
        accessEnd,
        entitlements
      });
    }

    return res.status(404).json({ success: false, error: `Coupon route not found: ${subpath}` });
  } catch (err) {
    console.error('[Coupons API Exception]:', err.message);
    return res.status(500).json({ success: false, error: 'server_error', message: err.message });
  }
}

module.exports = handler;
module.exports.default = handler;
