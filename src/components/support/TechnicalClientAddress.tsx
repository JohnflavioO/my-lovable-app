import { useEffect, useState } from 'react';
import { resolveTechnicalPdfClient } from '@/lib/technicalPdfClient';

export default function TechnicalClientAddress({ clientId }: { clientId?: string | null }) {
  const [address, setAddress] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    setAddress('');
    setError('');
    if (!clientId) return;
    setLoading(true);
    resolveTechnicalPdfClient({ client_id: clientId }, undefined, { requireAddress: false })
      .then(result => { if (active) setAddress(result.address); })
      .catch(() => { if (active) setError('Não foi possível consultar o endereço.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [clientId]);
  return <p className="text-sm text-muted-foreground break-words"><span className="font-medium text-foreground">Endereço do cliente:</span>{' '}{loading ? 'Carregando…' : error || address || 'Não cadastrado'}</p>;
}