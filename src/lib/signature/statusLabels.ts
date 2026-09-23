import type { LucideIcon } from 'lucide-react';
import { FileEdit, MailCheck, Send, Eye, Clock, CheckCircle2, XCircle, AlertTriangle, Ban } from 'lucide-react';

export type SignatureStatus =
  | 'draft' | 'ready_to_send' | 'sent' | 'viewed'
  | 'awaiting_signature' | 'signed' | 'refused' | 'expired' | 'cancelled';

interface StatusMeta { label: string; className: string; icon: LucideIcon; }

export const SIGNATURE_STATUS: Record<SignatureStatus, StatusMeta> = {
  draft:              { label: 'Rascunho',              className: 'bg-slate-100 text-slate-700 border-slate-200',   icon: FileEdit },
  ready_to_send:      { label: 'Pronto para envio',     className: 'bg-blue-50 text-blue-700 border-blue-200',       icon: MailCheck },
  sent:               { label: 'Enviado',               className: 'bg-indigo-50 text-indigo-700 border-indigo-200', icon: Send },
  viewed:             { label: 'Visualizado',           className: 'bg-cyan-50 text-cyan-700 border-cyan-200',       icon: Eye },
  awaiting_signature: { label: 'Aguardando assinatura', className: 'bg-amber-50 text-amber-700 border-amber-200',    icon: Clock },
  signed:             { label: 'Assinado',              className: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: CheckCircle2 },
  refused:            { label: 'Recusado',              className: 'bg-red-50 text-red-700 border-red-200',          icon: XCircle },
  expired:            { label: 'Expirado',              className: 'bg-orange-50 text-orange-700 border-orange-200', icon: AlertTriangle },
  cancelled:          { label: 'Cancelado',             className: 'bg-slate-100 text-slate-500 border-slate-200',   icon: Ban },
};

export function signatureLabel(status?: string | null): StatusMeta {
  const key = (status ?? 'draft') as SignatureStatus;
  return SIGNATURE_STATUS[key] ?? SIGNATURE_STATUS.draft;
}

export const SIGNATURE_EVENT_LABEL: Record<string, string> = {
  request_created: 'Solicitação criada',
  invitation_sent: 'Convite enviado',
  link_opened: 'Link aberto pelo signatário',
  identity_confirmed: 'Identidade confirmada',
  verification_code_sent: 'Código de verificação enviado',
  verification_code_validated: 'Código validado',
  document_viewed: 'Documento visualizado',
  terms_accepted: 'Termos aceitos',
  signature_completed: 'Assinatura concluída',
  signature_refused: 'Assinatura recusada',
  request_expired: 'Solicitação expirada',
  request_cancelled: 'Solicitação cancelada',
  document_downloaded: 'Documento baixado',
};
