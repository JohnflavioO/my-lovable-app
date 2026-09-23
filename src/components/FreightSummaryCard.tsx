import { useState } from 'react';
import { Copy, Check, AlertTriangle, Package, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import type { FreightData } from '@/lib/freight';
import { freightToClipboardText } from '@/lib/freight';

export const CEP_ORIGEM_PRESETS = [
  { cep: '05305003', label: '05305-003 · SP' },
  { cep: '88310180', label: '88310-180 · SC' },
  { cep: '60025001', label: '60025-001 · CE' },
];

interface Props {
  data: FreightData;
  quoteNumber?: string;
  onCepOrigemChange?: (cep: string) => void;
}

const fmt = (n: number, dig = 2) =>
  n.toLocaleString('pt-BR', { minimumFractionDigits: dig, maximumFractionDigits: dig });
const fmtCep = (c: string) => (c ? c.replace(/^(\d{5})(\d{3})$/, '$1-$2') : '—');

export default function FreightSummaryCard({ data, quoteNumber, onCepOrigemChange }: Props) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const copy = async (key: string, text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      toast.success(`${label} copiado!`);
      setTimeout(() => setCopiedKey(null), 1500);
    } catch {
      toast.error('Não foi possível copiar. Copie manualmente.');
    }
  };

  const hasData =
    data.peso_total_kg > 0 || data.volumes_qtd > 0 || data.cep_destino || data.valor_mercadoria > 0;

  return (
    <div className="border-b bg-gradient-to-br from-primary/[0.03] to-transparent">
      <div className="px-4 py-3 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-sm font-semibold flex items-center gap-1.5">
              <Package className="h-4 w-4 text-primary" />
              Dados para Cotação
              {quoteNumber && (
                <span className="text-xs font-normal text-muted-foreground">· {quoteNumber}</span>
              )}
            </p>
            <p className="text-[11px] text-muted-foreground">
              Copie e cole no formulário abaixo, ou informe manualmente na Jamef.
            </p>
          </div>
          <Button
            size="sm"
            variant="default"
            className="gap-1.5 h-8"
            onClick={() => copy('all', freightToClipboardText(data), 'Resumo completo')}
            disabled={!hasData}
          >
            {copiedKey === 'all' ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            Copiar tudo
          </Button>
        </div>

        {(!data.cep_origem || data.cep_origem === '00000000') && (
          <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 dark:border-amber-800/60 dark:bg-amber-950/30 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            <span>Configure o CEP de origem em Configurações do Sistema.</span>
          </div>
        )}

        {!data.cep_destino && (
          <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 dark:border-amber-800/60 dark:bg-amber-950/30 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            <span>Cliente sem CEP cadastrado. Preencha o CEP para calcular o frete.</span>
          </div>
        )}

        {data.itens_sem_dados > 0 && (
          <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 dark:border-amber-800/60 dark:bg-amber-950/30 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            <div className="flex-1 flex flex-wrap items-center justify-between gap-2">
              <span>
                <strong>{data.itens_sem_dados}</strong> item(ns) sem peso ou dimensões cadastrados.
              </span>
              <a
                href="/produtos"
                target="_blank"
                rel="noreferrer"
                className="text-[11px] font-medium underline hover:no-underline"
              >
                Importar dados logísticos →
              </a>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
          {onCepOrigemChange ? (
            <div className="rounded-md border bg-background/60 px-2.5 py-1.5">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                CEP origem
              </p>
              <Select
                value={CEP_ORIGEM_PRESETS.some(p => p.cep === data.cep_origem) ? data.cep_origem : ''}
                onValueChange={(v) => onCepOrigemChange(v)}
              >
                <SelectTrigger className="h-7 mt-0.5 text-xs px-1 border-0 bg-transparent shadow-none focus:ring-0 font-semibold tabular-nums">
                  <SelectValue placeholder={fmtCep(data.cep_origem) !== '—' ? fmtCep(data.cep_origem) : 'Selecionar…'} />
                </SelectTrigger>
                <SelectContent>
                  {CEP_ORIGEM_PRESETS.map(p => (
                    <SelectItem key={p.cep} value={p.cep} className="text-xs">{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <Field label="CEP origem" value={fmtCep(data.cep_origem)} icon={<MapPin className="h-3 w-3" />} />
          )}
          <Field
            label="CEP destino"
            value={fmtCep(data.cep_destino)}
            icon={<MapPin className="h-3 w-3" />}
            onCopy={data.cep_destino ? () => copy('dest', data.cep_destino, 'CEP destino') : undefined}
            copied={copiedKey === 'dest'}
          />
          <Field label="Volumes" value={String(data.volumes_qtd || 0)} />
          <Field label="Peso total" value={`${fmt(data.peso_total_kg)} kg`} />
          <Field label="Peso cubado" value={`${fmt(data.peso_cubado_total_kg)} kg`} />
          <Field label="Volume" value={`${fmt(data.volume_total_m3, 3)} m³`} />
          <Field
            label="Dimensões (A×L×C)"
            value={`${fmt(data.altura_cm, 0)}×${fmt(data.largura_cm, 0)}×${fmt(data.comprimento_cm, 0)} cm`}
            onCopy={() =>
              copy(
                'dims',
                `${data.peso_total_kg.toFixed(2)} kg — ${data.altura_cm}×${data.largura_cm}×${data.comprimento_cm} cm`,
                'Peso/Dimensões',
              )
            }
            copied={copiedKey === 'dims'}
            className="col-span-2"
          />
          <Field
            label="Valor mercadoria"
            value={`R$ ${fmt(data.valor_mercadoria)}`}
          />
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  icon,
  onCopy,
  copied,
  className = '',
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
  onCopy?: () => void;
  copied?: boolean;
  className?: string;
}) {
  return (
    <div
      className={`rounded-md border bg-background/60 px-2.5 py-1.5 flex items-center justify-between gap-2 ${className}`}
    >
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground flex items-center gap-1">
          {icon}
          {label}
        </p>
        <p className="text-xs font-semibold tabular-nums truncate">{value}</p>
      </div>
      {onCopy && (
        <button
          type="button"
          onClick={onCopy}
          className="p-1 rounded hover:bg-muted transition-colors shrink-0"
          aria-label={`Copiar ${label}`}
        >
          {copied ? (
            <Check className="h-3.5 w-3.5 text-green-600" />
          ) : (
            <Copy className="h-3.5 w-3.5 text-muted-foreground" />
          )}
        </button>
      )}
    </div>
  );
}
