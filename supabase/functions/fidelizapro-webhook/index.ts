import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface WebhookPayload {
  quote_id: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Auth check
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json() as WebhookPayload;
    if (!body.quote_id || typeof body.quote_id !== 'string') {
      return new Response(JSON.stringify({ error: 'quote_id is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch quote with client and seller info
    const { data: quote, error: quoteErr } = await supabase
      .from('quotes')
      .select('*')
      .eq('id', body.quote_id)
      .maybeSingle();

    if (quoteErr || !quote) {
      return new Response(JSON.stringify({ error: 'Quote not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Only send for confirmed sales with confirmed payment
    const validStatuses = ['approved'];
    if (!validStatuses.includes(quote.status || '')) {
      return new Response(JSON.stringify({ error: 'Quote is not approved. Current status: ' + quote.status }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (quote.payment_status !== 'pago') {
      return new Response(JSON.stringify({ error: 'Payment not confirmed. Current: ' + quote.payment_status }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get client details
    let clientData: Record<string, unknown> = {};
    if (quote.client_id) {
      const { data: client } = await supabase
        .from('clients')
        .select('*')
        .eq('id', quote.client_id)
        .maybeSingle();
      if (client) clientData = client;
    }

    // Get seller/salesperson details
    let vendedorId = quote.salesperson_id || quote.created_by || '';
    let vendedorNome = quote.salesperson || '';

    if (vendedorId) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name, user_id')
        .eq('user_id', vendedorId)
        .maybeSingle();
      if (profile) {
        vendedorNome = profile.full_name || vendedorNome;
      }
    }

    // Build webhook payload
    const webhookPayload = {
      company_slug: 'mci',
      external_customer_id: quote.client_id || '',
      external_order_id: quote.id,
      cliente_nome: (clientData as any)?.company_name || (clientData as any)?.name || quote.client_name || '',
      cliente_email: (clientData as any)?.email || '',
      cliente_telefone: (clientData as any)?.phone || '',
      cliente_documento: (clientData as any)?.cpf_cnpj || '',
      valor_compra: quote.total_amount || quote.total || 0,
      data_compra: quote.quote_date || new Date().toISOString().split('T')[0],
      status_pedido: quote.status,
      status_pagamento: quote.payment_status,
      vendedor_id: vendedorId,
      vendedor_nome: vendedorNome,
    };

    // Check if FidelizaPRO URL is configured
    const fidelizaUrl = Deno.env.get('FIDELIZAPRO_WEBHOOK_URL');
    const fidelizaSecret = Deno.env.get('FIDELIZAPRO_WEBHOOK_SECRET');

    if (!fidelizaUrl) {
      // URL not configured yet — return payload preview
      return new Response(JSON.stringify({
        success: false,
        message: 'FIDELIZAPRO_WEBHOOK_URL not configured. Payload preview below.',
        payload: webhookPayload,
      }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Send to FidelizaPRO
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (fidelizaSecret) {
      headers['x-webhook-secret'] = fidelizaSecret;
    }

    const response = await fetch(fidelizaUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(webhookPayload),
    });

    const responseText = await response.text();

    if (!response.ok) {
      console.error('FidelizaPRO error:', response.status, responseText);
      return new Response(JSON.stringify({
        success: false,
        error: 'FidelizaPRO returned error',
        status: response.status,
      }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({
      success: true,
      message: 'Dados enviados ao FidelizaPRO com sucesso',
      fideliza_response: responseText,
    }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Webhook error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
