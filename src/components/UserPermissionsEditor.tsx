import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Shield, Save, RotateCcw, CheckCircle2 } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { getDefaultPermissionForRole, PermissionKey } from '@/hooks/usePermissions';


interface UserPermissionsEditorProps {
  userId: string;
  userName: string;
  userRole: string;
}

const permissionGroups = [
  {
    title: 'Produtos',
    permissions: [
      { key: 'products.view', label: 'Visualizar produtos' },
      { key: 'products.create', label: 'Adicionar produto' },
      { key: 'products.edit', label: 'Editar produto' },
      { key: 'products.delete', label: 'Excluir produto' },
    ]
  },
  {
    title: 'Clientes',
    permissions: [
      { key: 'clients.view', label: 'Visualizar clientes' },
      { key: 'clients.create', label: 'Adicionar cliente' },
      { key: 'clients.edit', label: 'Editar cliente' },
      { key: 'clients.delete', label: 'Excluir cliente' },
    ]
  },
  {
    title: 'Orçamentos',
    permissions: [
      { key: 'quotes.view', label: 'Visualizar orçamentos' },
      { key: 'quotes.create', label: 'Criar orçamento' },
      { key: 'quotes.edit', label: 'Editar orçamento' },
      { key: 'quotes.delete', label: 'Excluir orçamento' },
      { key: 'quotes.approve', label: 'Aprovar orçamento' },
    ]
  },
  {
    title: 'Funil',
    permissions: [
      { key: 'pipeline.view', label: 'Visualizar funil' },
      { key: 'pipeline.move', label: 'Mover cards no funil' },
    ]
  },
  {
    title: 'Financeiro',
    permissions: [
      { key: 'financial.view', label: 'Visualizar financeiro' },
      { key: 'financial.edit', label: 'Editar financeiro' },
      { key: 'financial.pay', label: 'Dar baixa em boleto' },
    ]
  },
  {
    title: 'Logística',
    permissions: [
      { key: 'logistics.view', label: 'Visualizar acompanhamento' },
      { key: 'logistics.edit', label: 'Editar status logístico' },
      { key: 'logistics.upload_nf', label: 'Subir NF' },
    ]
  },
  {
    title: 'Suporte Técnico',
    permissions: [
      { key: 'support.view', label: 'Acessar suporte técnico' },
      { key: 'support.create_os', label: 'Criar OS' },
      { key: 'support.edit_os', label: 'Editar OS' },
      { key: 'support.status_os', label: 'Alterar status de OS' },
    ]
  },
  {
    title: 'Ferramentas',
    permissions: [
      { key: 'contracts.use', label: 'Usar Gerador de Contrato' },
    ]
  }

];

const presets: Record<string, any> = {
  'default': {},
  'moderator_products': {
    'products.create': true,
    'products.edit': true,
    'products.view': true,
  },
  'moderator_commercial': {
    'quotes.create': true,
    'quotes.edit': true,
    'quotes.approve': true,
    'clients.edit': true,
  },
  'view_only': {
    'products.view': true,
    'clients.view': true,
    'quotes.view': true,
    'pipeline.view': true,
    'financial.view': true,
    'logistics.view': true,
    'support.view': true,
    'products.create': false,
    'products.edit': false,
    'products.delete': false,
    'clients.create': false,
    'clients.edit': false,
    'clients.delete': false,
    'quotes.create': false,
    'quotes.edit': false,
    'quotes.delete': false,
    'quotes.approve': false,
    'financial.edit': false,
    'financial.pay': false,
    'logistics.edit': false,
    'logistics.upload_nf': false,
    'support.create_os': false,
    'support.edit_os': false,
    'support.status_os': false,
  }
};

export default function UserPermissionsEditor({ userId, userName, userRole }: UserPermissionsEditorProps) {
  const [permissions, setPermissions] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [currentPreset, setCurrentPreset] = useState('custom');

  useEffect(() => {
    loadPermissions();
  }, [userId]);

  const loadPermissions = async () => {
    setLoading(true);
    try {
      const { data, error } = await (supabase as any).rpc('admin_get_user_permissions', { _user_id: userId });
      if (error) throw error;
      setPermissions((data as Record<string, boolean>) || {});
    } catch (error: any) {
      toast.error('Erro ao carregar permissões: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = (key: string, enabled: boolean) => {
    setPermissions(prev => ({ ...prev, [key]: enabled }));
    setCurrentPreset('custom');
  };

  const handleApplyPreset = (presetKey: string) => {
    setCurrentPreset(presetKey);
    if (presetKey === 'default') {
      setPermissions({});
    } else if (presets[presetKey]) {
      setPermissions(presets[presetKey]);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { error } = await (supabase as any).rpc('admin_set_user_permissions', { _user_id: userId, _permissions: permissions });
      if (error) throw error;
      toast.success('Permissões atualizadas com sucesso!');
    } catch (error: any) {
      toast.error('Erro ao salvar permissões: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="p-8 text-center text-muted-foreground">Carregando permissões...</div>;
  }

  return (
    <Card className="border-accent/20 shadow-lg">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-accent" />
            <div>
              <CardTitle className="text-lg">Permissões Avançadas</CardTitle>
              <CardDescription>Configure permissões específicas para {userName}</CardDescription>
            </div>
          </div>
          <Badge variant="outline" className="bg-accent/5 text-accent border-accent/20">
            Cargo: {userRole}
          </Badge>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-6">
        <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between bg-muted/30 p-4 rounded-lg">
          <div className="space-y-1">
            <p className="text-sm font-medium">Presets de Permissão</p>
            <p className="text-xs text-muted-foreground">Escolha uma configuração rápida</p>
          </div>
          <div className="flex gap-2 w-full md:w-auto">
            <Select value={currentPreset} onValueChange={handleApplyPreset}>
              <SelectTrigger className="w-full md:w-[200px] h-9 bg-background">
                <SelectValue placeholder="Selecionar preset" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="default">Padrão do cargo</SelectItem>
                <SelectItem value="moderator_products">Moderador de Produtos</SelectItem>
                <SelectItem value="moderator_commercial">Moderador Comercial</SelectItem>
                <SelectItem value="view_only">Apenas Visualização</SelectItem>
                <SelectItem value="custom">Personalizado</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => handleApplyPreset('default')} title="Resetar">
              <RotateCcw className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
          {permissionGroups.map((group) => (
            <div key={group.title} className="space-y-3">
              <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                <CheckCircle2 className="h-3.5 w-3.5 text-accent/60" />
                {group.title}
              </h3>
              <div className="space-y-2.5">
                {group.permissions.map((perm) => (
                  <div key={perm.key} className="flex items-center justify-between group py-0.5">
                    <Label htmlFor={perm.key} className="text-sm cursor-pointer group-hover:text-accent transition-colors">
                      {perm.label}
                    </Label>
                    <Switch 
                      id={perm.key} 
                      checked={
                        permissions[perm.key] !== undefined
                          ? permissions[perm.key] === true
                          : getDefaultPermissionForRole(perm.key as PermissionKey, userRole, userRole === 'admin', userRole === 'gestor')
                      }
                      onCheckedChange={(val) => handleToggle(perm.key, val)}
                    />

                  </div>
                ))}
              </div>
              <Separator className="mt-4 md:hidden" />
            </div>
          ))}
        </div>

        <div className="pt-4 flex justify-end gap-3 border-t">
          <Button variant="ghost" onClick={loadPermissions} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving} className="bg-accent hover:bg-accent/90">
            {saving ? (
              <span className="flex items-center gap-2">Salvando...</span>
            ) : (
              <span className="flex items-center gap-2">
                <Save className="h-4 w-4" /> Salvar Permissões
              </span>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// Re-using Badge component logic or importing it
function Badge({ children, variant, className }: { children: React.ReactNode; variant?: string; className?: string }) {
  return (
    <div className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 ${className}`}>
      {children}
    </div>
  );
}
