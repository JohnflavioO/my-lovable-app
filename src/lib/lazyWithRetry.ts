import { lazy, type ComponentType } from 'react';
import { isLikelyChunkLoadError, reloadWithCacheBust, clearBrowserCachesAndWorkers } from './browserRecovery';

// Envolve React.lazy com retry automático + hard-recover.
// Motivo: após um deploy, o browser tenta carregar chunks com hashes antigos que não existem mais.
// Sem retry, o usuário vê "Failed to fetch dynamically imported module" e a tela de erro genérica.
export function lazyWithRetry<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
  keyForRetry?: string,
) {
  return lazy(async () => {
    const retryKey = `__mci_lazy_retry_${keyForRetry ?? factory.toString().slice(0, 40)}`;
    try {
      return await factory();
    } catch (err) {
      if (!isLikelyChunkLoadError(err)) throw err;

      // Segunda tentativa (às vezes o CDN entrega o chunk novo no retry).
      try {
        return await factory();
      } catch (err2) {
        if (!isLikelyChunkLoadError(err2)) throw err2;
      }

      // Ainda falhando — limpa caches/SW e força reload com cache-bust.
      let alreadyReloaded = false;
      try {
        alreadyReloaded = sessionStorage.getItem(retryKey) === '1';
        sessionStorage.setItem(retryKey, '1');
      } catch { /* storage bloqueado */ }

      if (!alreadyReloaded) {
        await clearBrowserCachesAndWorkers().catch(() => null);
        reloadWithCacheBust();
      }

      // Propaga o erro para o ErrorBoundary caso o reload já tenha sido tentado.
      throw err;
    }
  });
}
