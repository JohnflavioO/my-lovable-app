/**
 * Freight computation helpers — Fase 1
 * -----------------------------------------------------------
 * Consolida peso, dimensões e volumes dos itens de um orçamento
 * a partir do cadastro de produtos.
 *
 * Arquitetura preparada para evolução:
 *  - Fase 1: iframe Jamef + card com dados prontos para copiar
 *  - Fase 2: postMessage → auto-preencher o iframe
 *  - Fase 3: integração API nativa (Jamef, Jadlog, Braspress, Correios…)
 *
 * A função `buildFreightData` retorna sempre o mesmo shape,
 * independente de como o backend de frete será consumido.
 */

export interface FreightItemProduct {
  peso_kg?: number | string | null;
  altura_cm?: number | string | null;
  largura_cm?: number | string | null;
  comprimento_cm?: number | string | null;
  peso_cubado?: number | string | null;
  volume_m3?: number | string | null;
  origem_cep?: string | null;
  embalagem_tipo?: string | null;
}

export interface FreightItemInput {
  product_code?: string;
  model?: string;
  description?: string;
  quantity: number | string;
  unit_price?: number | string;
  // dims manualmente sobrepostos no orçamento (opcional)
  override?: Partial<FreightItemProduct>;
  // dados do produto vindos do cadastro
  product?: FreightItemProduct | null;
  // indica se o item está vinculado à Loja Integrada mas sem dados logísticos
  vinculado_sem_dados?: boolean;
}

export interface FreightItemComputed {
  descricao: string;
  quantidade: number;
  peso_unit_kg: number;
  peso_total_kg: number;
  altura_cm: number;
  largura_cm: number;
  comprimento_cm: number;
  volume_unit_m3: number;
  volume_total_m3: number;
  peso_cubado_unit_kg: number;
  peso_cubado_total_kg: number;
  falta_dados: boolean;
}

export interface FreightData {
  cep_origem: string;
  cep_destino: string;
  valor_mercadoria: number;
  peso_total_kg: number;
  peso_cubado_total_kg: number;
  volume_total_m3: number;
  volumes_qtd: number;
  altura_cm: number; // dimensão consolidada = maior
  largura_cm: number;
  comprimento_cm: number;
  items: FreightItemComputed[];
  itens_sem_dados: number;
  itens_vinculados_sem_dados: number;
  itens_prontos_para_frete: number;
}

const num = (v: unknown, fallback = 0): number => {
  if (v === null || v === undefined || v === '') return fallback;
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : fallback;
};

/** Fator de cubagem padrão transportadora rodoviária = 300 kg/m³ */
export const CUBAGE_FACTOR = 300;

/** Calcula peso cubado (kg) a partir de dims em cm */
export function calcPesoCubado(altura: number, largura: number, comprimento: number, factor = CUBAGE_FACTOR): number {
  const vol = (altura * largura * comprimento) / 1_000_000; // m³
  return vol * factor;
}

/** Volume em m³ a partir de dims em cm */
export function calcVolumeM3(altura: number, largura: number, comprimento: number): number {
  return (altura * largura * comprimento) / 1_000_000;
}

function resolveDim(item: FreightItemInput): FreightItemProduct {
  const p = item.product ?? {};
  const o = item.override ?? {};
  return {
    peso_kg: o.peso_kg ?? p.peso_kg,
    altura_cm: o.altura_cm ?? p.altura_cm,
    largura_cm: o.largura_cm ?? p.largura_cm,
    comprimento_cm: o.comprimento_cm ?? p.comprimento_cm,
    peso_cubado: o.peso_cubado ?? p.peso_cubado,
    volume_m3: o.volume_m3 ?? p.volume_m3,
    origem_cep: o.origem_cep ?? p.origem_cep,
    embalagem_tipo: o.embalagem_tipo ?? p.embalagem_tipo,
  };
}

export function computeItem(item: FreightItemInput): FreightItemComputed {
  const dim = resolveDim(item);
  const qtd = Math.max(1, num(item.quantity, 1));
  const peso_unit = num(dim.peso_kg, 0);
  const altura = num(dim.altura_cm, 0);
  const largura = num(dim.largura_cm, 0);
  const comprimento = num(dim.comprimento_cm, 0);
  const volume_unit = num(dim.volume_m3, 0) || calcVolumeM3(altura, largura, comprimento);
  const cubado_unit = num(dim.peso_cubado, 0) || calcPesoCubado(altura, largura, comprimento);

  const falta_dados =
    peso_unit <= 0 || altura <= 0 || largura <= 0 || comprimento <= 0;

  return {
    descricao: item.model || item.description || item.product_code || '—',
    quantidade: qtd,
    peso_unit_kg: peso_unit,
    peso_total_kg: peso_unit * qtd,
    altura_cm: altura,
    largura_cm: largura,
    comprimento_cm: comprimento,
    volume_unit_m3: volume_unit,
    volume_total_m3: volume_unit * qtd,
    peso_cubado_unit_kg: cubado_unit,
    peso_cubado_total_kg: cubado_unit * qtd,
    falta_dados,
  };
}

export interface BuildFreightArgs {
  items: FreightItemInput[];
  cep_origem?: string;
  cep_destino?: string;
  valor_mercadoria?: number;
}

export function buildFreightData({
  items,
  cep_origem = '',
  cep_destino = '',
  valor_mercadoria = 0,
}: BuildFreightArgs): FreightData {
  const filtered = items.filter(i => (i.model || i.description || i.product_code) && num(i.quantity, 0) > 0);
  const computed = filtered.map(computeItem);

  const peso_total_kg = computed.reduce((s, i) => s + i.peso_total_kg, 0);
  const peso_cubado_total_kg = computed.reduce((s, i) => s + i.peso_cubado_total_kg, 0);
  const volume_total_m3 = computed.reduce((s, i) => s + i.volume_total_m3, 0);
  const volumes_qtd = computed.reduce((s, i) => s + i.quantidade, 0);

  const altura_cm = computed.reduce((m, i) => Math.max(m, i.altura_cm), 0);
  const largura_cm = computed.reduce((m, i) => Math.max(m, i.largura_cm), 0);
  const comprimento_cm = computed.reduce((m, i) => Math.max(m, i.comprimento_cm), 0);
  const itens_sem_dados = computed.filter(i => i.falta_dados).length;
  const itens_vinculados_sem_dados = computed.filter((i, idx) => i.falta_dados && filtered[idx]?.vinculado_sem_dados).length;
  const itens_prontos_para_frete = computed.filter(i => !i.falta_dados).length;

  return {
    cep_origem: (cep_origem || '').replace(/\D/g, '').slice(0, 8),
    cep_destino: (cep_destino || '').replace(/\D/g, '').slice(0, 8),
    valor_mercadoria: num(valor_mercadoria, 0),
    peso_total_kg,
    peso_cubado_total_kg,
    volume_total_m3,
    volumes_qtd,
    altura_cm,
    largura_cm,
    comprimento_cm,
    items: computed,
    itens_sem_dados,
    itens_vinculados_sem_dados,
    itens_prontos_para_frete,
  };
}

/** Formata como texto multi-linha pronto para colar no formulário Jamef */
export function freightToClipboardText(d: FreightData): string {
  const fmt = (n: number, dig = 2) => n.toLocaleString('pt-BR', { minimumFractionDigits: dig, maximumFractionDigits: dig });
  const cep = (c: string) => c ? c.replace(/^(\d{5})(\d{3})$/, '$1-$2') : '—';
  return [
    `CEP Origem: ${cep(d.cep_origem)}`,
    `CEP Destino: ${cep(d.cep_destino)}`,
    `Peso total: ${fmt(d.peso_total_kg)} kg`,
    `Peso cubado: ${fmt(d.peso_cubado_total_kg)} kg`,
    `Volume: ${fmt(d.volume_total_m3, 3)} m³`,
    `Volumes: ${d.volumes_qtd}`,
    `Dimensões (maiores): ${fmt(d.altura_cm, 1)} × ${fmt(d.largura_cm, 1)} × ${fmt(d.comprimento_cm, 1)} cm`,
    `Valor da mercadoria: R$ ${fmt(d.valor_mercadoria)}`,
  ].join('\n');
}

/** Query string para tentativa de auto-preencher iframe (best-effort) */
export function freightToQueryString(d: FreightData): string {
  const params = new URLSearchParams();
  if (d.cep_origem) params.set('cep_origem', d.cep_origem);
  if (d.cep_destino) params.set('cep_destino', d.cep_destino);
  if (d.peso_total_kg > 0) params.set('peso', d.peso_total_kg.toFixed(2));
  if (d.altura_cm > 0) params.set('altura', d.altura_cm.toFixed(0));
  if (d.largura_cm > 0) params.set('largura', d.largura_cm.toFixed(0));
  if (d.comprimento_cm > 0) params.set('comprimento', d.comprimento_cm.toFixed(0));
  if (d.valor_mercadoria > 0) params.set('valor_nota', d.valor_mercadoria.toFixed(2));
  if (d.volumes_qtd > 0) params.set('volumes', String(d.volumes_qtd));
  return params.toString();
}
