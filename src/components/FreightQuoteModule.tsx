import { useEffect, useRef, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { RefreshCw, Maximize2, AlertTriangle } from 'lucide-react';
import FreightSummaryCard from './FreightSummaryCard';
import type { FreightData } from '@/lib/freight';
import { freightToQueryString } from '@/lib/freight';

const FREIGHT_URL = 'https://estoquemci.vercel.app/#/frete';

interface Props {
  showFullscreenButton?: boolean;
  className?: string;
  /** Dados do orçamento — quando presentes, mostra o card resumo acima do iframe */
  freightData?: FreightData;
  quoteNumber?: string;
  onCepOrigemChange?: (cep: string) => void;
}

/**
 * Módulo único e reutilizável de Cotação de Frete (Jamef).
 * Usado tanto na página dedicada quanto no Drawer dentro de Orçamentos.
 *
 * Arquitetura preparada para futuras integrações:
 *  - Fase 1 (atual): iframe + card com dados prontos para copiar
 *  - Fase 2: postMessage / query string para auto-preencher o iframe
 *  - Fase 3: substituir iframe por integração direta via API da transportadora
 */
export default function FreightQuoteModule({
  showFullscreenButton = true,
  className = '',
  freightData,
  quoteNumber,
  onCepOrigemChange,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  const handleReload = useCallback(() => {
    setFailed(false);
    setLoading(true);
    setReloadKey(k => k + 1);
  }, []);

  const handleFullscreen = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      el.requestFullscreen?.().catch(() => {});
    }
  }, []);

  // Tentativa (best-effort) de enviar dados via postMessage assim que o iframe carrega.
  // Se o app não escutar, nada acontece — o fallback é o card copiável acima.
  useEffect(() => {
    if (!freightData || !iframeRef.current) return;
    const iframe = iframeRef.current;
    const onLoad = () => {
      try {
        iframe.contentWindow?.postMessage(
          { type: 'MCI_FREIGHT_PREFILL', payload: freightData },
          '*',
        );
      } catch {
        /* noop */
      }
    };
    iframe.addEventListener('load', onLoad);
    return () => iframe.removeEventListener('load', onLoad);
  }, [freightData, reloadKey]);

  // Anexa query string em fragment separado — não altera o hash route
  const iframeSrc = (() => {
    if (!freightData) return FREIGHT_URL;
    const qs = freightToQueryString(freightData);
    return qs ? `${FREIGHT_URL}?${qs}` : FREIGHT_URL;
  })();

  return (
    <div ref={containerRef} className={`flex flex-col h-full w-full bg-background ${className}`}>
      <div className="flex items-center justify-end gap-2 px-3 py-2 border-b bg-muted/30">
        <Button variant="outline" size="sm" onClick={handleReload} className="gap-1.5">
          <RefreshCw className="h-3.5 w-3.5" /> Atualizar
        </Button>
        {showFullscreenButton && (
          <Button variant="outline" size="sm" onClick={handleFullscreen} className="gap-1.5">
            <Maximize2 className="h-3.5 w-3.5" /> Abrir em tela cheia
          </Button>
        )}
      </div>

      {freightData && <FreightSummaryCard data={freightData} quoteNumber={quoteNumber} onCepOrigemChange={onCepOrigemChange} />}

      <div className="flex-1 relative bg-muted/10 min-h-[300px]">
        {failed ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
            <AlertTriangle className="h-10 w-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground max-w-sm">
              Não foi possível carregar a Cotação de Frete no momento.
            </p>
            <Button variant="outline" size="sm" onClick={handleReload}>Tentar novamente</Button>
          </div>
        ) : (
          <>
            {loading && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
              </div>
            )}
            <iframe
              ref={iframeRef}
              key={reloadKey}
              src={iframeSrc}
              title="Cotação de Frete Jamef"
              className="w-full h-full border-0"
              onLoad={() => setLoading(false)}
              onError={() => { setFailed(true); setLoading(false); }}
            />
          </>
        )}
      </div>
    </div>
  );
}
