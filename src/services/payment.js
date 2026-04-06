const Stripe = require('stripe');
const paypal = require('paypal-rest-sdk');
const Subscription = require('../models/Subscription');
const TokenService = require('./token');
const Progression = require('../models/Progression');

// Initialize Stripe (lazy - only fails when actually used)
const stripe = process.env.STRIPE_SECRET_KEY && !process.env.STRIPE_SECRET_KEY.includes('pendiente')
  ? new Stripe(process.env.STRIPE_SECRET_KEY)
  : null;

// Initialize PayPal
if (process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_ID !== 'xxxxx') {
  paypal.configure({
    mode: process.env.PAYPAL_MODE || 'sandbox',
    client_id: process.env.PAYPAL_CLIENT_ID,
    client_secret: process.env.PAYPAL_CLIENT_SECRET,
  });
}

const TIER_CONFIG = {
  basic: {
    stripePriceId: process.env.STRIPE_BASIC_PRICE_ID,
    paypalPlanId: process.env.PAYPAL_BASIC_PLAN_ID,
    price: 9.99,
    maxLevel: 6,
    categories: ['adhd', 'depression', 'anxiety', 'sleep', 'focus'],
  },
  premium: {
    stripePriceId: process.env.STRIPE_PREMIUM_PRICE_ID,
    paypalPlanId: process.env.PAYPAL_PREMIUM_PLAN_ID,
    price: 19.99,
    maxLevel: 12,
    categories: ['adhd', 'depression', 'anxiety', 'trauma', 'sleep', 'focus', 'self_compassion', 'anger'],
  },
  pro: {
    stripePriceId: process.env.STRIPE_PRO_PRICE_ID,
    paypalPlanId: process.env.PAYPAL_PRO_PLAN_ID,
    price: 39.99,
    maxLevel: 12,
    categories: ['adhd', 'depression', 'anxiety', 'trauma', 'sleep', 'focus', 'self_compassion', 'anger'],
  },
};

const PaymentService = {
  // ===== STRIPE =====
  async createStripeCheckout(userId, email, tier) {
    const config = TIER_CONFIG[tier];
    if (!config) throw new Error('Invalid tier');

    const session = await stripe.checkout.sessions.create({
      customer_email: email,
      payment_method_types: ['card'],
      mode: 'subscription',
      line_items: [{
        price: config.stripePriceId,
        quantity: 1,
      }],
      metadata: { userId, tier },
      success_url: `${process.env.APP_URL}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.APP_URL}/payment/cancel`,
    });

    return { url: session.url, sessionId: session.id };
  },

  async handleStripeWebhook(rawBody, signature) {
    const event = stripe.webhooks.constructEvent(
      rawBody,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    );

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const { userId, tier } = session.metadata;
        const stripeSubscription = await stripe.subscriptions.retrieve(session.subscription);

        const sub = await Subscription.create({
          userId,
          tier,
          provider: 'stripe',
          providerSubId: stripeSubscription.id,
          providerCustomerId: session.customer,
          periodStart: new Date(stripeSubscription.current_period_start * 1000),
          periodEnd: new Date(stripeSubscription.current_period_end * 1000),
        });

        // Initialize progression
        await Progression.initForUser(userId);

        // Unlock categories based on tier
        const config = TIER_CONFIG[tier];
        for (const cat of config.categories) {
          await Progression.unlockCategory(userId, cat);
        }

        return { type: 'subscription_created', sub };
      }

      case 'invoice.paid': {
        const invoice = event.data.object;
        const sub = await Subscription.findByProviderId('stripe', invoice.subscription);
        if (sub) {
          await Subscription.renewPeriod(
            sub.id,
            new Date(invoice.period_start * 1000),
            new Date(invoice.period_end * 1000)
          );
        }
        return { type: 'subscription_renewed' };
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        const sub = await Subscription.findByProviderId('stripe', subscription.id);
        if (sub) {
          await Subscription.updateStatus(sub.id, 'cancelled');
          await TokenService.revokeBotTokens(sub.user_id);
        }
        return { type: 'subscription_cancelled' };
      }

      default:
        return { type: 'unhandled', eventType: event.type };
    }
  },

  // ===== PAYPAL =====
  async createPayPalSubscription(userId, tier) {
    const config = TIER_CONFIG[tier];
    if (!config) throw new Error('Invalid tier');

    return new Promise((resolve, reject) => {
      const billingAgreement = {
        name: `MindReprogram ${tier.charAt(0).toUpperCase() + tier.slice(1)}`,
        description: `Suscripcion ${tier} - Meditaciones guiadas para reprogramacion subconsciente`,
        start_date: new Date(Date.now() + 60000).toISOString(),
        plan: { id: config.paypalPlanId },
        payer: { payment_method: 'paypal' },
        override_merchant_preferences: {
          return_url: `${process.env.APP_URL}/api/payments/paypal/execute?userId=${userId}&tier=${tier}`,
          cancel_url: `${process.env.APP_URL}/payment/cancel`,
        },
      };

      paypal.billingAgreement.create(billingAgreement, (err, agreement) => {
        if (err) return reject(err);
        const approvalUrl = agreement.links.find(l => l.rel === 'approval_url');
        resolve({ url: approvalUrl.href, token: agreement.id });
      });
    });
  },

  async executePayPalSubscription(paymentToken, userId, tier) {
    return new Promise((resolve, reject) => {
      paypal.billingAgreement.execute(paymentToken, {}, async (err, agreement) => {
        if (err) return reject(err);

        const sub = await Subscription.create({
          userId,
          tier,
          provider: 'paypal',
          providerSubId: agreement.id,
          providerCustomerId: agreement.payer.payer_info.payer_id,
          periodStart: new Date(),
          periodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        });

        await Progression.initForUser(userId);
        const config = TIER_CONFIG[tier];
        for (const cat of config.categories) {
          await Progression.unlockCategory(userId, cat);
        }

        resolve(sub);
      });
    });
  },

  getTierConfig(tier) {
    return TIER_CONFIG[tier];
  },
};

module.exports = PaymentService;
