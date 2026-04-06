const TokenService = require('../services/token');
const Subscription = require('../models/Subscription');

// Verify JWT and attach user to request
function authenticate(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token de acceso requerido' });
  }

  try {
    const token = header.split(' ')[1];
    const decoded = TokenService.verifyAccessToken(token);
    req.user = decoded;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expirado', code: 'TOKEN_EXPIRED' });
    }
    return res.status(401).json({ error: 'Token invalido' });
  }
}

// Require active subscription
function requireSubscription(minTier = 'basic') {
  const tierLevel = { basic: 1, premium: 2, pro: 3 };

  return async (req, res, next) => {
    try {
      const sub = await Subscription.findActiveByUser(req.user.sub);
      if (!sub) {
        return res.status(403).json({
          error: 'Suscripcion activa requerida',
          code: 'NO_SUBSCRIPTION',
        });
      }

      if (tierLevel[sub.tier] < tierLevel[minTier]) {
        return res.status(403).json({
          error: `Se requiere suscripcion ${minTier} o superior`,
          code: 'TIER_INSUFFICIENT',
          currentTier: sub.tier,
          requiredTier: minTier,
        });
      }

      req.subscription = sub;
      next();
    } catch (err) {
      next(err);
    }
  };
}

// Admin-only routes
function requireAdmin(req, res, next) {
  if (!req.user.isAdmin) {
    return res.status(403).json({ error: 'Acceso de administrador requerido' });
  }
  next();
}

module.exports = { authenticate, requireSubscription, requireAdmin };
