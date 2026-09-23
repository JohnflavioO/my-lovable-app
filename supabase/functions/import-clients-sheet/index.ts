import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let current = '';
  let inQuotes = false;
  let row: string[] = [];
  
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') {
        current += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        row.push(current.trim());
        current = '';
      } else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && text[i + 1] === '\n') i++;
        row.push(current.trim());
        if (row.some(c => c !== '')) rows.push(row);
        row = [];
        current = '';
      } else {
        current += ch;
      }
    }
  }
  row.push(current.trim());
  if (row.some(c => c !== '')) rows.push(row);
  return rows;
}

function normalize(s: string): string {
  if (!s) return '';
  return s.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function findBestMatch(header: string, aliases: string[]): number {
  const h = normalize(header);
  if (!h) return -1;
  
  let bestScore = 0;
  
  for (const a of aliases) {
    const na = normalize(a);
    if (h === na) return 100;
    if (h.startsWith(na + ' ') || h.endsWith(' ' + na)) {
      bestScore = Math.max(bestScore, 80);
    }
    if (h.includes(na)) {
      bestScore = Math.max(bestScore, 60);
    }
    if (na.includes(h) && h.length > 2) {
      bestScore = Math.max(bestScore, 40);
    }
  }
  
  return bestScore;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  let userId: string | null = null;
  let receivedUrl: string = '';

  const logImport = async (status: string, message: string, count: number = 0, metadata: any = {}) => {
    if (userId) {
      try {
        await supabase.from('import_logs').insert({
          user_id: userId,
          type: 'clients',
          source_url: receivedUrl,
          status,
          message,
          records_count: count,
          metadata
        });
      } catch (e) {
        console.error('Failed to log import:', e);
      }
    }
  };

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ success: false, error: 'Não autorizado' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    
    if (authErr || !user) {
      return new Response(JSON.stringify({ success: false, error: 'Não autorizado' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    userId = user.id;

    const body = await req.json();
    receivedUrl = body.url || '';

    if (!receivedUrl || typeof receivedUrl !== 'string' || !receivedUrl.includes('docs.google.com/spreadsheets')) {
      const msg = 'URL inválida. Use um link de planilha Google.';
      await logImport('error', msg);
      return new Response(JSON.stringify({ success: false, error: msg }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const match = receivedUrl.match(/\/d\/([a-zA-Z0-9_-]+)/);
    if (!match) {
      const msg = 'Não foi possível extrair o ID da planilha.';
      await logImport('error', msg);
      return new Response(JSON.stringify({ success: false, error: msg }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const sheetId = match[1];
    const gidMatch = receivedUrl.match(/gid=(\d+)/);
    const gid = gidMatch ? gidMatch[1] : '0';

    const csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;
    console.log('[import-clients-sheet] Fetching CSV:', csvUrl);

    let response: Response;
    try {
      response = await fetch(csvUrl, { redirect: 'follow' });
    } catch (fetchErr) {
      console.error('[import-clients-sheet] Fetch error:', fetchErr);
      const msg = 'Não foi possível conectar ao Google Sheets. Verifique se a planilha é pública.';
      await logImport('error', msg);
      return new Response(JSON.stringify({ success: false, error: msg }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const contentType = response.headers.get('content-type') || '';
    if (!response.ok || contentType.includes('text/html')) {
      const msg = "Essa planilha não está compartilhada corretamente. Ative 'Qualquer pessoa com o link' nas configurações de compartilhamento.";
      await logImport('error', msg);
      return new Response(JSON.stringify({ success: false, error: msg }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const csvText = await response.text();

    if (csvText.trim().toLowerCase().startsWith('<!doctype') || csvText.trim().toLowerCase().startsWith('<html')) {
      const msg = "Essa planilha não está compartilhada corretamente. Ative 'Qualquer pessoa com o link'.";
      await logImport('error', msg);
      return new Response(JSON.stringify({ success: false, error: msg }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const rows = parseCSV(csvText);

    if (rows.length < 2) {
      const msg = 'A planilha parece estar vazia ou sem dados válidos.';
      await logImport('error', msg);
      return new Response(JSON.stringify({ success: false, error: msg }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Identify header row
    let headerRowIdx = 0;
    const allFieldAliases = [
      'razao social', 'razão social', 'empresa', 'cliente', 'nome', 'company',
      'cnpj', 'cpf', 'documento', 'cidade', 'telefone', 'email', 'endereço', 'bairro', 'cep', 'uf', 'contato'
    ];
    
    for (let i = 0; i < Math.min(rows.length, 5); i++) {
      let matchCount = 0;
      for (const cell of rows[i]) {
        const n = normalize(cell);
        if (allFieldAliases.some(a => n === a || n.includes(a))) {
          matchCount++;
        }
      }
      if (matchCount >= 2) {
        headerRowIdx = i;
        break;
      }
    }
    
    const headers = rows[headerRowIdx];

    const fieldMap: Record<string, string[]> = {
      company_name: ['razao social', 'razão social', 'empresa', 'company_name', 'nome da empresa', 'cliente', 'company', 'nome fantasia', 'nome', 'name', 'fantasia'],
      cpf_cnpj: ['cpf cnpj', 'cpf/cnpj', 'cpf_cnpj', 'cnpj', 'cpf', 'documento', 'doc'],
      city: ['cidade', 'city', 'municipio', 'localidade'],
      state: ['uf', 'estado', 'state', 'sigla'],
      phone: ['telefone', 'phone', 'tel', 'fone', 'celular', 'whatsapp', 'wpp'],
      email: ['email', 'e-mail', 'mail'],
      contact_name: ['contato', 'contact_name', 'responsável', 'responsavel', 'nome do contato', 'pessoa contato'],
      address: ['endereço', 'endereco', 'address', 'rua', 'logradouro', 'av', 'avenida', 'end'],
      address_number: ['número', 'numero', 'nº', 'n°', 'num', 'nr'],
      complement: ['complemento', 'complement', 'comp'],
      neighborhood: ['bairro', 'neighborhood', 'setor'],
      cep: ['cep', 'zip', 'codigo postal'],
      contact_phone: ['tel contato', 'telefone contato', 'celular contato'],
      contrib_icms: ['contrib icms', 'contribuinte icms', 'inscricao estadual', 'inscrição estadual', 'ie'],
      notes: ['observações', 'observacoes', 'obs', 'notes', 'notas', 'info'],
    };

    const colMap: Record<string, number> = {};
    const usedColumns = new Set<number>();
    
    // Exact matches
    for (const [field, aliases] of Object.entries(fieldMap)) {
      for (let idx = 0; idx < headers.length; idx++) {
        if (usedColumns.has(idx)) continue;
        const h = normalize(headers[idx]);
        if (aliases.some(a => normalize(a) === h)) {
          colMap[field] = idx;
          usedColumns.add(idx);
          break;
        }
      }
    }
    
    // Fuzzy matches
    for (const [field, aliases] of Object.entries(fieldMap)) {
      if (colMap[field] !== undefined) continue;
      
      let bestIdx = -1;
      let bestScore = 0;
      
      for (let idx = 0; idx < headers.length; idx++) {
        if (usedColumns.has(idx)) continue;
        const score = findBestMatch(headers[idx], aliases);
        if (score > bestScore) {
          bestScore = score;
          bestIdx = idx;
        }
      }
      
      if (bestIdx !== -1 && bestScore >= 40) {
        colMap[field] = bestIdx;
        usedColumns.add(bestIdx);
      }
    }

    await logImport('success', 'Planilha analisada com sucesso', rows.length - 1, {
      colMap,
      headers
    });

    return new Response(JSON.stringify({ 
      success: true, 
      headers,
      matched_columns: colMap,
      rows: rows.slice(headerRowIdx + 1)
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    console.error('[import-clients-sheet] Internal error:', error);
    await logImport('error', `Erro interno: ${errorMessage}`);
    return new Response(JSON.stringify({
      success: false,
      error: 'Erro interno ao processar a planilha.',
    }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});