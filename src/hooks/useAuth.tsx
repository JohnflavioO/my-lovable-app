import { createContext, useContext, useEffect, useState, useCallback, useRef, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  profileLoaded: boolean;
  isApproved: boolean;
  isAdmin: boolean;
  isGestor: boolean;
  isFinanceiro: boolean;
  isLogistica: boolean;
  isSupportTech: boolean;
  isSupportManager: boolean;
  isSupport: boolean;
  isSupportOnly: boolean;
  profile: { full_name: string; phone: string; role: string; avatar_url?: string; company_id?: string; can_access_support_manager?: boolean; permissions?: Record<string, boolean> } | null;
  forcePasswordChange: boolean;
  refreshAccess: () => Promise<void>;
  signOut: () => Promise<void>;
}

const isDev = import.meta.env.DEV;
const devLog = (...args: any[]) => { if (isDev) console.log(...args); };
const devWarn = (...args: any[]) => { if (isDev) console.warn(...args); };

const AuthContext = createContext<AuthContextType>({
  user: null, session: null, loading: true, profileLoaded: false,
  isApproved: false, isAdmin: false, isGestor: false, isFinanceiro: false, isLogistica: false,
  isSupportTech: false, isSupportManager: false, isSupport: false, isSupportOnly: false,
  profile: null, forcePasswordChange: false,
  refreshAccess: async () => {},
  signOut: async () => {},
});

export const useAuth = () => useContext(AuthContext);

const APPROVED_ROLES = new Set(['admin', 'gestor', 'vendedor', 'comercial', 'financeiro', 'logistica', 'support_tech', 'support_manager']);

type ProfileData = {
  full_name: string;
  phone: string;
  role: string;
  avatar_url?: string;
  force_password_change?: boolean;
  company_id?: string;
  can_access_support_manager?: boolean;
  permissions?: Record<string, boolean>;
};

type AccessData = {
  full_name?: string | null;
  phone?: string | null;
  role?: string | null;
  avatar_url?: string | null;
  force_password_change?: boolean | null;
  company_id?: string | null;
  can_access_support_manager?: boolean | null;
  approval_status?: string | null;
  roles?: unknown[] | null;
  permissions?: Record<string, boolean> | null;
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isApproved, setIsApproved] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isGestor, setIsGestor] = useState(false);
  const [isFinanceiro, setIsFinanceiro] = useState(false);
  const [isLogistica, setIsLogistica] = useState(false);
  const [isSupportTech, setIsSupportTech] = useState(false);
  const [isSupportManager, setIsSupportManager] = useState(false);
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [forcePasswordChange, setForcePasswordChange] = useState(false);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const accessRefreshInFlight = useRef(false);

  const applyAccessData = useCallback((data: AccessData | null | undefined) => {
    const profileData: ProfileData | null = data ? {
      full_name: data.full_name ?? '',
      phone: data.phone ?? '',
      role: data.role ?? '',
      avatar_url: data.avatar_url ?? undefined,
      force_password_change: data.force_password_change === true,
      company_id: data.company_id ?? undefined,
      can_access_support_manager: data.can_access_support_manager === true,
      permissions: (data.permissions ?? {}) as Record<string, boolean>,
    } : null;

    // Roles reais vêm APENAS de user_roles. profiles.role tem default 'comercial'
    // e não pode ser usado para decidir aprovação (senão todo cadastro novo entra).
    const roleSet = new Set<string>((data?.roles ?? []).map((r) => String(r).toLowerCase()));
    const approvedByStatus = data?.approval_status === 'approved';
    const approvedByRole = [...roleSet].some(r => APPROVED_ROLES.has(r));

    // Aprovação exige status='approved' OU um cargo real atribuído em user_roles.
    setIsApproved(approvedByStatus || approvedByRole);
    setIsAdmin(roleSet.has('admin'));
    setIsGestor(roleSet.has('gestor'));
    setIsFinanceiro(roleSet.has('financeiro'));
    setIsLogistica(roleSet.has('logistica'));
    setIsSupportTech(roleSet.has('support_tech'));
    setIsSupportManager(roleSet.has('support_manager'));
    setProfile(profileData);
    setForcePasswordChange(profileData?.force_password_change === true);

    return { profileData, roles: [...roleSet] };
  }, []);

  const refreshAccess = useCallback(async () => {
    if (!user || accessRefreshInFlight.current) return;
    accessRefreshInFlight.current = true;
    try {
      const { data, error } = await (supabase as any).rpc('get_current_user_access').maybeSingle();
      if (error) {
        console.error('[Auth] Access refresh error:', error);
        return;
      }
      applyAccessData(data);
      setProfileLoaded(true);
    } finally {
      accessRefreshInFlight.current = false;
    }
  }, [applyAccessData, user]);

  // Safety timeout: hard cap on splash — never > 3s.
  useEffect(() => {
    const timer = setTimeout(() => {
      setLoading(prev => {
        if (!prev) return prev;
        devWarn('[Auth] Safety timeout reached, forcing loading=false');
        return false;
      });
    }, 3000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    let currentUserId: string | null = null;

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, newSession) => {
        const newUserId = newSession?.user?.id ?? null;
        setSession(newSession);
        setUser(newSession?.user ?? null);
        if (!newUserId) {
          currentUserId = null;
          setIsApproved(false);
          setIsAdmin(false);
          setIsGestor(false);
          setIsFinanceiro(false);
          setIsLogistica(false);
          setIsSupportTech(false);
          setIsSupportManager(false);
          setProfile(null);
          setProfileLoaded(false);
        } else if (newUserId !== currentUserId) {
          currentUserId = newUserId;
          setProfileLoaded(false);
        }
        // Sessão resolvida — libera o splash imediatamente.
        // Roles/profile carregam em background; App.tsx já lida com profile ausente.
        setLoading(false);
      }
    );

    supabase.auth.getSession().then(({ data: { session: s }, error }) => {
      if (error) {
        console.error('[Auth] getSession error, clearing session:', error.message);
        supabase.auth.signOut().catch(() => {});
        setLoading(false);
        return;
      }
      const uid = s?.user?.id ?? null;
      setSession(s);
      setUser(s?.user ?? null);
      if (uid && uid !== currentUserId) currentUserId = uid;
      setLoading(false);
    }).catch((err) => {
      console.error('[Auth] getSession exception:', err);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    let attempt = 0;

    const fetchData = async () => {
      attempt += 1;
      try {
        // Bootstrap seguro: uma única função interna lê perfil, status e cargos do próprio usuário.
        const { data, error } = await (supabase as any).rpc('get_current_user_access').maybeSingle();

        if (cancelled) return;

        if (error) {
          console.error('[Auth] Access bootstrap error:', error);
          if (attempt < 2) {
            setTimeout(() => { if (!cancelled) fetchData(); }, 800);
            return;
          }
          setProfile(null);
          setProfileLoaded(false);
          setLoading(false);
          return;
        }

        const { profileData, roles } = applyAccessData(data);

        if (!profileData && attempt < 2) {
          devWarn('[Auth] Profile empty, retrying');
          setTimeout(() => { if (!cancelled) fetchData(); }, 800);
          return;
        }

        devLog('[Auth] ready', { roles });
        setProfileLoaded(true);
        setLoading(false);
      } catch (e) {
        console.error('[Auth] fetchUserData error:', e);
        if (attempt < 2 && !cancelled) {
          setTimeout(() => { if (!cancelled) fetchData(); }, 800);
          return;
        }
        if (!cancelled) { setProfileLoaded(true); setLoading(false); }
      }
    };

    fetchData();
    return () => { cancelled = true; };
  }, [applyAccessData, user?.id]);

  useEffect(() => {
    if (!user) return;

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') refreshAccess();
    };

    window.addEventListener('mci:refresh-auth', refreshAccess);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      window.removeEventListener('mci:refresh-auth', refreshAccess);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [refreshAccess, user]);

  const signOut = useCallback(async () => {
    try {
      setLoading(true);
      await supabase.auth.signOut();
    } catch (err) {
      console.error('[Auth] SignOut error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  return (
    <AuthContext.Provider value={{
      user, session, loading, profileLoaded, isApproved, isAdmin, isGestor, isFinanceiro, isLogistica,
      isSupportTech, isSupportManager, isSupport: isSupportTech || isSupportManager,
      isSupportOnly: (isSupportTech || isSupportManager) && !isAdmin && !isGestor && !isFinanceiro && !isLogistica,
      profile, forcePasswordChange, refreshAccess, signOut
    }}>
      {children}
    </AuthContext.Provider>
  );
}
