import { useState, useEffect, useMemo, useCallback } from 'react';
import AppLayout from '@/components/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { RefreshCw, Search, Package, AlertTriangle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

interface EstoqueItem {
  codigo: string;
  descricao: string;
  unidade: string;
  quantidade: number;
}

export default function EstoqueSC() {
  const [items, setItems] = useState<EstoqueItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const fetchEstoque = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke('estoque-sc');
      if (fnError) throw new Error(fnError.message);
      if (!data?.ok) throw new Error(data?.error ?? 'Erro desconhecido');
      setItems(data.items ?? []);
      setLastUpdated(data.timestamp ?? new Date().toISOString());
      const count = data.items?.length ?? 0;
      toast({
        title: count > 0 ? 'Estoque atualizado' : 'Estoque consultado',
        description: count > 0 ? `${count} produtos carregados.` : 'Nenhum produto encontrado.',
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao consultar estoque';
      setError(msg);
      toast({ title: 'Erro', description: msg, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchEstoque(); }, [fetchEstoque]);

  const filtered = useMemo(() => {
    if (!search) return items;
    const q = search.toLowerCase();
    return items.filter(i =>
      i.codigo.toLowerCase().includes(q) ||
      i.descricao.toLowerCase().includes(q)
    );
  }, [items, search]);

  const totalQtd = useMemo(() => filtered.reduce((s, i) => s + i.quantidade, 0), [filtered]);

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Estoque SC</h1>
            <p className="text-sm text-muted-foreground">Consulta em tempo real — Armazém Sanco</p>
            {lastUpdated && (
              <p className="text-xs text-muted-foreground mt-1">
                Atualizado: {new Date(lastUpdated).toLocaleString('pt-BR')}
              </p>
            )}
          </div>
          <Button onClick={fetchEstoque} disabled={loading} className="gap-2">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Atualizar estoque
          </Button>
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-center gap-3 p-4 rounded-lg bg-destructive/10 text-destructive border border-destructive/20">
            <AlertTriangle className="h-5 w-5 shrink-0" />
            <div>
              <p className="font-medium text-sm">Falha ao carregar estoque</p>
              <p className="text-xs">{error}</p>
            </div>
          </div>
        )}

        {/* Summary */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                <Package className="h-3.5 w-3.5" /> Total de Produtos
              </CardTitle>
            </CardHeader>
            <CardContent><p className="text-2xl font-bold">{filtered.length}</p></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                <Package className="h-3.5 w-3.5 text-green-500" /> Qtd. Disponível Total
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-green-600">
                {totalQtd.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Search */}
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por código ou descrição..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        <p className="text-sm text-muted-foreground">{filtered.length} produto(s)</p>

        {/* Table */}
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[100px]">Código</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead className="w-[80px] text-center">Unidade</TableHead>
                    <TableHead className="w-[120px] text-right">Quantidade</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading && items.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-12 text-muted-foreground">
                        <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2" />
                        Carregando estoque...
                      </TableCell>
                    </TableRow>
                  ) : filtered.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-12 text-muted-foreground">
                        {items.length === 0 ? 'Nenhum produto no estoque.' : 'Nenhum resultado para a busca.'}
                      </TableCell>
                    </TableRow>
                  ) : (
                    filtered.map((item) => (
                      <TableRow key={item.codigo}>
                        <TableCell className="font-mono font-medium">{item.codigo}</TableCell>
                        <TableCell>{item.descricao}</TableCell>
                        <TableCell className="text-center">{item.unidade}</TableCell>
                        <TableCell className="text-right font-bold tabular-nums">
                          {item.quantidade.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
