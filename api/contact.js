// api/contact.js — Serverless function: Vercel + Resend
export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { name, email, service, message } = req.body ?? {};

    // Validación básica
    if (!name || !email || !message) {
        return res.status(400).json({ error: 'Faltan campos obligatorios' });
    }

    // Anti-XSS: escapar valores antes de inyectarlos en el HTML del email
    const esc = (str) =>
        String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');

    try {
        const response = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                from: 'Dazenty Web <noreply@dazenty.com>',
                to: ['designerazenty@gmail.com'],
                reply_to: email,
                subject: `Nuevo Lead desde Web Dazenty — ${esc(name)}`,
                html: `
                    <h2 style="color:#1a1a1a">Nuevo mensaje de contacto</h2>
                    <p><strong>Nombre:</strong> ${esc(name)}</p>
                    <p><strong>Email:</strong> ${esc(email)}</p>
                    <p><strong>Servicio:</strong> ${esc(service || 'No especificado')}</p>
                    <p><strong>Mensaje:</strong></p>
                    <p style="white-space:pre-wrap">${esc(message)}</p>
                `,
            }),
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            console.error('Resend error:', err);
            return res.status(502).json({ error: 'Error al enviar el email' });
        }

        return res.status(200).json({ ok: true });
    } catch (err) {
        console.error('contact handler error:', err);
        return res.status(500).json({ error: 'Error interno del servidor' });
    }
}
