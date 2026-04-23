import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? '';
const ADMIN_EMAIL    = 'support@vaultstoneholding.com';
const FROM_NOTIFY    = 'Vaultstone Bank <notifications@vaultstoneholding.com>';
const FROM_AUTH      = 'Vaultstone Bank <noreply@vaultstoneholding.com>';

const cors = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const body = await req.json();
    const { type } = body;

    let payload: Record<string, unknown>;

    if (type === 'contact') {
      const { firstName, lastName, email, phone, subject, message } = body;
      payload = {
        from:    FROM_NOTIFY,
        to:      [ADMIN_EMAIL],
        reply_to: email,
        subject: `[Contact Form] ${subject} — ${firstName} ${lastName}`,
        html: `
          <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;color:#1a1a2e;">
            <div style="background:#0d1117;padding:24px 32px;border-radius:8px 8px 0 0;">
              <h2 style="color:#C9A84C;margin:0;font-size:1.4rem;">New Contact Form Submission</h2>
            </div>
            <div style="background:#f9f9f9;padding:32px;border-radius:0 0 8px 8px;border:1px solid #e5e7eb;">
              <table style="width:100%;border-collapse:collapse;font-size:0.95rem;">
                <tr><td style="padding:8px 0;color:#6b7280;width:130px;"><strong>Name</strong></td><td style="padding:8px 0;">${firstName} ${lastName}</td></tr>
                <tr><td style="padding:8px 0;color:#6b7280;"><strong>Email</strong></td><td style="padding:8px 0;"><a href="mailto:${email}" style="color:#C9A84C;">${email}</a></td></tr>
                <tr><td style="padding:8px 0;color:#6b7280;"><strong>Phone</strong></td><td style="padding:8px 0;">${phone || '—'}</td></tr>
                <tr><td style="padding:8px 0;color:#6b7280;"><strong>Subject</strong></td><td style="padding:8px 0;">${subject}</td></tr>
              </table>
              <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0;" />
              <p style="color:#6b7280;font-size:0.85rem;margin-top:0;margin-bottom:8px;"><strong>Message:</strong></p>
              <p style="white-space:pre-wrap;background:#fff;padding:16px;border-radius:6px;border:1px solid #e5e7eb;margin:0;">${message}</p>
            </div>
            <p style="font-size:0.75rem;color:#9ca3af;text-align:center;margin-top:16px;">Vaultstone Bank — Automated Notification</p>
          </div>`,
      };

    } else if (type === 'otp') {
      const { email, code, name } = body;
      payload = {
        from:    FROM_AUTH,
        to:      [email],
        subject: 'Your Vaultstone verification code',
        html: `
          <div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;color:#1a1a2e;">
            <div style="background:#0d1117;padding:24px 32px;border-radius:8px 8px 0 0;text-align:center;">
              <h2 style="color:#C9A84C;margin:0;font-size:1.4rem;">Verify your account</h2>
            </div>
            <div style="background:#f9f9f9;padding:40px 32px;border-radius:0 0 8px 8px;border:1px solid #e5e7eb;text-align:center;">
              <p style="margin-top:0;color:#374151;">Hi${name ? ' ' + name : ''},</p>
              <p style="color:#374151;">Use the code below to complete your registration. It expires in <strong>10 minutes</strong>.</p>
              <div style="background:#0d1117;border-radius:8px;padding:24px;margin:24px 0;display:inline-block;min-width:200px;">
                <span style="font-size:2.2rem;font-weight:800;letter-spacing:0.35em;color:#C9A84C;font-family:monospace;">${code}</span>
              </div>
              <p style="color:#6b7280;font-size:0.875rem;">If you didn't request this, you can safely ignore this email.</p>
            </div>
            <p style="font-size:0.75rem;color:#9ca3af;text-align:center;margin-top:16px;">Vaultstone Bank &mdash; Secure Banking</p>
          </div>`,
      };

    } else if (type === 'welcome') {
      const { email, name } = body;
      payload = {
        from:    FROM_AUTH,
        to:      [email],
        subject: 'Welcome to Vaultstone Bank — your account is ready',
        html: `
          <div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#1a1a2e;">
            <div style="background:#0d1117;padding:28px 32px;border-radius:8px 8px 0 0;text-align:center;">
              <h1 style="color:#C9A84C;margin:0;font-size:1.6rem;letter-spacing:0.02em;">Vaultstone Bank</h1>
            </div>
            <div style="background:#f9f9f9;padding:40px 32px;border-radius:0 0 8px 8px;border:1px solid #e5e7eb;">
              <h2 style="margin-top:0;color:#0d1117;">Welcome, ${name ? name.split(' ')[0] : 'there'}!</h2>
              <p style="color:#374151;line-height:1.7;">Your Vaultstone Bank account has been successfully created. You now have access to institutional-grade banking from anywhere in the world.</p>
              <p style="color:#374151;line-height:1.7;"><strong>Next step:</strong> Complete your identity verification (KYC) to unlock full account features including transfers and card services.</p>
              <div style="text-align:center;margin:32px 0;">
                <a href="https://vaultstoneholding.com/kyc.html" style="background:#C9A84C;color:#0d1117;padding:14px 32px;border-radius:6px;text-decoration:none;font-weight:700;font-size:1rem;">Complete Verification →</a>
              </div>
              <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;" />
              <p style="color:#6b7280;font-size:0.85rem;margin:0;">Questions? Reply to this email or call us at 603 999 1425.</p>
            </div>
            <p style="font-size:0.75rem;color:#9ca3af;text-align:center;margin-top:16px;">Vaultstone Bank, N.A. &mdash; Member FDIC</p>
          </div>`,
      };

    } else {
      return new Response(JSON.stringify({ error: 'Unknown email type' }), {
        headers: { ...cors, 'Content-Type': 'application/json' },
        status: 400,
      });
    }

    const res = await fetch('https://api.resend.com/emails', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${RESEND_API_KEY}` },
      body:    JSON.stringify(payload),
    });

    const data = await res.json();

    return new Response(JSON.stringify(data), {
      headers: { ...cors, 'Content-Type': 'application/json' },
      status:  res.ok ? 200 : 400,
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      headers: { ...cors, 'Content-Type': 'application/json' },
      status:  500,
    });
  }
});
