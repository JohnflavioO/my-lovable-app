import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Database, Wrench, Users, Package, Download, CheckCircle2, Save, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

const TECH_KEY = 'mci_tech_tracking_info';

function toCSV(rows: any[]): string {
  if (!rows.length) return '';
  const headers = Object.keys(rows[0]);
  const escape = (v: any) => {
    if (v === null || v === undefined) return '';
    const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
    return `"${s.replace(/"/g, '""')}"`;
  };
  return [headers.join(','), ...rows.map(r => headers.map(h => escape(r[h])).join(','))].join('\n');
}

function download(filename: string, content: string, mime = 'text/csv;charset=utf-8;') {
  const blob = new Blob(['\uFEFF' + content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

export default function SupportMaintenance() {
  const [busy, setBusy] = useState<string | null>(null);
  const [tech, setTech] = useState({ name: '', email: '', whatsapp: '' });

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(TECH_KEY) || '{}');
      setTech({ name: saved.name || '', email: saved.email || '', whatsapp: saved.whatsapp || '' });
    } catch {}
  }, []);

  const exportTable = async (key: string, table: string, label: string) => {
    setBusy(key);
    try {
      const { data, error } = await supabase.from(table as any).select('*');
      if (error) throw error;
      const rows = (data || []) as any[];
      if (!rows.length) { toast.info(`${label}: nenhum registro`); return; }
      download(`${table}-${new Date().toISOString().slice(0,10)}.csv`, toCSV(rows));
      toast.success(`${label} exportado (${rows.length} registros)`);
    } catch (e: any) {
      toast.error(e.message || 'Erro ao exportar');
    } finally {
      setBusy(null);
    }
  };

  const fullBackup = async () => {
    setBusy('full');
    try {
      const tables = ['technical_clients', 'technical_orders', 'technical_products', 'technical_purchase_orders', 'technical_purchase_order_items', 'technical_budgets', 'technical_services', 'technical_brands', 'technical_suppliers'];
      const dump: Record<string, any> = { generated_at: new Date().toISOString() };
      for (const t of tables) {
        const { data, error } = await supabase.from(t as any).select('*');
        if (error) throw error;
        dump[t] = data;
      }
      download(`mci-backup-${new Date().toISOString().slice(0,10)}.json`, JSON.stringify(dump, null, 2), 'application/json');
      toast.success('Backup completo gerado');
    } catch (e: any) {
      toast.error(e.message || 'Erro no backup');
    } finally {
      setBusy(null);
    }
  };

  const unifyParts = async () => {
    setBusy('unify');
    try {
      // Garante que peças sem marca/categoria definidas apareçam nas listagens
      const { data, error } = await supabase
        .from('technical_products' as any)
        .select('id, brand, category')
        .or('brand.is.null,category.is.null');
      if (error) throw error;
      const rows = (data || []) as any[];
      if (!rows.length) { toast.success('Nenhuma peça inconsistente encontrada'); return; }
      for (const r of rows) {
        await supabase.from('technical_products' as any).update({
          brand: r.brand || 'Geral',
          category: r.category || 'Peças',
        }).eq('id', r.id);
      }
      toast.success(`${rows.length} peça(s) padronizadas`);
    } catch (e: any) {
      toast.error(e.message || 'Erro na unificação');
    } finally {
      setBusy(null);
    }
  };

  const saveTech = () => {
    localStorage.setItem(TECH_KEY, JSON.stringify(tech));
    toast.success('Configurações salvas');
  };

  const Spinner = ({ k }: { k: string }) => busy === k ? <Loader2 className="h-4 w-4 animate-spin" /> : null;

  return (
    <div className="space-y-6 pb-10">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Manutenção e Segurança</h1>
        <p className="text-sm text-muted-foreground">Gerencie backups e segurança dos dados do sistema</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Backup de Dados */}
        <div className="rounded-xl border bg-card p-5 shadow-sm">
          <div className="flex items-start gap-3 mb-4">
            <div className="h-10 w-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center"><Database className="h-5 w-5" /></div>
            <div>
              <h2 className="font-semibold">Backup de Dados</h2>
              <p className="text-xs text-muted-foreground">Exportar dados para segurança</p>
            </div>
          </div>

          <div className="space-y-2">
            {[
              { k: 'clients', t: 'technical_clients', icon: Users, label: 'Clientes', desc: 'Exportar cadastro de clientes' },
              { k: 'orders', t: 'technical_orders', icon: Wrench, label: 'Ordens de Serviço', desc: 'Exportar histórico de serviços' },
              { k: 'stock', t: 'technical_products', icon: Package, label: 'Estoque', desc: 'Exportar todos os produtos' },
            ].map(item => (
              <button
                key={item.k}
                onClick={() => exportTable(item.k, item.t, item.label)}
                disabled={!!busy}
                className="w-full flex items-center gap-3 border rounded-lg p-3 hover:bg-muted/40 transition-colors text-left disabled:opacity-50"
              >
                <item.icon className="h-5 w-5 text-muted-foreground" />
                <div className="flex-1">
                  <div className="text-sm font-medium">{item.label}</div>
                  <div className="text-xs text-muted-foreground">{item.desc}</div>
                </div>
                {busy === item.k ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4 text-muted-foreground" />}
              </button>
            ))}
          </div>

          <Button onClick={fullBackup} disabled={!!busy} className="w-full mt-4 bg-[#0f1e3a] hover:bg-[#1a2d52] text-white gap-2">
            {busy === 'full' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Database className="h-4 w-4" />}
            Fazer Backup Completo do Sistema
          </Button>
        </div>

        {/* Ferramentas */}
        <div className="rounded-xl border bg-card p-5 shadow-sm">
          <div className="flex items-start gap-3 mb-4">
            <div className="h-10 w-10 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center"><Wrench className="h-5 w-5" /></div>
            <div>
              <h2 className="font-semibold">Ferramentas de Banco de Dados</h2>
              <p className="text-xs text-muted-foreground">Correções e manutenção estrutural</p>
            </div>
          </div>

          <button
            onClick={unifyParts}
            disabled={!!busy}
            className="w-full flex items-center gap-3 border rounded-lg p-3 hover:bg-muted/40 transition-colors text-left disabled:opacity-50"
          >
            <Database className="h-5 w-5 text-muted-foreground" />
            <div className="flex-1">
              <div className="text-sm font-medium">Unificar Tabelas de Peças</div>
              <div className="text-xs text-muted-foreground">Corrigir erro de peças Astera/Cream não aparecendo</div>
            </div>
            {busy === 'unify' ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
          </button>
        </div>
      </div>

      {/* Dados do Técnico */}
      <div className="rounded-xl border bg-card p-5 shadow-sm">
        <div className="flex items-start gap-3 mb-4">
          <div className="h-10 w-10 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center"><Users className="h-5 w-5" /></div>
          <div>
            <h2 className="font-semibold">Dados do Técnico (Rastreamento)</h2>
            <p className="text-xs text-muted-foreground">Estas informações aparecerão no link de rastreio para o cliente</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <Label className="text-xs font-semibold">Nome do Técnico</Label>
            <Input value={tech.name} onChange={e => setTech({ ...tech, name: e.target.value })} placeholder="Jonathan Ferreira" />
          </div>
          <div>
            <Label className="text-xs font-semibold">E-mail de Contato</Label>
            <Input type="email" value={tech.email} onChange={e => setTech({ ...tech, email: e.target.value })} placeholder="email@mcistore.com.br" />
          </div>
          <div>
            <Label className="text-xs font-semibold">WhatsApp (DDI+DDD+Número)</Label>
            <Input value={tech.whatsapp} onChange={e => setTech({ ...tech, whatsapp: e.target.value })} placeholder="5511999999999" />
          </div>
        </div>

        <div className="flex justify-end mt-4">
          <Button onClick={saveTech} className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2">
            <Save className="h-4 w-4" />
            Salvar Configurações
          </Button>
        </div>
      </div>
    </div>
  );
}
