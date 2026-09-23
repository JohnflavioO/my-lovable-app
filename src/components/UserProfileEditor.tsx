import { useState, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Camera, Loader2, Mail, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Alert, AlertDescription } from '@/components/ui/alert';

const db = supabase as any;

const isPreviewRuntime = () => {
  if (typeof window === 'undefined') return false;
  const host = window.location.hostname;
  return window.self !== window.top
    || host.startsWith('id-preview--')
    || host.includes('-preview--')
    || host.endsWith('.lovableproject.com')
    || host.endsWith('.lovableproject-dev.com')
    || host.endsWith('.beta.lovable.dev');
};

export default function UserProfileEditor() {
  const { user, profile } = useAuth();
  const [open, setOpen] = useState(false);
  const [fullName, setFullName] = useState('');
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  // Email change state
  const [newEmail, setNewEmail] = useState('');
  const [changingEmail, setChangingEmail] = useState(false);
  const [emailSent, setEmailSent] = useState(false);

  const handleOpen = () => {
    setFullName(profile?.full_name || '');
    setAvatarUrl((profile as any)?.avatar_url || '');
    setNewEmail('');
    setEmailSent(false);
    setOpen(true);
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    if (file.size > 2 * 1024 * 1024) {
      toast.error('A imagem deve ter no máximo 2MB');
      return;
    }

    setUploading(true);
    try {
      const ext = file.name.split('.').pop();
      const path = `${user.id}/avatar.${ext}`;

      const { error: uploadErr } = await supabase.storage
        .from('avatars')
        .upload(path, file, { upsert: true });

      if (uploadErr) throw uploadErr;

      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(path);

      const url = `${publicUrl}?t=${Date.now()}`;
      setAvatarUrl(url);

      await db.from('profiles').update({ avatar_url: url }).eq('user_id', user.id);
      toast.success('Foto atualizada!');
    } catch (err: any) {
      toast.error('Erro ao enviar foto: ' + err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const { error } = await db.from('profiles')
        .update({ full_name: fullName })
        .eq('user_id', user.id);
      if (error) throw error;
      toast.success('Perfil atualizado!');
      setOpen(false);
      if (!isPreviewRuntime()) {
        window.location.reload();
      }
    } catch (err: any) {
      toast.error('Erro: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleChangeEmail = async () => {
    if (!newEmail || !newEmail.includes('@')) {
      toast.error('Informe um e-mail válido');
      return;
    }
    if (newEmail === user?.email) {
      toast.error('O novo e-mail deve ser diferente do atual');
      return;
    }
    setChangingEmail(true);
    try {
      const { error } = await supabase.auth.updateUser(
        { email: newEmail },
        { emailRedirectTo: window.location.origin }
      );
      if (error) throw error;
      setEmailSent(true);
      toast.success('E-mail de confirmação enviado!');
    } catch (err: any) {
      toast.error('Erro ao alterar e-mail: ' + err.message);
    } finally {
      setChangingEmail(false);
    }
  };

  const initial = profile?.full_name?.charAt(0)?.toUpperCase() || '?';

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button onClick={handleOpen} className="flex items-center gap-3 w-full text-left hover:bg-sidebar-accent/30 rounded-lg p-1 -m-1 transition-colors">
          <Avatar className="h-8 w-8">
            {(profile as any)?.avatar_url ? (
              <AvatarImage src={(profile as any).avatar_url} alt={profile?.full_name || ''} />
            ) : null}
            <AvatarFallback className="bg-sidebar-primary text-sidebar-primary-foreground text-sm font-bold">
              {initial}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-sidebar-foreground truncate">{profile?.full_name || 'Usuário'}</p>
            <p className="text-xs text-sidebar-foreground/50">{profile?.role || 'comercial'}</p>
          </div>
        </button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Editar Perfil</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col items-center gap-4 py-4">
          <div className="relative group cursor-pointer" onClick={() => fileRef.current?.click()}>
            <Avatar className="h-20 w-20">
              {avatarUrl ? (
                <AvatarImage src={avatarUrl} alt={fullName} />
              ) : null}
              <AvatarFallback className="bg-primary text-primary-foreground text-2xl font-bold">
                {fullName?.charAt(0)?.toUpperCase() || '?'}
              </AvatarFallback>
            </Avatar>
            <div className="absolute inset-0 bg-black/40 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              {uploading ? (
                <Loader2 className="h-5 w-5 text-white animate-spin" />
              ) : (
                <Camera className="h-5 w-5 text-white" />
              )}
            </div>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleUpload} />
          </div>
          <p className="text-xs text-muted-foreground">Clique para alterar a foto</p>

          <div className="w-full space-y-4">
            <div>
              <Label>Nome Completo</Label>
              <Input value={fullName} onChange={e => setFullName(e.target.value)} />
            </div>

            {/* Email change section */}
            <div className="border rounded-lg p-3 space-y-3 bg-muted/30">
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <Label className="text-sm font-semibold">Alterar E-mail</Label>
              </div>
              <p className="text-xs text-muted-foreground">
                E-mail atual: <span className="font-medium text-foreground">{user?.email}</span>
              </p>

              {emailSent ? (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription className="text-xs">
                    Um e-mail de confirmação foi enviado para <strong>{newEmail}</strong> e para seu e-mail atual.
                    Confirme em ambos para concluir a alteração.
                  </AlertDescription>
                </Alert>
              ) : (
                <>
                  <Input
                    type="email"
                    placeholder="Novo e-mail"
                    value={newEmail}
                    onChange={e => setNewEmail(e.target.value)}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleChangeEmail}
                    disabled={changingEmail || !newEmail}
                    className="w-full"
                  >
                    {changingEmail && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
                    Enviar confirmação
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Salvar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
