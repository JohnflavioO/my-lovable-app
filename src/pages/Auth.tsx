import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Loader2, Mail, Lock, User, Phone, Eye, EyeOff } from 'lucide-react';
import loginBg from '@/assets/mci-login-bg.jpg';
import mciLogo from '@/assets/mci-logo.png';

export default function Auth() {
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (isLogin) {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        
        // After successful login, we might need a small delay or a force refresh to ensure useAuth catches the new state
        // but typically the onAuthStateChange in AuthProvider handles it.
        // We can add a toast and let the App component handle the redirect based on the updated useAuth state.
        toast.success('Login realizado com sucesso!');
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: fullName, phone },
            emailRedirectTo: window.location.origin,
          },
        });
        if (error) throw error;
        toast.success('Conta criada! Aguarde aprovação do administrador.');
      }
    } catch (err: any) {
      toast.error(err.message || 'Erro ao processar solicitação');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left side - Hero image */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden">
        <img
          src={loginBg}
          alt="MCI Proposta CRM"
          className="absolute inset-0 w-full h-full object-cover bg-[hsl(170,30%,8%)]"
        />
      </div>

      {/* Right side - Login form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center bg-gradient-to-br from-[hsl(0,0%,4%)] via-[hsl(170,25%,6%)] to-[hsl(170,30%,8%)] relative overflow-hidden">
        {/* Subtle background pattern */}
        <div className="absolute inset-0 opacity-5">
          <div className="absolute top-0 right-0 w-96 h-96 rounded-full bg-[hsl(var(--accent))] blur-[120px]" />
          <div className="absolute bottom-0 left-0 w-72 h-72 rounded-full bg-[hsl(var(--accent))] blur-[100px]" />
        </div>

        <div className="relative z-10 w-full max-w-md px-8 py-12">
          {/* MCI Logo */}
          <div className="text-center mb-10">
            <div className="inline-flex items-center gap-2 mb-3">
              <img src={mciLogo} alt="MCI Logo" className="h-16 w-auto" />
            </div>
            <h1 className="text-2xl font-bold text-white font-display">
              {isLogin ? 'Bem-vindo de volta' : 'Criar Conta'}
            </h1>
            <p className="text-gray-400 mt-2 text-sm">
              {isLogin
                ? 'Acesse o Proposta CRM — Continue sua jornada'
                : 'Preencha os dados para solicitar acesso ao sistema'}
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            {!isLogin && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="fullName" className="text-gray-300 text-sm">Nome Completo</Label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                    <Input
                      id="fullName"
                      placeholder="Seu nome completo"
                      value={fullName}
                      onChange={e => setFullName(e.target.value)}
                      className="pl-10 bg-white/5 border-white/10 text-white placeholder:text-gray-500 focus-visible:ring-[hsl(168,80%,45%)] focus-visible:border-[hsl(168,80%,45%)]"
                      required
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone" className="text-gray-300 text-sm">Telefone</Label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                    <Input
                      id="phone"
                      placeholder="(85) 99999-9999"
                      value={phone}
                      onChange={e => setPhone(e.target.value)}
                      className="pl-10 bg-white/5 border-white/10 text-white placeholder:text-gray-500 focus-visible:ring-[hsl(168,80%,45%)] focus-visible:border-[hsl(168,80%,45%)]"
                    />
                  </div>
                </div>
              </>
            )}

            <div className="space-y-2">
              <Label htmlFor="email" className="text-gray-300 text-sm">E-mail</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                <Input
                  id="email"
                  type="email"
                  placeholder="seu@email.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="pl-10 bg-white/5 border-white/10 text-white placeholder:text-gray-500 focus-visible:ring-[hsl(168,80%,45%)] focus-visible:border-[hsl(168,80%,45%)]"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-gray-300 text-sm">Senha</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="pl-10 pr-10 bg-white/5 border-white/10 text-white placeholder:text-gray-500 focus-visible:ring-[hsl(168,80%,45%)] focus-visible:border-[hsl(168,80%,45%)]"
                  required
                  minLength={6}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              className="w-full bg-[hsl(168,80%,45%)] hover:bg-[hsl(168,80%,38%)] text-white font-semibold h-11 text-sm"
              disabled={loading}
            >
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isLogin ? 'Entrar' : 'Solicitar Acesso'}
            </Button>
          </form>

          {/* Toggle */}
          <div className="mt-8 text-center">
            <span className="text-gray-500 text-sm">
              {isLogin ? 'Não tem conta?' : 'Já tem conta?'}
            </span>{' '}
            <button
              type="button"
              onClick={() => {
                setIsLogin(!isLogin);
                setShowPassword(false);
              }}
              className="text-sm text-[hsl(168,80%,45%)] hover:text-[hsl(168,80%,55%)] font-medium transition-colors"
            >
              {isLogin ? 'Solicite acesso' : 'Faça login'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
