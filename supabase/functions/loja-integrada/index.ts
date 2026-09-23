import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const LOJA_INTEGRADA_API = 'https://api.awsli.com.br/v1';

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function maskKey(key: string): string {
  if (key.length <= 6) return '***';
  return key.slice(0, 3) + '***' + key.slice(-3);
}

function getEncryptionSecret(): string {
  const secret = Deno.env.get('LOVABLE_API_KEY');
  if (!secret) throw new Error('Encryption key is not configured');
  return secret;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  bytes.forEach((byte) => binary += String.fromCharCode(byte));
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}

async function getEncryptionKey(): Promise<CryptoKey> {
  const material = new TextEncoder().encode(getEncryptionSecret());
  const digest = await crypto.subtle.digest('SHA-256', material);
  return crypto.subtle.importKey('raw', digest, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

async function encryptText(value: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await getEncryptionKey();
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(value));
  return { iv: bytesToBase64(iv), data: bytesToBase64(new Uint8Array(encrypted)) };
}

async function decryptText(payload: { iv: string; data: string }) {
  const key = await getEncryptionKey();
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: base64ToBytes(payload.iv) },
    key,
    base64ToBytes(payload.data),
  );
  return new TextDecoder().decode(decrypted);
}

async function encryptCredentials(apiKey: string, applicationKey: string) {
  return {
    v: 1,
    alg: 'AES-GCM',
    api_key: await encryptText(apiKey),
    application_key: await encryptText(applicationKey),
  };
}

function hasEncryptedCredentials(config: any): boolean {
  const encrypted = config?.encrypted_credentials;
  return !!encrypted?.api_key?.iv && !!encrypted?.api_key?.data && !!encrypted?.application_key?.iv && !!encrypted?.application_key?.data;
}

async function getAuthenticatedAdmin(req: Request) {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    throw new Error('Unauthorized');
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } }
  );

  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) {
    throw new Error('Unauthorized');
  }

  const { data: isAdmin } = await supabase.rpc('is_admin');
  if (!isAdmin) {
    throw new Error('Forbidden: admin only');
  }

  return { supabase, userId: user.id };
}

function getServiceClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );
}

async function testConnection(apiKey: string, applicationKey: string) {
  console.log('[loja-integrada] Testing connection...');
  console.log(`[loja-integrada] API Key: ${maskKey(apiKey)}, App Key: ${maskKey(applicationKey)}`);

  const url = `${LOJA_INTEGRADA_API}/pedido?limit=1`;
  console.log(`[loja-integrada] Calling: GET ${url}`);

  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        'Authorization': `chave_api ${apiKey} aplicacao ${applicationKey}`,
        'Content-Type': 'application/json',
      },
    });
  } catch (fetchErr) {
    console.error('[loja-integrada] Network error:', fetchErr);
    return {
      ok: false,
      error: 'Erro de rede ao conectar com a Loja Integrada. Verifique sua conexão.',
      error_stage: 'network',
    };
  }

  console.log(`[loja-integrada] Response status: ${response.status}`);

  const responseText = await response.text();

  if (!response.ok) {
    console.error(`[loja-integrada] API error body: ${responseText.slice(0, 500)}`);

    if (response.status === 401) {
      return { ok: false, error: 'API Key inválida ou não autorizada pela Loja Integrada.', error_stage: 'authentication', http_status: 401 };
    }
    if (response.status === 403) {
      return { ok: false, error: 'Application Key inválida ou sem permissão.', error_stage: 'authorization', http_status: 403 };
    }
    if (response.status === 404) {
      return { ok: false, error: 'Endpoint da API não encontrado.', error_stage: 'endpoint', http_status: 404 };
    }
    return { ok: false, error: `Erro ${response.status} na API da Loja Integrada: ${responseText.slice(0, 200)}`, error_stage: 'api_call', http_status: response.status };
  }

  let data;
  try {
    data = JSON.parse(responseText);
  } catch {
    return { ok: false, error: 'Resposta inválida da Loja Integrada (não é JSON).', error_stage: 'parse' };
  }

  console.log(`[loja-integrada] Connection OK. Total orders: ${data.meta?.total_count ?? 0}`);
  return { ok: true, success: true, total_orders: data.meta?.total_count ?? 0 };
}

function mapStatus(situacao: string | undefined): string {
  if (!situacao) return 'draft';
  const s = situacao.toLowerCase();
  
  // Mapeamento para o CRM interno (draft, sent, approved, rejected)
  if (s.includes('aprovado') || s.includes('pago') || s.includes('separação') || 
      s.includes('enviado') || s.includes('entregue') || s.includes('concluído') || 
      s.includes('pronto') || s.includes('separado')) {
    return 'approved';
  }
  
  if (s.includes('cancelado') || s.includes('devolvido') || s.includes('extornado')) {
    return 'rejected';
  }
  
  if (s.includes('aguardando') || s.includes('pendente') || s.includes('análise')) {
    return 'sent';
  }
  
  return 'draft';
}

function mapPaymentMethod(method: string | undefined): string | null {
  if (!method) return null;
  const m = method.toLowerCase();
  if (m.includes('pix')) return 'pix';
  if (m.includes('cart') || m.includes('credito') || m.includes('crédito') || m.includes('débito') || m.includes('debito') || m.includes('visa') || m.includes('master') || m.includes('elo') || m.includes('amex')) return 'cartao';
  if (m.includes('boleto')) return 'boleto';
  return null;
}

async function fetchOrderDetails(apiKey: string, applicationKey: string, orderId: string) {
  try {
    const response = await fetch(`${LOJA_INTEGRADA_API}/pedido/${orderId}`, {
      headers: {
        'Authorization': `chave_api ${apiKey} aplicacao ${applicationKey}`,
        'Content-Type': 'application/json',
      },
    });
    if (!response.ok) {
      await response.text();
      return null;
    }
    return await response.json();
  } catch {
    return null;
  }
}

async function fetchStoredCredentials(serviceClient: any) {
  const { data: integration } = await serviceClient
    .from('integrations')
    .select('config, created_by, api_key, application_key')
    .eq('integration_name', 'loja_integrada')
    .maybeSingle();

  if (!integration) return null;

  if (hasEncryptedCredentials(integration.config)) {
    const encrypted = integration.config.encrypted_credentials;
    return {
      apiKey: await decryptText(encrypted.api_key),
      applicationKey: await decryptText(encrypted.application_key),
      createdBy: integration.created_by,
    };
  }

  // Legacy fallback: migrate plaintext columns into encrypted config
  if (integration.api_key && integration.application_key) {
    const nextConfig = {
      ...(integration.config || {}),
      encrypted_credentials: await encryptCredentials(integration.api_key, integration.application_key),
    };
    await serviceClient
      .from('integrations')
      .update({ config: nextConfig })
      .eq('integration_name', 'loja_integrada');
    return {
      apiKey: integration.api_key,
      applicationKey: integration.application_key,
      createdBy: integration.created_by,
    };
  }

  return null;
}

function buildQuoteData(
  orderData: any,
  externalId: string,
  clientId: string | null,
  userId: string,
  adminName: string,
  quoteNumber: string | null
) {
  const situacaoNome = orderData.situacao?.nome || orderData.situacao || '';
  const cliente = orderData.cliente || {};
  const clienteNome = cliente.nome || '';
  const clienteEmail = cliente.email || '';
  const clienteTelefone = cliente.telefone_principal || cliente.telefone_celular || '';
  const clienteCpfCnpj = cliente.cpf || cliente.cnpj || '';
  
  const money = (v: any) => Math.round(((parseFloat(v) || 0) + Number.EPSILON) * 100) / 100;
  const valorTotal = money(orderData.valor_total);
  const valorFrete = money(orderData.valor_envio);
  const valorDesconto = money(orderData.valor_desconto);
  const valorSubtotal = money(orderData.valor_subtotal) || money(valorTotal - valorFrete + valorDesconto);
  
  const dataCriacao = orderData.data_criacao;
  
  // Pagamentos
  const pagamentos = orderData.pagamentos || [];
  const isSplitPayment = pagamentos.length >= 2;
  
  const primeiroPagamento = pagamentos[0] || {};
  const pagamentoNome = primeiroPagamento.forma_pagamento?.nome || '';
  const parcelas = parseInt(primeiroPagamento.numero_parcelas) || 1;
  const pagamentoStatus = primeiroPagamento.situacao?.nome || '';
  
  // Envio
  const envios = orderData.envios || [];
  const primeiroEnvio = envios[0] || {};
  const formaEnvio = primeiroEnvio.forma_envio?.nome || '';
  const prazoEnvio = primeiroEnvio.prazo ? `${primeiroEnvio.prazo} dias` : '';
  const transportadora = primeiroEnvio.transportadora || '';
  
  // Endereço de entrega
  const enderecoEntrega = orderData.endereco_entrega || {};

  const notesParts: string[] = [];
  notesParts.push(`[Importado da Loja Integrada]`);
  notesParts.push(`Canal: Loja Integrada`);
  if (clienteEmail) notesParts.push(`Email: ${clienteEmail}`);
  if (clienteTelefone) notesParts.push(`Tel: ${clienteTelefone}`);
  if (clienteCpfCnpj) notesParts.push(`CPF/CNPJ: ${clienteCpfCnpj}`);
  if (orderData.numero_pedido_canal) notesParts.push(`Pedido canal: ${orderData.numero_pedido_canal}`);
  
  if (isSplitPayment) {
    notesParts.push(`Pagamentos Mistos:`);
    pagamentos.forEach((p: any, idx: number) => {
      notesParts.push(`- Método ${idx + 1}: ${p.forma_pagamento?.nome} (${p.numero_parcelas}x) - R$ ${p.valor}`);
    });
  } else if (pagamentoNome) {
    notesParts.push(`Pagamento: ${pagamentoNome} (${parcelas}x) - ${pagamentoStatus}`);
  }
  
  if (formaEnvio) notesParts.push(`Envio: ${formaEnvio} via ${transportadora}`);
  if (orderData.observacao) notesParts.push(`Obs Pedido: ${orderData.observacao}`);

  const mappedStatus = mapStatus(situacaoNome);
  const orderCreatedAt = dataCriacao 
    ? new Date(new Date(dataCriacao).getTime() - 3 * 60 * 60 * 1000).toISOString().split('T')[0] 
    : new Date(new Date().getTime() - 3 * 60 * 60 * 1000).toISOString().split('T')[0];

  const quoteData: any = {
    quote_number: quoteNumber || `LI-${externalId}`,
    client_name: clienteNome || `Pedido #${externalId}`,
    client_id: clientId,
    salesperson: adminName,
    salesperson_id: userId,
    status: mappedStatus,
    total_amount: valorTotal,
    total: valorSubtotal,
    shipping_cost: valorFrete,
    discount: valorDesconto,
    payment_method: isSplitPayment ? null : (mapPaymentMethod(pagamentoNome) || 'pix'),
    payment_status: mappedStatus === 'approved' ? 'liquidado' : (mappedStatus === 'rejected' ? 'cancelado' : 'pendente'),
    payment_terms: pagamentoNome || 'Loja Integrada',
    installments: isSplitPayment ? 1 : Math.max(1, parcelas),
    payment_date: orderCreatedAt,
    shipping_method: formaEnvio || null,
    shipping_deadline: prazoEnvio || null,
    notes: notesParts.join('\n'),
    source: 'loja_integrada',
    external_order_id: externalId,
    external_status: situacaoNome,
    created_by: userId,
    quote_date: orderCreatedAt,
    is_reseller: false,
    is_split_payment: isSplitPayment,
    
    // Dados de endereço de entrega
    shipping_recipient: clienteNome,
    shipping_cep: enderecoEntrega.cep || null,
    shipping_address: enderecoEntrega.endereco || null,
    shipping_address_number: enderecoEntrega.numero || null,
    shipping_complement: enderecoEntrega.complemento || null,
    shipping_neighborhood: enderecoEntrega.bairro || null,
    shipping_city: enderecoEntrega.cidade || null,
    shipping_state: enderecoEntrega.estado || null,
    shipping_phone: clienteTelefone || null,
    use_alt_shipping_address: !!enderecoEntrega.endereco,
  };

  if (isSplitPayment) {
    quoteData.split_method_1 = mapPaymentMethod(pagamentos[0]?.forma_pagamento?.nome) || 'pix';
    quoteData.split_value_1 = parseFloat(pagamentos[0]?.valor) || 0;
    quoteData.split_date_1 = orderCreatedAt;
    quoteData.split_installments_1 = Math.max(1, parseInt(pagamentos[0]?.numero_parcelas) || 1);
    
    quoteData.split_method_2 = mapPaymentMethod(pagamentos[1]?.forma_pagamento?.nome) || 'pix';
    quoteData.split_value_2 = parseFloat(pagamentos[1]?.valor) || 0;
    quoteData.split_date_2 = orderCreatedAt;
    quoteData.split_installments_2 = Math.max(1, parseInt(pagamentos[1]?.numero_parcelas) || 1);
  }

  return quoteData;
}

async function findOrCreateClient(serviceClient: any, orderData: any, userId: string): Promise<string | null> {
  const cliente = orderData.cliente || {};
  const clienteNome = cliente.nome || '';
  const clienteEmail = cliente.email || '';
  const clienteTelefone = cliente.telefone_principal || cliente.telefone_celular || '';
  const clienteCpfCnpj = cliente.cpf || cliente.cnpj || '';
  const razaoSocial = cliente.razao_social || '';
  const tipo = cliente.tipo || (cliente.cnpj ? 'PJ' : 'PF');

  // Endereço de faturamento (mais comum para dados de cadastro do cliente)
  const endereco = orderData.endereco_faturamento || orderData.endereco_entrega || {};

  if (!clienteEmail && !clienteNome) return null;

  let clientId: string | null = null;

  // Tentar encontrar por email
  if (clienteEmail) {
    const { data: existingClient } = await serviceClient
      .from('clients')
      .select('id')
      .eq('email', clienteEmail)
      .maybeSingle();
    if (existingClient) clientId = existingClient.id;
  }

  // Tentar encontrar por CPF/CNPJ se não encontrou por email
  if (!clientId && clienteCpfCnpj) {
    const { data: existingClient } = await serviceClient
      .from('clients')
      .select('id')
      .eq('cpf_cnpj', clienteCpfCnpj)
      .maybeSingle();
    if (existingClient) clientId = existingClient.id;
  }

  const clientPayload = {
    name: clienteNome,
    email: clienteEmail || null,
    phone: clienteTelefone || null,
    cpf_cnpj: clienteCpfCnpj || null,
    company_name: razaoSocial || null,
    address: endereco.endereco || null,
    address_number: endereco.numero || null,
    complement: endereco.complemento || null,
    neighborhood: endereco.bairro || null,
    city: endereco.cidade || null,
    state: endereco.estado || null,
    cep: endereco.cep || null,
    updated_at: new Date().toISOString(),
    pipeline_stage: 'cliente',
  };

  if (clientId) {
    // Atualizar dados do cliente existente
    await serviceClient
      .from('clients')
      .update(clientPayload)
      .eq('id', clientId);
  } else {
    // Criar novo cliente
    const { data: newClient } = await serviceClient
      .from('clients')
      .insert({
        ...clientPayload,
        created_by: userId,
      })
      .select('id')
      .single();
    if (newClient) clientId = newClient.id;
  }

  return clientId;
}

async function upsertQuoteItems(serviceClient: any, quoteId: string, orderData: any) {
  const itens = orderData.itens || [];
  if (itens.length === 0) {
    console.log(`[loja-integrada] No items found for order ${orderData.numero}`);
    return;
  }

  // Delete old items and re-insert
  await serviceClient.from('quote_items').delete().eq('quote_id', quoteId);

  const quoteItems = itens.map((item: any, idx: number) => {
    const nome = item.nome || (item.produto && item.produto.nome) || `Item ${idx + 1}`;
    const sku = item.sku || (item.produto && item.produto.sku) || '';
    const quantidade = parseInt(item.quantidade) || 1;
    const precoVenda = parseFloat(item.preco_venda) || 0;
    const precoCheio = parseFloat(item.preco_cheio) || precoVenda;
    const descontoItem = precoCheio - precoVenda;
    const descontoPercent = precoCheio > 0 ? (descontoItem / precoCheio) * 100 : 0;
    
    return {
      quote_id: quoteId,
      item_number: idx + 1,
      description: nome,
      model: nome,
      brand: '',
      product_code: sku,
      quantity: quantidade,
      unit_price: precoVenda,
      discount_percent: Math.round(descontoPercent * 100) / 100,
      unit_total: precoVenda,
      line_total: precoVenda * quantidade,
      specifications: item.variacao || '',
      image_url: item.produto?.imagem?.caminho || '',
      is_gift: false,
    };
  });

  const { error: itemsErr } = await serviceClient.from('quote_items').insert(quoteItems);
  if (itemsErr) {
    console.error(`[loja-integrada] Error upserting items for quote ${quoteId}:`, itemsErr.message);
  }
}

async function importAllOrders(
  serviceClient: any,
  userId: string,
  apiKey: string,
  applicationKey: string,
  isFullImport = false
) {
  console.log(`[loja-integrada] Starting ${isFullImport ? 'FULL' : 'INCREMENTAL'} sync...`);

  // Fetch integration config to get last sync markers
  const { data: integration } = await serviceClient
    .from('integrations')
    .select('config, last_sync_at')
    .eq('integration_name', 'loja_integrada')
    .maybeSingle();

  const lastSyncAt = integration?.last_sync_at;
  const config = integration?.config || {};
  const lastOrderDate = config.last_order_date;
  
  // A safety window: we'll check status updates for orders up to 24 hours before the last sync
  const safetyWindow = 24 * 60 * 60 * 1000; // 24 hours in ms
  const stopDate = !isFullImport && lastOrderDate 
    ? new Date(new Date(lastOrderDate).getTime() - safetyWindow)
    : null;

  const { data: adminProfile } = await serviceClient
    .from('profiles')
    .select('full_name')
    .eq('user_id', userId)
    .maybeSingle();
  const adminName = adminProfile?.full_name || 'Admin';

  let imported = 0;
  let updated = 0;
  let skipped = 0;
  let errors = 0;
  const limit = 20;
  
  // Logic update: Since Loja Integrada API might ignore ordering and return oldest first,
  // we fetch from the end (offset = total_count - limit) and work backwards.
  
  // 1. Get total count first
  const initialResp = await fetch(`${LOJA_INTEGRADA_API}/pedido?limit=1`, {
    headers: {
      'Authorization': `chave_api ${apiKey} aplicacao ${applicationKey}`,
      'Content-Type': 'application/json',
    },
  });
  
  if (!initialResp.ok) {
    console.error(`[loja-integrada] Failed to get total count: ${initialResp.status}`);
    return { ok: false, error: 'Falha ao obter total de pedidos da Loja Integrada.' };
  }
  
  const initialData = await initialResp.json();
  const totalCount = initialData.meta?.total_count ?? 0;
  console.log(`[loja-integrada] Total orders found: ${totalCount}`);

  let offset = Math.max(0, totalCount - limit);
  let hasMore = totalCount > 0;
  let newestOrderDateFound: string | null = config.last_order_date || null;
  let newestOrderIdFound: string | null = config.last_order_id || null;

  while (hasMore) {
    console.log(`[loja-integrada] Fetching orders at offset ${offset}...`);

    let response: Response;
    try {
      response = await fetch(
        `${LOJA_INTEGRADA_API}/pedido?limit=${limit}&offset=${offset}`,
        {
          headers: {
            'Authorization': `chave_api ${apiKey} aplicacao ${applicationKey}`,
            'Content-Type': 'application/json',
          },
        }
      );
    } catch (fetchErr) {
      console.error(`[loja-integrada] Network error at offset ${offset}:`, fetchErr);
      errors++;
      break;
    }

    if (!response.ok) {
      const text = await response.text();
      console.error(`[loja-integrada] API error at offset ${offset}: ${response.status} ${text.slice(0, 200)}`);
      errors++;
      break;
    }

    const data = await response.json();
    const orders = data.objects || [];
    
    if (orders.length === 0) {
      hasMore = false;
      break;
    }

    // Process orders in this page (from newest to oldest within the page if we could, 
    // but here they are oldest to newest, so we process them all)
    // We reverse them to process newest first if we want to stop early
    const sortedOrders = [...orders].reverse();

    for (const order of sortedOrders) {
      const externalId = String(order.numero);
      const orderDateStr = order.data_criacao;
      const orderDate = new Date(orderDateStr);

      // Stop condition for incremental sync
      if (stopDate && orderDate < stopDate) {
        console.log(`[loja-integrada] Reached order ${externalId} from ${orderDateStr}, which is older than safety window (${stopDate.toISOString()}). Stopping sync.`);
        hasMore = false;
        break;
      }

      // Track the newest order found
      if (!newestOrderDateFound || orderDate > new Date(newestOrderDateFound)) {
        newestOrderDateFound = orderDateStr;
        newestOrderIdFound = externalId;
      }

      try {
        const detail = await fetchOrderDetails(apiKey, applicationKey, externalId);
        const orderData = detail || order;
        const situacaoNome = orderData.situacao?.nome || orderData.situacao || '';

        // Check if already exists
        const { data: existing } = await serviceClient
          .from('quotes')
          .select('id, external_status, status')
          .eq('external_order_id', externalId)
          .maybeSingle();

        if (existing) {
          // Update if status changed
          const newMappedStatus = mapStatus(situacaoNome);
          if (existing.external_status !== situacaoNome) {
            const updateData: Record<string, unknown> = {
              external_status: situacaoNome,
              updated_at: new Date().toISOString(),
            };
            // Only update CRM status if the order wasn't manually changed
            if (existing.status === mapStatus(existing.external_status)) {
              updateData.status = newMappedStatus;
              updateData.payment_status = newMappedStatus === 'approved' ? 'liquidado' : 'pendente';
            }

            await serviceClient.from('quotes').update(updateData).eq('id', existing.id);
            console.log(`[loja-integrada] Updated order ${externalId}: ${existing.external_status} -> ${situacaoNome}`);
            updated++;
          } else {
            skipped++;
            // Optimization: if we already have this order and we are doing incremental sync,
            // we might be able to stop if we are sure no older orders are missing.
            // But we keep going for now due to the safety window.
          }
          continue;
        }

        // New order - create
        const clientId = await findOrCreateClient(serviceClient, orderData, userId);
        const { data: quoteNumber } = await serviceClient.rpc('generate_quote_number');

        const quoteData = buildQuoteData(orderData, externalId, clientId, userId, adminName, quoteNumber);

        const { data: newQuote, error: insertErr } = await serviceClient
          .from('quotes')
          .insert(quoteData)
          .select('id')
          .single();

        if (insertErr) {
          console.error(`[loja-integrada] Error importing order ${externalId}:`, insertErr.message);
          errors++;
          continue;
        }

        if (newQuote) {
          await upsertQuoteItems(serviceClient, newQuote.id, orderData);
        }

        console.log(`[loja-integrada] Imported new order ${externalId} as quote ${quoteData.quote_number}`);
        imported++;
      } catch (orderErr) {
        console.error(`[loja-integrada] Error processing order ${externalId}:`, orderErr);
        errors++;
      }
    }

    if (!hasMore || offset === 0) break;

    // Move to previous page
    offset = Math.max(0, offset - limit);
    
    // Rate limiting: small delay between pages
    await new Promise(r => setTimeout(r, 500));
  }

  // Update integration status and markers
  const newConfig = {
    ...config,
    last_order_id: newestOrderIdFound || config.last_order_id,
    last_order_date: newestOrderDateFound || config.last_order_date,
    last_sync_stats: {
      imported,
      updated,
      skipped,
      errors,
      timestamp: new Date().toISOString()
    }
  };

  await serviceClient
    .from('integrations')
    .update({ 
      last_sync_at: new Date().toISOString(), 
      status: 'connected',
      config: newConfig
    })
    .eq('integration_name', 'loja_integrada');

  console.log(`[loja-integrada] Sync complete: ${imported} imported, ${updated} updated, ${skipped} unchanged, ${errors} errors`);

  return {
    ok: true,
    success: true,
    imported,
    updated,
    skipped,
    errors,
    last_order_id: newestOrderIdFound
  };
}

async function syncOrders(serviceClient: any, apiKey: string, applicationKey: string, page = 1) {
  const limit = 20;
  const offset = (page - 1) * limit;

  const response = await fetch(
    `${LOJA_INTEGRADA_API}/pedido?limit=${limit}&offset=${offset}&ordering=-data_criacao`,
    {
      headers: {
        'Authorization': `chave_api ${apiKey} aplicacao ${applicationKey}`,
        'Content-Type': 'application/json',
      },
    }
  );

  if (!response.ok) {
    const text = await response.text();
    console.error(`[loja-integrada] Sync fetch error ${response.status}: ${text}`);
    return { ok: false, error: `Erro ${response.status} ao buscar pedidos.`, error_stage: 'fetch_orders' };
  }

  const data = await response.json();
  const orders = data.objects || [];
  const totalCount = data.meta?.total_count ?? 0;

  await serviceClient
    .from('integrations')
    .update({ last_sync_at: new Date().toISOString(), status: 'connected' })
    .eq('integration_name', 'loja_integrada');

  return {
    ok: true,
    success: true,
    orders: orders.map((o: any) => ({
      id: o.numero,
      status: o.situacao?.nome || o.status,
      client_name: o.cliente?.nome || '',
      client_email: o.cliente?.email || '',
      total: o.valor_total,
      date: o.data_criacao,
    })),
    total_count: totalCount,
    page,
    has_more: offset + limit < totalCount,
  };
}

// ============= Product dimensions sync =============

function toNumberOrNull(v: any): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Extrai peso e dimensões do produto Loja Integrada.
 *
 * Na Loja Integrada, os dados físicos ficam na aba interna
 * "Qual é o tamanho da embalagem do produto?" e são expostos pela API
 * tanto no produto raiz quanto — mais comumente — no objeto
 * `produto_variacao_padrao` (variação padrão) ou na primeira
 * `produto_variacoes[]`.
 *
 * Mapeamento oficial:
 *   LI.peso           → CRM.peso_kg
 *   LI.altura         → CRM.altura_cm
 *   LI.largura        → CRM.largura_cm
 *   LI.profundidade   → CRM.comprimento_cm   (⚠ profundidade = comprimento)
 */
function pickFirst(...vals: any[]) {
  for (const v of vals) {
    const n = toNumberOrNull(v);
    if (n) return n;
  }
  return null;
}

function extractDims(raw: any) {
  if (!raw) return null;
  const variations: any[] = Array.isArray(raw.produto_variacoes) ? raw.produto_variacoes : [];
  const varPadrao = raw.produto_variacao_padrao || variations[0] || null;

  const peso = pickFirst(
    raw.peso, raw.peso_real, raw.weight,
    varPadrao?.peso, varPadrao?.peso_real,
    variations[0]?.peso,
  );
  const altura = pickFirst(
    raw.altura, raw.height,
    varPadrao?.altura, variations[0]?.altura,
  );
  const largura = pickFirst(
    raw.largura, raw.width,
    varPadrao?.largura, variations[0]?.largura,
  );
  // ⚠ profundidade da LI = comprimento no CRM
  const comprimento = pickFirst(
    raw.profundidade, raw.comprimento, raw.length, raw.depth,
    varPadrao?.profundidade, varPadrao?.comprimento,
    variations[0]?.profundidade, variations[0]?.comprimento,
  );

  if (!peso && !altura && !largura && !comprimento) return null;
  const volume_m3 = altura && largura && comprimento
    ? Number(((altura * largura * comprimento) / 1_000_000).toFixed(4))
    : null;
  const peso_cubado = volume_m3 ? Number((volume_m3 * 300).toFixed(3)) : null;
  return {
    peso_kg: peso, altura_cm: altura, largura_cm: largura, comprimento_cm: comprimento,
    volume_m3, peso_cubado,
    external_id: raw.id ? String(raw.id) : null,
  };
}

async function liGET(path: string, apiKey: string, applicationKey: string) {
  const url = `${LOJA_INTEGRADA_API}${path}`;
  const r = await fetch(url, {
    headers: {
      'Authorization': `chave_api ${apiKey} aplicacao ${applicationKey}`,
      'Content-Type': 'application/json',
    },
  });
  if (!r.ok) return null;
  try { return await r.json(); } catch { return null; }
}

// ---- Normalization + similarity helpers ----
function normalizeName(s: string | null | undefined): string {
  if (!s) return '';
  return s
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // strip accents
    .toLowerCase()
    .replace(/[\-\/\\_\.,;:()\[\]{}!?"'`]/g, ' ')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Dice bigram similarity (0..1), robust for product names
function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const bigrams = (s: string) => {
    const m = new Map<string, number>();
    for (let i = 0; i < s.length - 1; i++) {
      const bg = s.slice(i, i + 2);
      m.set(bg, (m.get(bg) || 0) + 1);
    }
    return m;
  };
  const ba = bigrams(a), bb = bigrams(b);
  let hits = 0;
  for (const [k, v] of ba) {
    const w = bb.get(k);
    if (w) hits += Math.min(v, w);
  }
  return (2 * hits) / (a.length - 1 + b.length - 1);
}

// Fetch ALL products from Loja Integrada (paginated). Cached per-invocation.
async function fetchAllLIProducts(apiKey: string, appKey: string, log?: (m: string) => void) {
  const all: any[] = [];
  const limit = 100;
  let offset = 0;
  for (let page = 0; page < 200; page++) { // cap 20k
    const list = await liGET(`/produto?limit=${limit}&offset=${offset}`, apiKey, appKey);
    const items = list?.objects || [];
    if (!items.length) break;
    all.push(...items);
    if (log) log(`Loja Integrada: página ${page + 1} carregada (${items.length}). Acumulado: ${all.length}.`);
    if (items.length < limit) break;
    offset += limit;
  }
  return all;
}

function hasAnyDim(o: any): boolean {
  return !!(o && (toNumberOrNull(o.peso) || toNumberOrNull(o.altura) || toNumberOrNull(o.largura) || toNumberOrNull(o.profundidade)));
}

async function enrichLIDetail(apiKey: string, appKey: string, item: any): Promise<any> {
  // Sempre garantimos que os campos internos "Tamanho da embalagem" sejam consultados,
  // pois no listing (/produto) a LI omite peso/altura/largura/profundidade.
  let base = item;
  if (!hasAnyDim(base)) {
    const detail = await liGET(`/produto/${item.id}`, apiKey, appKey);
    if (detail) base = detail;
  }
  // Sempre buscamos variações se ainda não há dims completas — os campos de embalagem
  // costumam viver no objeto de variação (mesmo em produtos sem grade).
  const dimsRoot = extractDims(base);
  const missing = !dimsRoot || !dimsRoot.peso_kg || !dimsRoot.altura_cm || !dimsRoot.largura_cm || !dimsRoot.comprimento_cm;
  if (missing) {
    const vars = await liGET(`/produto_variacao/?produto=${item.id}&limit=5`, apiKey, appKey);
    const objs = vars?.objects || [];
    if (objs.length) {
      base = { ...base, produto_variacoes: objs, produto_variacao_padrao: base?.produto_variacao_padrao || objs[0] };
    }
  }
  return base;
}

// Retorna qual fonte trouxe cada valor de dimensão — usado pela auditoria.
function extractDimsDetailed(raw: any) {
  const variations: any[] = Array.isArray(raw?.produto_variacoes) ? raw.produto_variacoes : [];
  const varPadrao = raw?.produto_variacao_padrao || variations[0] || null;
  const varFirst = variations[0] || null;
  const sources: Record<string, any> = {
    produto: { peso: toNumberOrNull(raw?.peso), altura: toNumberOrNull(raw?.altura), largura: toNumberOrNull(raw?.largura), profundidade: toNumberOrNull(raw?.profundidade ?? raw?.comprimento) },
    produto_variacao_padrao: varPadrao ? { peso: toNumberOrNull(varPadrao?.peso), altura: toNumberOrNull(varPadrao?.altura), largura: toNumberOrNull(varPadrao?.largura), profundidade: toNumberOrNull(varPadrao?.profundidade ?? varPadrao?.comprimento) } : null,
    'produto_variacoes[0]': varFirst && varFirst !== varPadrao ? { peso: toNumberOrNull(varFirst?.peso), altura: toNumberOrNull(varFirst?.altura), largura: toNumberOrNull(varFirst?.largura), profundidade: toNumberOrNull(varFirst?.profundidade ?? varFirst?.comprimento) } : null,
  };
  const dims = extractDims(raw);
  let fonte: string | null = null;
  for (const k of Object.keys(sources)) {
    const s = sources[k];
    if (s && (s.peso || s.altura || s.largura || s.profundidade)) { fonte = k; break; }
  }
  return { dims, fonte, sources, variacao_id: varPadrao?.id ? String(varPadrao.id) : (varFirst?.id ? String(varFirst.id) : null) };
}

type LIRef = {
  id: string;
  sku: string | null;
  code: string | null;      // some stores put internal code in "codigo" or "referencia"
  reference: string | null; // manufacturer ref
  name: string | null;
  normName: string;
};

function indexLI(products: any[]): LIRef[] {
  return products.map(p => {
    const name = p.nome || p.name || '';
    return {
      id: String(p.id),
      sku: p.sku ? String(p.sku).trim() : null,
      code: p.codigo ? String(p.codigo).trim() : null,
      reference: p.referencia ? String(p.referencia).trim() : null,
      name,
      normName: normalizeName(name),
    };
  });
}

type LIRefScored = LIRef & { score?: number };

function matchCRMProduct(
  crm: { id: string; name: string; sku: string | null; code: string | null; brand: string | null; loja_integrada_id: string | null },
  liIndex: LIRef[]
): { matched: LIRef | null; matched_by: string | null; candidates: LIRefScored[] } {
  // 1. External id already saved
  if (crm.loja_integrada_id) {
    const hit = liIndex.find(x => x.id === String(crm.loja_integrada_id));
    if (hit) return { matched: hit, matched_by: 'external_id', candidates: [] };
  }
  // 2. Internal code -> LI code / sku
  if (crm.code) {
    const c = crm.code.trim();
    const hits = liIndex.filter(x => (x.code && x.code === c) || (x.sku && x.sku === c));
    if (hits.length === 1) return { matched: hits[0], matched_by: 'code', candidates: [] };
    if (hits.length > 1) return { matched: null, matched_by: null, candidates: hits.slice(0, 3).map(x => ({ ...x, score: 1 })) };
  }
  // 3. SKU
  if (crm.sku) {
    const s = crm.sku.trim();
    const hits = liIndex.filter(x => (x.sku && x.sku === s) || (x.code && x.code === s));
    if (hits.length === 1) return { matched: hits[0], matched_by: 'sku', candidates: [] };
    if (hits.length > 1) return { matched: null, matched_by: null, candidates: hits.slice(0, 3).map(x => ({ ...x, score: 1 })) };
  }
  // 4. Reference / MPN (LI referencia)
  if (crm.brand) {
    const b = crm.brand.trim().toLowerCase();
    const hits = liIndex.filter(x => x.reference && x.reference.toLowerCase() === b);
    if (hits.length === 1) return { matched: hits[0], matched_by: 'reference', candidates: [] };
  }
  // 5. Fuzzy name similarity — auto-link at ≥ 0.95 with clear gap over #2
  const target = normalizeName(crm.name);
  if (target.length >= 4) {
    const scored = liIndex
      .map(x => ({ x, s: similarity(target, x.normName) }))
      .filter(o => o.s >= 0.5)
      .sort((a, b) => b.s - a.s);
    const top = scored[0];
    const second = scored[1];
    if (top && top.s >= 0.95 && (!second || top.s - second.s >= 0.05)) {
      return { matched: top.x, matched_by: 'name_exact', candidates: [] };
    }
    const top3 = scored.slice(0, 3).filter(o => o.s >= 0.6).map(o => ({ ...o.x, score: Number(o.s.toFixed(3)) }));
    if (top3.length) return { matched: null, matched_by: null, candidates: top3 };
  }
  return { matched: null, matched_by: null, candidates: [] };
}

const PROVIDER = 'loja_integrada';

async function upsertLink(serviceClient: any, row: {
  product_id: string; external_product_id: string; external_sku?: string | null; external_code?: string | null;
  external_name?: string | null; sync_status: string; match_source: string; candidates?: any;
}) {
  const payload = {
    provider: PROVIDER,
    last_sync_at: new Date().toISOString(),
    ...row,
  };
  const { error } = await serviceClient
    .from('product_external_links')
    .upsert(payload, { onConflict: 'product_id,provider' });
  if (error) console.error('[loja-integrada] upsertLink error:', error);
}

async function markLinkStatus(serviceClient: any, product_id: string, sync_status: string, extra: any = {}) {
  const { data: existing } = await serviceClient
    .from('product_external_links')
    .select('external_product_id')
    .eq('product_id', product_id).eq('provider', PROVIDER).maybeSingle();
  const payload: any = {
    product_id, provider: PROVIDER, sync_status,
    external_product_id: existing?.external_product_id || '',
    last_sync_at: new Date().toISOString(),
    ...extra,
  };
  if (!payload.external_product_id) delete payload.external_product_id; // avoid NOT NULL violation on 1st insert w/o match
  // Use upsert only when we have a real ext id; else insert-if-not-exists via delete+insert would be overkill.
  if (payload.external_product_id) {
    await serviceClient.from('product_external_links').upsert(payload, { onConflict: 'product_id,provider' });
  } else {
    // For not_found / needs_validation without ext id, use a placeholder we clearly recognize
    payload.external_product_id = `__unresolved__:${product_id}`;
    await serviceClient.from('product_external_links').upsert(payload, { onConflict: 'product_id,provider' });
  }
}

// ============ Auditoria detalhada de pendências ============
async function auditMissingDimensions(
  serviceClient: any,
  apiKey: string,
  applicationKey: string,
  limit = 500,
) {
  // Produtos que estão sem peso OU sem uma das dimensões
  const { data: prods, error } = await serviceClient
    .from('products')
    .select('id, name, sku, code, peso_kg, altura_cm, largura_cm, comprimento_cm, bloquear_atualizacao_logistica')
    .or('peso_kg.is.null,peso_kg.eq.0,altura_cm.is.null,altura_cm.eq.0,largura_cm.is.null,largura_cm.eq.0,comprimento_cm.is.null,comprimento_cm.eq.0')
    .limit(limit);
  if (error) return { ok: false, error: error.message };

  const ids = (prods || []).map((p: any) => p.id);
  const { data: links } = await serviceClient
    .from('product_external_links')
    .select('product_id, external_product_id, external_sku, external_name, sync_status')
    .eq('provider', PROVIDER)
    .in('product_id', ids);
  const linkByProduct = new Map<string, any>();
  for (const l of (links || [])) linkByProduct.set(l.product_id, l);

  const rows: any[] = [];
  const CONCURRENCY = 6;
  const queue = [...(prods || [])];

  async function processOne(p: any) {
    const link = linkByProduct.get(p.id);
    const row: any = {
      product_id: p.id, product_name: p.name, crm_code: p.code, crm_sku: p.sku,
      li_id: null, li_sku: null, li_name: null, variacao_id: null,
      peso: null, altura: null, largura: null, profundidade: null,
      fonte: null, motivo: null, sync_status: link?.sync_status || 'unlinked',
    };
    if (p.bloquear_atualizacao_logistica) {
      row.motivo = 'bloqueado_atualizacao_logistica';
      rows.push(row); return;
    }
    if (!link || String(link.external_product_id || '').startsWith('__unresolved__')) {
      row.motivo = link?.sync_status === 'needs_validation' ? 'aguardando_validacao' : (link?.sync_status === 'not_found' ? 'sem_correspondencia' : 'sem_vinculo');
      rows.push(row); return;
    }
    row.li_id = link.external_product_id;
    row.li_sku = link.external_sku;
    row.li_name = link.external_name;
    try {
      const detail = await liGET(`/produto/${link.external_product_id}`, apiKey, applicationKey);
      if (!detail) { row.motivo = 'erro_api'; rows.push(row); return; }
      const enriched = await enrichLIDetail(apiKey, applicationKey, detail);
      const det = extractDimsDetailed(enriched);
      row.variacao_id = det.variacao_id;
      row.fonte = det.fonte;
      const d = det.dims;
      row.peso = d?.peso_kg ?? null;
      row.altura = d?.altura_cm ?? null;
      row.largura = d?.largura_cm ?? null;
      row.profundidade = d?.comprimento_cm ?? null;
      if (!row.peso && !row.altura && !row.largura && !row.profundidade) {
        // ver se algum source retornou zero especificamente
        const anyZero = Object.values(det.sources).some((s: any) => s && (s.peso === 0 || s.altura === 0 || s.largura === 0 || s.profundidade === 0));
        row.motivo = anyZero ? 'valor_zero' : 'campo_ausente';
      } else if (!row.peso || !row.altura || !row.largura || !row.profundidade) {
        row.motivo = 'valor_parcial';
      } else {
        row.motivo = 'dados_completos_nao_persistidos';
      }
    } catch (e) {
      row.motivo = 'erro_api';
    }
    rows.push(row);
  }

  async function worker() { while (queue.length) { const p = queue.shift(); if (p) await processOne(p); } }
  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
  return { ok: true, total: rows.length, rows };
}



async function syncProductsDimensions(
  serviceClient: any,
  apiKey: string,
  applicationKey: string,
  opts: { product_ids?: string[]; all?: boolean; triggered_by?: string | null; triggered_by_name?: string | null }
) {
  const startedAt = Date.now();
  let q = serviceClient
    .from('products')
    .select('id, name, sku, code, brand, bloquear_atualizacao_logistica, company_id')
    .not('bloquear_atualizacao_logistica', 'is', true);

  if (opts.product_ids && opts.product_ids.length > 0) {
    q = q.in('id', opts.product_ids);
  } else if (!opts.all) {
    return { ok: false, error: 'Informe product_ids ou all=true' };
  }

  const { data: products, error } = await q.limit(2000);
  if (error) return { ok: false, error: error.message };

  console.log(`[loja-integrada] sync: ${products?.length || 0} produtos alvo`);

  // Load existing links (source of truth)
  const productIds = (products || []).map(p => p.id);
  const { data: existingLinks } = await serviceClient
    .from('product_external_links')
    .select('product_id, external_product_id, sync_status, match_source')
    .eq('provider', PROVIDER)
    .in('product_id', productIds);
  const linkByProduct = new Map<string, any>();
  for (const l of (existingLinks || [])) linkByProduct.set(l.product_id, l);

  // Load full LI catalog once
  const liRaw = await fetchAllLIProducts(apiKey, applicationKey);
  const liIndex = indexLI(liRaw);
  const liById = new Map<string, any>();
  for (const r of liRaw) liById.set(String(r.id), r);
  console.log(`[loja-integrada] LI catalog: ${liIndex.length}`);

  let updated = 0, linked = 0, notFound = 0, skipped = 0, errors = 0, needsReview = 0;
  const not_found_details: any[] = [];
  const needs_review_details: any[] = [];

  const CONCURRENCY = 10;
  const queue = [...(products || [])];

  async function processOne(p: any) {
    try {
      const existing = linkByProduct.get(p.id);
      let matched: LIRef | null = null;
      let matched_by: string | null = null;
      let candidates: LIRef[] = [];

      if (existing?.external_product_id && !String(existing.external_product_id).startsWith('__unresolved__')) {
        const hit = liIndex.find(x => x.id === String(existing.external_product_id));
        if (hit) {
          matched = hit;
          matched_by = existing.match_source || 'external_id';
        } else {
          await markLinkStatus(serviceClient, p.id, 'error', { external_name: p.name });
          errors++;
          return;
        }
      } else {
        const r = matchCRMProduct(
          { id: p.id, name: p.name, sku: p.sku, code: p.code, brand: p.brand, loja_integrada_id: null },
          liIndex
        );
        matched = r.matched; matched_by = r.matched_by; candidates = r.candidates;
      }

      if (!matched) {
        if (candidates.length > 1) {
          needsReview++;
          needs_review_details.push({ id: p.id, name: p.name, sku: p.sku, code: p.code, candidates });
          await markLinkStatus(serviceClient, p.id, 'needs_validation', {
            candidates: candidates.map((c: any) => ({ id: c.id, sku: c.sku, code: c.code, reference: c.reference, name: c.name, score: c.score ?? null })),
            external_name: p.name,
          });
        } else {
          notFound++;
          not_found_details.push({ id: p.id, name: p.name, sku: p.sku, code: p.code });
          await markLinkStatus(serviceClient, p.id, 'not_found', { external_name: p.name, candidates: null });
        }
        return;
      }

      await upsertLink(serviceClient, {
        product_id: p.id,
        external_product_id: matched.id,
        external_sku: matched.sku,
        external_code: matched.code,
        external_name: matched.name,
        sync_status: 'linked',
        match_source: matched_by || 'unknown',
        candidates: null,
      });
      linked++;

      const raw = await enrichLIDetail(apiKey, applicationKey, liById.get(matched.id));
      const dims = extractDims(raw);
      if (!dims) { skipped++; return; }

      const updatePayload: any = {
        peso_kg: dims.peso_kg,
        altura_cm: dims.altura_cm,
        largura_cm: dims.largura_cm,
        comprimento_cm: dims.comprimento_cm,
        volume_m3: dims.volume_m3,
        peso_cubado: dims.peso_cubado,
        loja_integrada_id: matched.id,
        loja_integrada_sync_source: 'loja_integrada',
        logistica_atualizada_em: new Date().toISOString(),
        needs_manual_link: false,
        sync_candidates: null,
      };
      for (const k of Object.keys(updatePayload)) {
        if (updatePayload[k] === null || updatePayload[k] === undefined) delete updatePayload[k];
      }
      const { error: upErr } = await serviceClient.from('products').update(updatePayload).eq('id', p.id);
      if (upErr) { errors++; return; }
      updated++;
    } catch (e) {
      console.error('[loja-integrada] sync error:', e);
      errors++;
    }
  }

  async function worker() {
    while (queue.length) {
      const p = queue.shift();
      if (!p) break;
      await processOne(p);
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));


  const summary = {
    ok: true,
    total: products?.length || 0,
    linked, updated, needs_review: needsReview, not_found: notFound,
    skipped, errors,
    li_catalog_size: liIndex.length,
    not_found_details: not_found_details.slice(0, 20),
    needs_review_details: needs_review_details.slice(0, 20),
  };

  // Log execution history
  try {
    await serviceClient.from('sync_execution_logs').insert({
      provider: PROVIDER,
      action: opts.all ? 'full_sync' : 'bulk_sync',
      triggered_by: opts.triggered_by || null,
      triggered_by_name: opts.triggered_by_name || null,
      targets_count: summary.total,
      updated_count: updated,
      linked_count: linked,
      needs_validation_count: needsReview,
      not_found_count: notFound,
      errors_count: errors,
      duration_ms: Date.now() - startedAt,
      summary,
    });
  } catch (e) { console.error('[loja-integrada] log write failed:', e); }

  return summary;
}

// Search LI catalog for manual mapping page
async function searchLIProducts(apiKey: string, appKey: string, term: string, limit = 20) {
  const all = await fetchAllLIProducts(apiKey, appKey);
  const idx = indexLI(all);
  const t = normalizeName(term);
  const scored = idx
    .map(x => {
      let score = 0;
      if (x.sku && x.sku.toLowerCase().includes(term.toLowerCase())) score += 0.6;
      if (x.code && x.code.toLowerCase().includes(term.toLowerCase())) score += 0.6;
      if (x.reference && x.reference.toLowerCase().includes(term.toLowerCase())) score += 0.4;
      score += similarity(t, x.normName);
      return { x, score };
    })
    .filter(o => o.score >= 0.35)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
  return scored.map(o => ({ ...o.x, score: Number(o.score.toFixed(2)) }));
}

async function linkProductManually(
  serviceClient: any, apiKey: string, appKey: string,
  productId: string, liId: string, userId?: string | null
) {
  const detail = await liGET(`/produto/${liId}`, apiKey, appKey);
  if (!detail?.id) return { ok: false, error: 'Produto não encontrado na Loja Integrada' };

  await upsertLink(serviceClient, {
    product_id: productId,
    external_product_id: String(detail.id),
    external_sku: detail.sku || null,
    external_code: detail.codigo || null,
    external_name: detail.nome || null,
    sync_status: 'linked',
    match_source: 'manual',
    candidates: null,
  });

  const dims = extractDims(detail);
  const payload: any = {
    loja_integrada_id: String(detail.id),
    loja_integrada_sync_source: 'manual',
    needs_manual_link: false,
    sync_candidates: null,
  };
  if (dims) {
    Object.assign(payload, {
      peso_kg: dims.peso_kg, altura_cm: dims.altura_cm,
      largura_cm: dims.largura_cm, comprimento_cm: dims.comprimento_cm,
      volume_m3: dims.volume_m3, peso_cubado: dims.peso_cubado,
      logistica_atualizada_em: new Date().toISOString(),
    });
    for (const k of Object.keys(payload)) if (payload[k] === null || payload[k] === undefined) delete payload[k];
  }
  const { error } = await serviceClient.from('products').update(payload).eq('id', productId);
  if (error) return { ok: false, error: error.message };

  try {
    await serviceClient.from('sync_execution_logs').insert({
      provider: PROVIDER, action: 'manual_link', triggered_by: userId || null,
      targets_count: 1, linked_count: 1, updated_count: dims ? 1 : 0,
      summary: { product_id: productId, li_id: String(detail.id), dims_synced: !!dims },
    });
  } catch {}

  return { ok: true, dims_synced: !!dims, li_product: { id: String(detail.id), name: detail.nome } };
}

async function unlinkProduct(serviceClient: any, productId: string, userId?: string | null) {
  const { error } = await serviceClient
    .from('product_external_links')
    .delete().eq('product_id', productId).eq('provider', PROVIDER);
  if (error) return { ok: false, error: error.message };
  await serviceClient.from('products').update({
    loja_integrada_id: null,
    loja_integrada_sync_source: null,
    needs_manual_link: false,
    sync_candidates: null,
  }).eq('id', productId);
  try {
    await serviceClient.from('sync_execution_logs').insert({
      provider: PROVIDER, action: 'unlink', triggered_by: userId || null,
      targets_count: 1, summary: { product_id: productId },
    });
  } catch {}
  return { ok: true };
}



const ActionSchema = z.object({
  action: z.enum(['test', 'save', 'sync', 'status', 'import', 'auto_sync', 'sync_product_dimensions', 'search_li_products', 'link_product', 'unlink_product', 'audit_missing_dimensions', 'reprocess_missing_only']),
  api_key: z.string().optional(),
  application_key: z.string().optional(),
  page: z.number().optional(),
  full: z.boolean().optional(),
  product_ids: z.array(z.string()).optional(),
  all_products: z.boolean().optional(),
  search_term: z.string().optional(),
  product_id: z.string().optional(),
  li_id: z.string().optional(),
});

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const parsed = ActionSchema.safeParse(body);
    if (!parsed.success) {
      return jsonResponse({ ok: false, error: 'Requisição inválida', details: parsed.error.flatten().fieldErrors }, 400);
    }

    const { action, api_key, application_key, page, full, product_ids, all_products, search_term, product_id, li_id } = parsed.data;

    // === AUTO_SYNC (called by cron, uses service role key from Authorization header) ===
    if (action === 'auto_sync') {
      const authHeader = req.headers.get('Authorization');
      const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
      const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
      
      const isAuthorized = (authHeader && serviceKey && authHeader.includes(serviceKey)) || 
                           (authHeader && anonKey && authHeader.includes(anonKey));

      if (!isAuthorized) {
        console.warn('[loja-integrada] auto_sync: Unauthorized attempt');
        return jsonResponse({ ok: false, error: 'Unauthorized' }, 401);
      }

      const serviceClient = getServiceClient();
      const creds = await fetchStoredCredentials(serviceClient);
      if (!creds) {
        console.log('[loja-integrada] Auto-sync: no credentials configured, skipping.');
        return jsonResponse({ ok: true, message: 'No credentials configured, skipping auto-sync.' });
      }

      // Auto-sync is always incremental (full=false)
      const result = await importAllOrders(serviceClient, creds.createdBy, creds.apiKey, creds.applicationKey, false);
      return jsonResponse(result);
    }

    // sync_product_dimensions is callable by any authenticated user (e.g. vendedor no orçamento)
    if (action === 'sync_product_dimensions') {
      const authHeader = req.headers.get('Authorization');
      if (!authHeader?.startsWith('Bearer ')) {
        return jsonResponse({ ok: false, error: 'Unauthorized' }, 401);
      }
      const userClient = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_ANON_KEY')!,
        { global: { headers: { Authorization: authHeader } } }
      );
      const { data: { user } } = await userClient.auth.getUser();
      if (!user) return jsonResponse({ ok: false, error: 'Unauthorized' }, 401);

      const serviceClient = getServiceClient();
      const creds = await fetchStoredCredentials(serviceClient);
      if (!creds) {
        return jsonResponse({ ok: false, error: 'Integração Loja Integrada não configurada.' });
      }
      const result = await syncProductsDimensions(serviceClient, creds.apiKey, creds.applicationKey, {
        product_ids, all: all_products,
        triggered_by: user.id, triggered_by_name: user.email || null,
      });
      return jsonResponse(result);
    }

    // Audit missing dimensions — authenticated user
    if (action === 'audit_missing_dimensions' || action === 'reprocess_missing_only') {
      const authHeader = req.headers.get('Authorization');
      if (!authHeader?.startsWith('Bearer ')) return jsonResponse({ ok: false, error: 'Unauthorized' }, 401);
      const userClient = createClient(
        Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!,
        { global: { headers: { Authorization: authHeader } } }
      );
      const { data: { user } } = await userClient.auth.getUser();
      if (!user) return jsonResponse({ ok: false, error: 'Unauthorized' }, 401);
      const serviceClient = getServiceClient();
      const creds = await fetchStoredCredentials(serviceClient);
      if (!creds) return jsonResponse({ ok: false, error: 'Integração Loja Integrada não configurada.' });

      if (action === 'audit_missing_dimensions') {
        const result = await auditMissingDimensions(serviceClient, creds.apiKey, creds.applicationKey, 800);
        return jsonResponse(result);
      }
      // reprocess_missing_only — pega produtos sem peso ou sem alguma dimensão e chama sync
      const { data: pend } = await serviceClient
        .from('products')
        .select('id')
        .or('peso_kg.is.null,peso_kg.eq.0,altura_cm.is.null,altura_cm.eq.0,largura_cm.is.null,largura_cm.eq.0,comprimento_cm.is.null,comprimento_cm.eq.0')
        .not('bloquear_atualizacao_logistica', 'is', true)
        .limit(2000);
      const ids = (pend || []).map((r: any) => r.id);
      if (ids.length === 0) return jsonResponse({ ok: true, total: 0, message: 'Nenhum produto pendente.' });
      const result = await syncProductsDimensions(serviceClient, creds.apiKey, creds.applicationKey, {
        product_ids: ids, triggered_by: user.id, triggered_by_name: user.email || null,
      });
      return jsonResponse({ ...result, reprocessed: true });
    }


    // Search & manual link require authenticated user
    if (action === 'search_li_products' || action === 'link_product' || action === 'unlink_product') {
      const authHeader = req.headers.get('Authorization');
      if (!authHeader?.startsWith('Bearer ')) return jsonResponse({ ok: false, error: 'Unauthorized' }, 401);
      const userClient = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_ANON_KEY')!,
        { global: { headers: { Authorization: authHeader } } }
      );
      const { data: { user } } = await userClient.auth.getUser();
      if (!user) return jsonResponse({ ok: false, error: 'Unauthorized' }, 401);

      const serviceClient = getServiceClient();
      const creds = await fetchStoredCredentials(serviceClient);
      if (!creds && action !== 'unlink_product') return jsonResponse({ ok: false, error: 'Integração Loja Integrada não configurada.' });

      if (action === 'search_li_products') {
        if (!search_term || search_term.trim().length < 2) {
          return jsonResponse({ ok: false, error: 'Informe um termo com pelo menos 2 caracteres.' });
        }
        const results = await searchLIProducts(creds!.apiKey, creds!.applicationKey, search_term.trim(), 25);
        return jsonResponse({ ok: true, results });
      }

      if (action === 'link_product') {
        if (!product_id || !li_id) return jsonResponse({ ok: false, error: 'product_id e li_id são obrigatórios.' });
        const result = await linkProductManually(serviceClient, creds!.apiKey, creds!.applicationKey, product_id, li_id, user.id);
        return jsonResponse(result);
      }

      if (action === 'unlink_product') {
        if (!product_id) return jsonResponse({ ok: false, error: 'product_id é obrigatório.' });
        const result = await unlinkProduct(serviceClient, product_id, user.id);
        return jsonResponse(result);
      }
    }

    // All other actions require authenticated admin
    const { supabase, userId } = await getAuthenticatedAdmin(req);

    // === STATUS ===
    if (action === 'status') {
      const serviceClient = getServiceClient();
      const { data } = await serviceClient
        .from('integrations')
        .select('status, last_sync_at, config, api_key, application_key')
        .eq('integration_name', 'loja_integrada')
        .maybeSingle();

      const hasCreds = hasEncryptedCredentials(data?.config) || !!(data?.api_key && data?.application_key);

      return jsonResponse({
        ok: true,
        connected: data?.status === 'connected',
        status: data?.status || 'disconnected',
        last_sync_at: data?.last_sync_at,
        config: data?.config || {},
        has_credentials: hasCreds,
      });
    }

    // === TEST ===
    if (action === 'test') {
      if (!api_key || !application_key) {
        return jsonResponse({ ok: false, error: 'API Key e Application Key são obrigatórias' });
      }
      const result = await testConnection(api_key, application_key);
      return jsonResponse(result);
    }

    // === SAVE ===
    if (action === 'save') {
      if (!api_key || !application_key) {
        return jsonResponse({ ok: false, error: 'API Key e Application Key são obrigatórias' });
      }

      const testResult = await testConnection(api_key, application_key);
      if (!testResult.ok) {
        return jsonResponse(testResult);
      }

      const serviceClient = getServiceClient();
      const existing = await serviceClient
        .from('integrations')
        .select('config')
        .eq('integration_name', 'loja_integrada')
        .maybeSingle();

      const nextConfig = {
        ...(existing.data?.config || {}),
        encrypted_credentials: await encryptCredentials(api_key, application_key),
      };

      const { error: upsertErr } = await serviceClient
        .from('integrations')
        .upsert({
          integration_name: 'loja_integrada',
          status: 'connected',
          config: nextConfig,
          created_by: userId,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'integration_name' });

      if (upsertErr) {
        console.error('[loja-integrada] Upsert error:', upsertErr.message);
        return jsonResponse({ ok: false, error: 'Erro ao salvar credenciais no banco de dados.' });
      }

      return jsonResponse({ ok: true, success: true, message: 'Integração salva com sucesso' });
    }

    // === SYNC (preview only) ===
    if (action === 'sync') {
      const serviceClient = getServiceClient();
      const creds = await fetchStoredCredentials(serviceClient);
      if (!creds) {
        return jsonResponse({ ok: false, error: 'Integração não configurada. Salve suas credenciais primeiro.' });
      }
      const result = await syncOrders(serviceClient, creds.apiKey, creds.applicationKey, page || 1);
      return jsonResponse(result);
    }

    // === IMPORT (incremental by default, unless full=true) ===
    if (action === 'import') {
      const serviceClient = getServiceClient();
      const creds = await fetchStoredCredentials(serviceClient);
      if (!creds) {
        return jsonResponse({ ok: false, error: 'Integração não configurada. Salve suas credenciais primeiro.' });
      }
      const result = await importAllOrders(serviceClient, userId, creds.apiKey, creds.applicationKey, full || false);
      return jsonResponse(result);
    }


    return jsonResponse({ ok: false, error: 'Ação desconhecida' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro interno';
    console.error('[loja-integrada] Unhandled error:', error);

    if (message === 'Unauthorized') {
      return jsonResponse({ ok: false, error: 'Não autorizado. Faça login novamente.' }, 401);
    }
    if (message.startsWith('Forbidden')) {
      return jsonResponse({ ok: false, error: 'Acesso restrito ao administrador.' }, 403);
    }

    return jsonResponse({ ok: false, error: message });
  }
});
