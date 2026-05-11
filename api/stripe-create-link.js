import Stripe from 'stripe';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  const adminPass = req.headers['x-admin-password'];
  if (!adminPass || adminPass !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'No autorizado' });
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    return res.status(500).json({ error: 'STRIPE_SECRET_KEY no configurado en Vercel' });
  }

  const { amount, clientName, slug, type = 'monthly' } = req.body || {};

  if (!amount || !clientName) {
    return res.status(400).json({ error: 'amount y clientName son requeridos' });
  }

  const amountCents = Math.round(parseFloat(amount) * 100);
  if (isNaN(amountCents) || amountCents <= 0) {
    return res.status(400).json({ error: 'Importe inválido' });
  }

  const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

  try {
    // 1. Crear producto
    const product = await stripe.products.create({
      name: `Hosting Dazenty — ${clientName}`,
      metadata: { client_slug: slug || '', created_by: 'dazenty-admin' },
    });

    // 2. Crear precio
    const priceParams = {
      product: product.id,
      unit_amount: amountCents,
      currency: 'eur',
    };

    if (type === 'monthly') {
      priceParams.recurring = { interval: 'month' };
    } else if (type === 'annual') {
      priceParams.recurring = { interval: 'year' };
    }
    // type === 'onetime' → sin recurring (pago único)

    const price = await stripe.prices.create(priceParams);

    // 3. Crear Payment Link
    const portalSuccessUrl = slug
      ? `https://dazenty.com/portal.html?id=${encodeURIComponent(slug)}&payment_done=1`
      : 'https://dazenty.com/portal.html?payment_done=1';

    const paymentLink = await stripe.paymentLinks.create({
      line_items: [{ price: price.id, quantity: 1 }],
      metadata: { client_slug: slug || '' },
      after_completion: {
        type: 'redirect',
        redirect: { url: portalSuccessUrl },
      },
    });

    return res.json({ url: paymentLink.url, id: paymentLink.id });
  } catch (err) {
    console.error('Stripe error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
