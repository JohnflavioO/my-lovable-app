import { useState, useEffect, createContext, useContext, ReactNode } from 'react';

interface PrivacyContextType {
  isHidden: boolean;
  togglePrivacy: () => void;
  maskValue: (value: string | number, isCurrency?: boolean) => string;
  formatCurrency: (value: number, compact?: boolean) => string;
}

const PrivacyContext = createContext<PrivacyContextType | undefined>(undefined);

export const usePrivacy = () => {
  const context = useContext(PrivacyContext);
  if (!context) {
    throw new Error('usePrivacy must be used within a PrivacyProvider');
  }
  return context;
};

export const PrivacyProvider = ({ children }: { children: ReactNode }) => {
  const [isHidden, setIsHidden] = useState<boolean>(() => {
    try {
      return localStorage.getItem('mci_privacy_hidden') === 'true';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('mci_privacy_hidden', String(isHidden));
    } catch {
      // Navegadores com armazenamento bloqueado continuam funcionando sem persistir esta preferência.
    }
  }, [isHidden]);

  const togglePrivacy = () => setIsHidden(prev => !prev);

  const formatCurrency = (value: number, compact = false) => {
    if (compact) {
      if (value >= 1000000) {
        return `R$ ${(value / 1000000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi`;
      }
      if (value >= 1000) {
        return `R$ ${(value / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil`;
      }
    }
    return new Intl.NumberFormat('pt-BR', { 
      style: 'currency', 
      currency: 'BRL',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(value);
  };

  const maskValue = (value: string | number, isCurrency = true) => {
    if (!isHidden) {
      if (typeof value === 'number' && isCurrency) {
        return formatCurrency(value);
      }
      return String(value);
    }
    return '••••••••';
  };

  return (
    <PrivacyContext.Provider value={{ isHidden, togglePrivacy, maskValue, formatCurrency }}>
      {children}
    </PrivacyContext.Provider>
  );
};
