import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';

export default function AppVersionAdmin() {
  const { isAdmin } = useAuth();
  const [version, setVersion] = useState('');
  const [force, setForce] = useState(false);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('system_settings').select('value').eq('key', 'app_version').maybeSingle();
      const v = data?.value as any;
      if (v) { setVersion(v.version || ''); setForce(!!v.force_update); setMessage(v.message || ''); }
    })();
  }, []);

  if (!isAdmin) return null;

  const save = async (bumpPatch = false) => {
    setLoading(true);
    let newVersion = version.trim() || '1.0.0';
    if (bumpPatch) {
      const parts = newVersion.split('.').map(n => parseInt(n) || 0);
      while (parts.length < 3) parts.push(0);
      parts[2] += 1;
      newVersion = parts.join('.');
    }
    const { error } = await supabase.from('system_settings').upsert({
      key: 'app_version',
      value: { version: newVersion, force_update: force, message } as any,
      updated_at: new Date().toISOString(),
    });
    setLoading(false);
    if (error) return toast.error('Erro ao salvar: ' + error.message);
    setVersion(newVersion);
    toast.success('Versão publicada: ' + newVersion);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Versão do Sistema</CardTitle>
          <CardDescription>Publique uma nova versão para notificar todos os usuários.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Versão atual</Label>
            <Input value={version} onChange={e => setVersion(e.target.value)} placeholder="1.0.0" />
          </div>
          <div>
            <Label>Mensagem opcional</Label>
            <Textarea value={message} onChange={e => setMessage(e.target.value)} placeholder="Ex.: Correções no módulo de orçamentos." />
          </div>
          <div className="flex items-center gap-3">
            <Switch checked={force} onCheckedChange={setForce} id="force" />
            <Label htmlFor="force">Forçar atualização para todos os usuários</Label>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => save(true)} disabled={loading}>Publicar nova versão (+0.0.1)</Button>
            <Button onClick={() => save(false)} variant="outline" disabled={loading}>Salvar</Button>
          </div>
        </CardContent>
      </Card>
      <DefaultOriginCepCard />
    </div>
  );
}

function DefaultOriginCepCard() {
  const [cep, setCep] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.rpc('get_default_origin_cep');
      const clean = String(data || '').replace(/\D/g, '');
      if (clean) setCep(clean.replace(/^(\d{5})(\d{3})$/, '$1-$2'));
    })();
  }, []);

  const save = async () => {
    const clean = cep.replace(/\D/g, '');
    if (clean.length !== 8) return toast.error('Informe um CEP válido (8 dígitos).');
    setLoading(true);
    const { error } = await supabase.rpc('set_default_origin_cep', { _cep: clean });
    setLoading(false);
    if (error) return toast.error('Erro ao salvar: ' + error.message);
    toast.success('CEP padrão de expedição salvo.');
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>CEP padrão de expedição</CardTitle>
        <CardDescription>Usado como CEP de origem no cálculo de frete dos orçamentos.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label>CEP de origem</Label>
          <Input value={cep} onChange={e => setCep(e.target.value)} placeholder="00000-000" maxLength={9} />
        </div>
        <Button onClick={save} disabled={loading}>Salvar CEP</Button>
      </CardContent>
    </Card>
  );
}
