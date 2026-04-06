const express = require('express');
const router = express.Router();
const PaymentService = require('../services/payment');
const { authenticate } = require('../middleware/auth');

// POST /api/payments/stripe/checkout
router.post('/stripe/checkout', authenticate, async (req, res, next) => {
  try {
    const { tier } = req.body;
    if (!['basic', 'premium', 'pro'].includes(tier)) {
      return res.status(400).json({ error: 'Tier invalido. Opciones: basic, premium, pro' });
    }

    const session = await PaymentService.createStripeCheckout(
      req.user.sub,
      req.user.email,
      tier
    );

    res.json({
      message: 'Redirige al usuario a la URL de Stripe',
      checkoutUrl: session.url,
      sessionId: session.sessionId,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/payments/webhook (Stripe webhooks - raw body)
router.post('/webhook', async (req, res, next) => {
  try {
    const signature = req.headers['stripe-signature'];
    if (!signature) {
      return res.status(400).json({ error: 'Missing stripe-signature header' });
    }

    const result = await PaymentService.handleStripeWebhook(req.body, signature);
    console.log('Stripe webhook processed:', result.type);

    res.json({ received: true });
  } catch (err) {
    console.error('Stripe webhook error:', err.message);
    res.status(400).json({ error: err.message });
  }
});

// POST /api/payments/paypal/create
router.post('/paypal/create', authenticate, async (req, res, next) => {
  try {
    const { tier } = req.body;
    if (!['basic', 'premium', 'pro'].includes(tier)) {
      return res.status(400).json({ error: 'Tier invalido' });
    }

    const result = await PaymentService.createPayPalSubscription(req.user.sub, tier);

    res.json({
      message: 'Redirige al usuario a PayPal para aprobar la suscripcion',
      approvalUrl: result.url,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/payments/paypal/execute (PayPal return URL)
router.get('/paypal/execute', async (req, res, next) => {
  try {
    const { token, userId, tier } = req.query;
    if (!token || !userId || !tier) {
      return res.status(400).json({ error: 'Parametros faltantes' });
    }

    await PaymentService.executePayPalSubscription(token, userId, tier);

    // Redirect to success page
    res.redirect(`${process.env.FRONTEND_URL}/payment/success`);
  } catch (err) {
    next(err);
  }
});

// GET /api/payments/plans
router.get('/plans', (req, res) => {
  res.json({
    plans: [
      {
        tier: 'basic',
        name: 'Basico',
        price: 9.99,
        currency: 'USD',
        features: [
          'Acceso niveles 1-6',
          'Meditaciones de 5 a 15 minutos',
          '5 categorias terapeuticas',
          'Progresion personalizada',
        ],
      },
      {
        tier: 'premium',
        name: 'Premium',
        price: 19.99,
        currency: 'USD',
        features: [
          'Acceso a todos los niveles (1-12)',
          'Meditaciones de 5 a 60 minutos',
          'Todas las categorias',
          'Voz personalizable',
          'Frecuencias binaurales',
        ],
      },
      {
        tier: 'pro',
        name: 'Pro',
        price: 39.99,
        currency: 'USD',
        features: [
          'Todo lo de Premium',
          'Bot terapeutico avanzado',
          'Sesiones personalizadas por IA',
          'Reportes de progreso detallados',
          'Acceso anticipado a nuevo contenido',
        ],
      },
    ],
  });
});

module.exports = router;
