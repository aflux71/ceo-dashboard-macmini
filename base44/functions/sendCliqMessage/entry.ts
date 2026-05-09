import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { text, title } = await req.json();
    if (!text) {
      return Response.json({ error: 'Missing "text" in payload' }, { status: 400 });
    }

    const webhookUrl = Deno.env.get('ZOHO_CLIQ_WEBHOOK_URL');
    if (!webhookUrl) {
      return Response.json({ error: 'ZOHO_CLIQ_WEBHOOK_URL not configured' }, { status: 500 });
    }

    const body = title ? { text: `*${title}*\n${text}` } : { text };

    const cliqRes = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const responseText = await cliqRes.text();

    if (!cliqRes.ok) {
      return Response.json({ error: 'Cliq webhook failed', status: cliqRes.status, details: responseText }, { status: 502 });
    }

    return Response.json({ success: true, response: responseText });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});