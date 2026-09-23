import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import AppLayout from '@/components/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Plus, FileText, Trash2, Copy, Eye, History, FileDown, Printer, Loader2, Pencil, Upload, FileSignature, X, Send, ShieldCheck, Search, Users } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { signatureLabel } from '@/lib/signature/statusLabels';
import SendForSignatureDialog from '@/components/contracts/SendForSignatureDialog';
import SignatureDetailsDrawer from '@/components/contracts/SignatureDetailsDrawer';

const mciData = {
  name: "MCI - Multi Comercial e Importadora LTDA",
  headquarters: {
    cnpj: "05.502.390/0001-11",
    address: "Rua Senador Pompeu, 1547, Centro, Fortaleza/CE"
  },
  branches: [
    { id: 'itajai', cnpj: "05.502.390/0002-00", label: "Armazém Itajaí/CE" },
    { id: 'sp', cnpj: "05.502.390/0003-83", label: "São Paulo/SP" }
  ]
};

const initialClient = {
  name: '',
  document: '',
  city: '',
  responsible: '',
  phone: '',
  email: ''
};

const clientPlaceholders = {
  name: 'Ex: Produtora Exemplo Ltda',
  document: 'Ex: 00.000.000/0001-00',
  city: 'Ex: São Paulo/SP',
  responsible: 'Ex: João da Silva',
  phone: 'Ex: (11) 91234-5678',
  email: 'Ex: contato@empresa.com.br'
};

const initialProducts = [
  { name: 'DZOFilm Kit 6 Lentes Arles 18, 25, 35, 50, 75 e 100 mm FF/VV Prime Cine (ARRI PL)', description: 'Kit completo de lentes de cinema', quantity: 1, value: 115551, observations: '' },
  { name: 'DZOFILM Arcana Anamorphic Prime Kit - 3 Lentes 32mm + 45mm + 75mm (ARRI PL, Titanium)', description: 'Kit anamórfico premium', quantity: 1, value: 0, observations: '' }
];

export default function ContractGenerator() {
  const { user, profile, isAdmin, isGestor } = useAuth();
  const [view, setView] = useState<'list' | 'create'>('list');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [contracts, setContracts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [templates, setTemplates] = useState<any[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewContract, setPreviewContract] = useState<any | null>(null);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [signSendOpen, setSignSendOpen] = useState(false);
  const [signSendContract, setSignSendContract] = useState<any>(null);
  const [signDetailsOpen, setSignDetailsOpen] = useState(false);
  const [signDetailsContract, setSignDetailsContract] = useState<any>(null);
  const canRemoveSigned = isAdmin || isGestor;

  // Client picker
  const [clientPickerOpen, setClientPickerOpen] = useState(false);
  const [clientSearch, setClientSearch] = useState('');
  const [clientResults, setClientResults] = useState<any[]>([]);
  const [loadingClients, setLoadingClients] = useState(false);

  useEffect(() => {
    if (!clientPickerOpen) return;
    let cancel = false;
    const t = setTimeout(async () => {
      setLoadingClients(true);
      try {
        let q = supabase
          .from('clients')
          .select('id, name, company_name, cpf_cnpj, email, phone, contact_phone, city, state, contact_name')
          .order('updated_at', { ascending: false })
          .limit(25);
        const term = clientSearch.trim();
        if (term) {
          const t2 = `%${term}%`;
          q = q.or(`name.ilike.${t2},company_name.ilike.${t2},cpf_cnpj.ilike.${t2},email.ilike.${t2},city.ilike.${t2}`);
        }
        const { data, error } = await q;
        if (!cancel) {
          if (error) toast.error('Erro ao buscar clientes: ' + error.message);
          setClientResults(data || []);
        }
      } finally {
        if (!cancel) setLoadingClients(false);
      }
    }, 300);
    return () => { cancel = true; clearTimeout(t); };
  }, [clientPickerOpen, clientSearch]);

  const applyClient = (c: any) => {
    setFormData((prev: any) => ({
      ...prev,
      client: {
        name: c.company_name || c.name || '',
        document: c.cpf_cnpj || '',
        city: [c.city, c.state].filter(Boolean).join('/'),
        responsible: c.contact_name || c.name || '',
        phone: c.contact_phone || c.phone || '',
        email: c.email || '',
      }
    }));
    setClientPickerOpen(false);
    toast.success('Dados do cliente preenchidos');
  };
  
  const [formData, setFormData] = useState<any>({
    client: { ...initialClient },
    products: [...initialProducts],
    commercial: {
      total_value: 115551,
      delivery_forecast: 'final de julho, conforme chegada da encomenda destinada ao cliente',
      payment_terms: 'A combinar',
      notes: '',
      additional_clauses: ''
    },
    mci_branch: 'matriz'
  });


  const canSeeAllContracts = isAdmin || isGestor;
  const [showAllContracts, setShowAllContracts] = useState(false);

  useEffect(() => {
    fetchContracts();
    fetchTemplates();
  }, [showAllContracts, user?.id]);

  const fetchContracts = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('generated_contracts')
        .select('*')
        .order('created_at', { ascending: false });

      if (!(canSeeAllContracts && showAllContracts) && user?.id) {
        query = query.eq('created_by', user.id);
      }

      const { data, error } = await query;
      if (error) throw error;
      setContracts(data || []);
    } catch (error: any) {
      toast.error('Erro ao carregar contratos: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchTemplates = async () => {
    try {
      const { data, error } = await supabase
        .from('contract_templates')
        .select('*')
        .eq('active', true);
      if (error) throw error;
      setTemplates(data || []);
      if (data && data.length > 0) setSelectedTemplate(data[0].id);
    } catch (error: any) {
      console.error('Erro ao carregar templates:', error);
    }
  };

  const addProduct = () => {
    setFormData({
      ...formData,
      products: [...formData.products, { name: '', description: '', quantity: 1, value: 0, observations: '' }]
    });
  };

  const removeProduct = (index: number) => {
    const newProducts = [...formData.products];
    newProducts.splice(index, 1);
    setFormData({ ...formData, products: newProducts });
  };

  const updateProduct = (index: number, field: string, value: any) => {
    const newProducts = [...formData.products];
    newProducts[index] = { ...newProducts[index], [field]: value };
    setFormData({ ...formData, products: newProducts });
  };

  const handleSave = async (status: string = 'rascunho') => {
    if (!user) {
      toast.error('Sessão inválida. Faça login novamente.');
      return;
    }

    setSaving(true);
    const contractPayload = {
      company_id: profile?.company_id ?? null,
      client_name: formData.client.name,
      client_document: formData.client.document,
      responsible_name: formData.client.responsible,
      responsible_phone: formData.client.phone,
      total_value: formData.commercial.total_value,
      delivery_forecast: formData.commercial.delivery_forecast,
      status: status,
      contract_data_json: formData,
      created_by: user.id
    };

    console.log('Tentando salvar contrato:', contractPayload);

    try {
      const query = editingId
        ? supabase.from('generated_contracts').update(contractPayload).eq('id', editingId).select()
        : supabase.from('generated_contracts').insert(contractPayload).select();
      const { data, error } = await query;

      if (error) {
        console.error('Erro detalhado Supabase:', error);
        throw error;
      }

      console.log('Contrato salvo com sucesso:', data);
      if (status === 'enviado' && data && data[0]) {
        downloadPDF(data[0]);
      }
      toast.success(status === 'enviado' ? 'Contrato gerado e baixado!' : editingId ? 'Contrato atualizado!' : 'Contrato salvo!');
      setEditingId(null);
      setView('list');
      fetchContracts();
    } catch (error: any) {
      console.error('Catch error:', error);
      toast.error('Erro ao salvar contrato: ' + (error.message || 'Erro desconhecido'));
    } finally {
      setSaving(false);
    }
  };

  const getContractData = (contractOrForm: any) => contractOrForm?.contract_data_json || contractOrForm || formData;

  const getFileName = (contractOrForm: any) => {
    const data = getContractData(contractOrForm);
    const safeClientName = (data?.client?.name || 'Contrato_MCI')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9_-]+/g, '_')
      .replace(/^_+|_+$/g, '');
    return `Contrato_${safeClientName || 'MCI'}.pdf`;
  };

  const loadLogoDataUrl = async (): Promise<{ data: string; w: number; h: number } | null> => {
    try {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('logo'));
        img.src = '/mci-logo-contract.jpg';
      });
      const maxW = 400;
      const scale = Math.min(1, maxW / img.naturalWidth);
      const w = Math.round(img.naturalWidth * scale);
      const h = Math.round(img.naturalHeight * scale);
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      return { data: canvas.toDataURL('image/jpeg', 0.75), w, h };
    } catch {
      return null;
    }
  };

  const createPDFDocument = async (contractOrForm: any) => {
    const data = getContractData(contractOrForm);
    const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4', compress: true });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 15;
    const fmtBRL = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

    // Logo centered at top
    const logo = await loadLogoDataUrl();
    let headerBottom = 14;
    if (logo) {
      const logoW = 32;
      const logoH = logoW * (logo.h / logo.w);
      doc.addImage(logo.data, 'JPEG', (pageWidth - logoW) / 2, 8, logoW, logoH, undefined, 'FAST');
      headerBottom = 8 + logoH + 2;

    } else {
      doc.setFontSize(18);
      doc.setTextColor(15, 43, 38);
      doc.setFont("helvetica", "bold");
      doc.text("MCI STORE", pageWidth / 2, 14, { align: 'center' });
      headerBottom = 17;
    }
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(60);
    doc.text("MCI STORE COMÉRCIO E SERVIÇOS LTDA", pageWidth / 2, headerBottom + 3, { align: 'center' });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.text("Matriz: CNPJ 05.502.390/0001-11 — Rua Senador Pompeu, 1547, Centro, Fortaleza/CE", pageWidth / 2, headerBottom + 6.5, { align: 'center' });
    doc.text("Filiais: CNPJ 05.502.390/0002-00 (Armazém Itajaí/SC)  •  CNPJ 05.502.390/0003-83 (São Paulo/SP)", pageWidth / 2, headerBottom + 9.5, { align: 'center' });
    doc.setDrawColor(200, 200, 200);
    doc.line(margin, headerBottom + 12, pageWidth - margin, headerBottom + 12);

    // Title
    let yTop = headerBottom + 18;
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(15, 43, 38);
    doc.text("CONTRATO DE PRÉ-VENDA E ENTREGA FUTURA", pageWidth / 2, yTop, { align: 'center' });

    // Client
    doc.setTextColor(0);
    doc.setFontSize(9);
    doc.text("DADOS DO CLIENTE", margin, yTop + 7);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    let y = yTop + 12;
    doc.text(`Razão Social: ${data.client?.name || '-'}`, margin, y); y += 4;
    doc.text(`CNPJ: ${data.client?.document || '-'}   |   Cidade/UF: ${data.client?.city || '-'}`, margin, y); y += 4;
    doc.text(`Responsável: ${data.client?.responsible || '-'}   |   Contato: ${data.client?.phone || '-'} | ${data.client?.email || '-'}`, margin, y); y += 5;

    // Products (no Valor column)
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text("EQUIPAMENTOS / PRODUTOS", margin, y);
    y += 2;

    autoTable(doc, {
      startY: y,
      head: [['Equipamento', 'Descrição', 'Qtd']],
      body: (data.products || []).map((p: any) => [p.name, p.description, p.quantity]),
      theme: 'grid',
      headStyles: { fillColor: [15, 43, 38], fontSize: 8 },
      styles: { fontSize: 7.5, cellPadding: 1.5, overflow: 'linebreak' },
      columnStyles: { 0: { cellWidth: 95 }, 1: { cellWidth: 70 }, 2: { cellWidth: 15, halign: 'center' } },
      margin: { left: margin, right: margin }
    });

    y = ((doc as any).lastAutoTable?.finalY || y) + 6;

    // Commercial Conditions
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text("CONDIÇÕES COMERCIAIS", margin, y);
    y += 5;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(15, 80, 60);
    doc.text(`Valor Total: ${fmtBRL(data.commercial?.total_value || 0)}`, margin, y);
    y += 5;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(0);
    const delivery = doc.splitTextToSize(`Previsão de Entrega: ${data.commercial?.delivery_forecast || '-'}`, pageWidth - margin * 2);
    doc.text(delivery, margin, y); y += delivery.length * 4;
    const payment = doc.splitTextToSize(`Forma de Pagamento: ${data.commercial?.payment_terms || '-'}`, pageWidth - margin * 2);
    doc.text(payment, margin, y); y += payment.length * 4 + 3;

    // Additional Clauses
    const clauses = (data.commercial?.additional_clauses || '').trim();
    if (clauses) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.text("CLÁUSULAS ADICIONAIS", margin, y);
      y += 4;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      const clauseLines = doc.splitTextToSize(clauses, pageWidth - margin * 2);
      doc.text(clauseLines, margin, y);
      y += clauseLines.length * 3.5 + 4;
    }

    // Signature (client only)
    const sigY = Math.min(Math.max(y + 14, pageHeight - 30), pageHeight - 20);
    const sigW = 90;
    const sigX = (pageWidth - sigW) / 2;
    doc.setDrawColor(80);
    doc.line(sigX, sigY, sigX + sigW, sigY);
    doc.setFontSize(8.5);
    doc.setTextColor(0);
    doc.text("ASSINATURA DO CLIENTE", pageWidth / 2, sigY + 4, { align: 'center' });
    doc.setFontSize(7);
    doc.setTextColor(120);
    doc.text("O cliente poderá assinar a punho ou via GOV/assinatura digital.", pageWidth / 2, sigY + 9, { align: 'center' });

    return doc;
  };

  const downloadPDF = async (contractOrForm: any) => {
    try {
      const doc = await createPDFDocument(contractOrForm);
      doc.save(getFileName(contractOrForm));
    } catch (error: any) {
      console.error('Erro ao baixar PDF:', error);
      toast.error('Erro ao baixar PDF: ' + (error.message || 'verifique os dados do contrato'));
    }
  };

  const buildPdfBase64 = async (contractOrForm: any): Promise<string> => {
    const doc = await createPDFDocument(contractOrForm);
    const dataUri = doc.output('datauristring');
    return dataUri.replace(/^data:application\/pdf;base64,/, '');
  };

  const openSendSignature = (contract: any) => { setSignSendContract(contract); setSignSendOpen(true); };
  const openSignDetails = (contract: any) => { setSignDetailsContract(contract); setSignDetailsOpen(true); };

  const openPreview = async (contractOrForm: any = formData) => {
    try {
      setPreviewContract(contractOrForm);
      setPreviewOpen(true);
    } catch (error: any) {
      console.error('Erro ao abrir prévia PDF:', error);
      toast.error('Erro ao abrir prévia PDF: ' + (error.message || 'verifique os dados do contrato'));
    }
  };

  const previewData = previewContract ? getContractData(previewContract) : null;
  const fmtBRL = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

  const handleUploadSigned = async (contract: any, file: File, replacing = false) => {
    if (!user) { toast.error('Sessão inválida.'); return; }
    const allowed = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg'];
    if (!allowed.includes(file.type)) {
      toast.error('Formato inválido. Envie PDF, JPG ou PNG.');
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      toast.error('Arquivo muito grande (máx. 20MB).');
      return;
    }
    setUploadingId(contract.id);
    try {
      // Remove existing if replacing
      if (replacing && contract.signed_file_url) {
        const oldPath = contract.signed_file_url.split('/contracts/')[1];
        if (oldPath) await supabase.storage.from('contracts').remove([oldPath]);
      }
      const ext = file.name.split('.').pop();
      const path = `signed/${contract.id}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from('contracts').upload(path, file, { upsert: false });
      if (upErr) throw upErr;
      const { error: updErr } = await supabase
        .from('generated_contracts')
        .update({
          signed_file_url: path,
          signed_file_name: file.name,
          signed_uploaded_at: new Date().toISOString(),
          signed_uploaded_by: user.id,
          status: 'assinado',
        })
        .eq('id', contract.id);
      if (updErr) throw updErr;
      toast.success(replacing ? 'Arquivo substituído!' : 'Contrato assinado anexado!');
      fetchContracts();
    } catch (e: any) {
      toast.error('Erro ao anexar: ' + (e.message || 'desconhecido'));
    } finally {
      setUploadingId(null);
    }
  };

  const viewSigned = async (contract: any) => {
    if (!contract.signed_file_url) return;
    const { data, error } = await supabase.storage.from('contracts').createSignedUrl(contract.signed_file_url, 60 * 10);
    if (error) { toast.error('Erro ao abrir arquivo: ' + error.message); return; }
    window.open(data.signedUrl, '_blank');
  };

  const downloadSigned = async (contract: any) => {
    if (!contract.signed_file_url) return;
    const { data, error } = await supabase.storage.from('contracts').download(contract.signed_file_url);
    if (error) { toast.error('Erro ao baixar: ' + error.message); return; }
    const url = URL.createObjectURL(data);
    const a = document.createElement('a');
    a.href = url;
    a.download = contract.signed_file_name || 'contrato_assinado';
    a.click();
    URL.revokeObjectURL(url);
  };

  const removeSigned = async (contract: any) => {
    if (!canRemoveSigned) { toast.error('Sem permissão para remover.'); return; }
    if (!confirm('Remover anexo assinado deste contrato?')) return;
    try {
      if (contract.signed_file_url) {
        await supabase.storage.from('contracts').remove([contract.signed_file_url]);
      }
      const { error } = await supabase
        .from('generated_contracts')
        .update({
          signed_file_url: null,
          signed_file_name: null,
          signed_uploaded_at: null,
          signed_uploaded_by: null,
          status: 'enviado',
        })
        .eq('id', contract.id);
      if (error) throw error;
      toast.success('Anexo removido.');
      fetchContracts();
    } catch (e: any) {
      toast.error('Erro ao remover: ' + (e.message || 'desconhecido'));
    }
  };





  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FileText className="h-6 w-6 text-emerald-600" />
              Gerador de Contratos
            </h1>
            <p className="text-muted-foreground">Crie e gerencie contratos institucionais da MCI</p>
          </div>
          {view === 'list' ? (
            <Button onClick={() => { setEditingId(null); setFormData({ client: { ...initialClient }, products: [...initialProducts], commercial: { total_value: 115551, delivery_forecast: '', payment_terms: 'A combinar', notes: '', additional_clauses: '' }, mci_branch: 'matriz' }); setView('create'); }} className="bg-emerald-600 hover:bg-emerald-700">
              <Plus className="h-4 w-4 mr-2" /> Novo Contrato
            </Button>
          ) : (
            <Button variant="outline" onClick={() => setView('list')}>
              <History className="h-4 w-4 mr-2" /> Histórico
            </Button>
          )}
        </div>

        {view === 'list' ? (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-4">
              <CardTitle>Histórico</CardTitle>
              {canSeeAllContracts && (
                <Button
                  type="button"
                  variant={showAllContracts ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setShowAllContracts((v) => !v)}
                >
                  {showAllContracts ? 'Vendo todos os contratos' : 'Ver contratos de todos'}
                </Button>
              )}
            </CardHeader>

            <CardContent>
              {loading ? (
                <div className="flex justify-center py-8"><Loader2 className="animate-spin h-8 w-8 text-emerald-600" /></div>
              ) : contracts.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">Nenhum contrato gerado.</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Data</TableHead>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Valor</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {contracts.map((contract) => (
                      <TableRow key={contract.id}>
                        <TableCell className="text-xs">{format(new Date(contract.created_at), 'dd/MM/yyyy HH:mm')}</TableCell>
                        <TableCell className="font-medium text-sm">{contract.client_name}</TableCell>
                        <TableCell className="text-sm font-semibold">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(contract.total_value)}</TableCell>
                        <TableCell>
                          {(() => {
                            const meta = signatureLabel(contract.signature_status ?? 'draft');
                            const Icon = meta.icon;
                            return (
                              <Badge variant="outline" className={cn('gap-1', meta.className)}>
                                <Icon className="h-3 w-3" />
                                {meta.label}
                              </Badge>
                            );
                          })()}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1 flex-wrap">
                            <Button variant="ghost" size="icon" onClick={() => openPreview(contract)} title="Visualizar contrato">
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => downloadPDF(contract)} title="Baixar PDF original">
                              <FileDown className="h-4 w-4" />
                            </Button>
                            {(!contract.signature_status || ['draft','ready_to_send','cancelled','refused','expired'].includes(contract.signature_status)) && (
                              <Button variant="ghost" size="icon" title="Enviar para assinatura" onClick={() => openSendSignature(contract)}>
                                <Send className="h-4 w-4 text-emerald-600" />
                              </Button>
                            )}
                            <Button variant="ghost" size="icon" title="Detalhes da assinatura" onClick={() => openSignDetails(contract)}>
                              <ShieldCheck className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" title="Editar" onClick={() => {
                              setEditingId(contract.id);
                              setFormData(contract.contract_data_json || formData);
                              setView('create');
                            }}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" title="Duplicar" onClick={() => {
                              setEditingId(null);
                              setFormData(contract.contract_data_json || formData);
                              setView('create');
                            }}>
                              <Copy className="h-4 w-4" />
                            </Button>


                            {/* Signed contract actions */}
                            {!contract.signed_file_url ? (
                              <label title="Anexar Contrato Assinado">
                                <input
                                  type="file"
                                  accept="application/pdf,image/jpeg,image/png,image/jpg"
                                  className="hidden"
                                  onChange={(e) => {
                                    const f = e.target.files?.[0];
                                    if (f) handleUploadSigned(contract, f, false);
                                    e.target.value = '';
                                  }}
                                />
                                <Button variant="ghost" size="icon" asChild disabled={uploadingId === contract.id}>
                                  <span>
                                    {uploadingId === contract.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4 text-emerald-600" />}
                                  </span>
                                </Button>
                              </label>
                            ) : (
                              <>
                                <Button variant="ghost" size="icon" title={`Visualizar assinado (${contract.signed_file_name || ''})`} onClick={() => viewSigned(contract)}>
                                  <FileSignature className="h-4 w-4 text-emerald-600" />
                                </Button>
                                <Button variant="ghost" size="icon" title="Baixar assinado" onClick={() => downloadSigned(contract)}>
                                  <FileDown className="h-4 w-4 text-emerald-600" />
                                </Button>
                                <label title="Substituir arquivo assinado">
                                  <input
                                    type="file"
                                    accept="application/pdf,image/jpeg,image/png,image/jpg"
                                    className="hidden"
                                    onChange={(e) => {
                                      const f = e.target.files?.[0];
                                      if (f) handleUploadSigned(contract, f, true);
                                      e.target.value = '';
                                    }}
                                  />
                                  <Button variant="ghost" size="icon" asChild disabled={uploadingId === contract.id}>
                                    <span>{uploadingId === contract.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}</span>
                                  </Button>
                                </label>
                                {canRemoveSigned && (
                                  <Button variant="ghost" size="icon" title="Remover anexo" onClick={() => removeSigned(contract)}>
                                    <X className="h-4 w-4 text-red-500" />
                                  </Button>
                                )}
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between gap-2">
                  <CardTitle className="text-lg">Dados do Cliente</CardTitle>
                  <Button variant="outline" size="sm" onClick={() => { setClientSearch(''); setClientPickerOpen(true); }}>
                    <Users className="h-4 w-4 mr-1" /> Selecionar cliente
                  </Button>
                </CardHeader>
                <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1"><Label className="text-xs">Razão Social</Label><Input className="h-9" placeholder={clientPlaceholders.name} value={formData.client.name} onChange={e => setFormData({...formData, client: {...formData.client, name: e.target.value}})} /></div>
                  <div className="space-y-1"><Label className="text-xs">CNPJ</Label><Input className="h-9" placeholder={clientPlaceholders.document} value={formData.client.document} onChange={e => setFormData({...formData, client: {...formData.client, document: e.target.value}})} /></div>
                  <div className="space-y-1"><Label className="text-xs">Cidade/UF</Label><Input className="h-9" placeholder={clientPlaceholders.city} value={formData.client.city} onChange={e => setFormData({...formData, client: {...formData.client, city: e.target.value}})} /></div>
                  <div className="space-y-1"><Label className="text-xs">Responsável</Label><Input className="h-9" placeholder={clientPlaceholders.responsible} value={formData.client.responsible} onChange={e => setFormData({...formData, client: {...formData.client, responsible: e.target.value}})} /></div>
                  <div className="space-y-1"><Label className="text-xs">Telefone</Label><Input className="h-9" placeholder={clientPlaceholders.phone} value={formData.client.phone} onChange={e => setFormData({...formData, client: {...formData.client, phone: e.target.value}})} /></div>
                  <div className="space-y-1"><Label className="text-xs">E-mail</Label><Input className="h-9" placeholder={clientPlaceholders.email} value={formData.client.email} onChange={e => setFormData({...formData, client: {...formData.client, email: e.target.value}})} /></div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between"><CardTitle className="text-lg">Produtos</CardTitle><Button variant="outline" size="sm" onClick={addProduct}><Plus className="h-4 w-4 mr-1" /> Adicionar</Button></CardHeader>
                <CardContent className="space-y-3">
                  {formData.products.map((product: any, idx: number) => (
                    <div key={idx} className="p-3 border rounded-md relative grid grid-cols-1 md:grid-cols-2 gap-3 bg-muted/20">
                      <Button variant="ghost" size="icon" className="absolute top-1 right-1 h-7 w-7 text-red-500" onClick={() => removeProduct(idx)}><Trash2 className="h-4 w-4" /></Button>
                      <div className="md:col-span-2 space-y-1"><Label className="text-[10px] uppercase font-bold text-muted-foreground">Nome do Equipamento</Label><Input className="h-8 text-sm" value={product.name} onChange={e => updateProduct(idx, 'name', e.target.value)} /></div>
                      <div className="md:col-span-2 space-y-1"><Label className="text-[10px] uppercase font-bold text-muted-foreground">Descrição</Label><Input className="h-8 text-sm" value={product.description} onChange={e => updateProduct(idx, 'description', e.target.value)} /></div>
                      <div className="space-y-1"><Label className="text-[10px] uppercase font-bold text-muted-foreground">Qtd</Label><Input className="h-8 text-sm" type="number" value={product.quantity} onChange={e => updateProduct(idx, 'quantity', e.target.value)} /></div>
                      <div className="space-y-1"><Label className="text-[10px] uppercase font-bold text-muted-foreground">Valor Unitário</Label><Input className="h-8 text-sm" type="number" value={product.value} onChange={e => updateProduct(idx, 'value', parseFloat(e.target.value))} /></div>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle className="text-lg">Comercial</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1"><Label className="text-xs">Valor Total</Label><Input className="h-9 font-bold text-emerald-700" type="number" value={formData.commercial.total_value} onChange={e => setFormData({...formData, commercial: {...formData.commercial, total_value: parseFloat(e.target.value)}})} /></div>
                    <div className="space-y-1"><Label className="text-xs">Entrega Estimada</Label><Input className="h-9" value={formData.commercial.delivery_forecast} onChange={e => setFormData({...formData, commercial: {...formData.commercial, delivery_forecast: e.target.value}})} /></div>
                  </div>
                  <div className="space-y-1"><Label className="text-xs">Forma de Pagamento</Label><Input className="h-9" value={formData.commercial.payment_terms} onChange={e => setFormData({...formData, commercial: {...formData.commercial, payment_terms: e.target.value}})} /></div>
                  <div className="space-y-1"><Label className="text-xs">Cláusulas Adicionais</Label><Textarea className="text-sm" value={formData.commercial.additional_clauses} onChange={e => setFormData({...formData, commercial: {...formData.commercial, additional_clauses: e.target.value}})} /></div>
                </CardContent>
              </Card>
            </div>

            <div className="space-y-6">
              <Card className="bg-emerald-50/30 border-emerald-100">
                <CardHeader><CardTitle className="text-md">Configurações MCI</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-1"><Label className="text-xs">Template</Label><Select value={selectedTemplate} onValueChange={setSelectedTemplate}><SelectTrigger className="h-9"><SelectValue /></SelectTrigger><SelectContent>{templates.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent></Select></div>
                  <div className="space-y-1"><Label className="text-xs">Unidade</Label><Select value={formData.mci_branch} onValueChange={v => setFormData({...formData, mci_branch: v})}><SelectTrigger className="h-9"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="matriz">Matriz - Fortaleza/CE</SelectItem><SelectItem value="itajai">Filial - Itajaí/CE</SelectItem><SelectItem value="sp">Filial - São Paulo/SP</SelectItem></SelectContent></Select></div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle className="text-md">Conclusão</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  {editingId ? (
                    <Button className="w-full bg-emerald-600 hover:bg-emerald-700 h-11" onClick={() => handleSave('enviado')} disabled={saving}>{saving ? <Loader2 className="animate-spin h-4 w-4 mr-2" /> : <FileText className="h-4 w-4 mr-2" />}Atualizar Contrato</Button>
                  ) : (
                    <Button className="w-full bg-emerald-600 hover:bg-emerald-700 h-11" onClick={() => handleSave('enviado')} disabled={saving}>{saving ? <Loader2 className="animate-spin h-4 w-4 mr-2" /> : <FileText className="h-4 w-4 mr-2" />}Gerar Contrato</Button>
                  )}
                  <Button variant="outline" className="w-full" onClick={() => handleSave('rascunho')} disabled={saving}>Salvar Rascunho</Button>
                  <Button variant="secondary" className="w-full" onClick={() => openPreview(formData)}><Eye className="h-4 w-4 mr-2" /> Prévia PDF</Button>
                  <Button variant="ghost" className="w-full text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => { setEditingId(null); setView('list'); }} disabled={saving}><X className="h-4 w-4 mr-2" /> Cancelar</Button>
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
          <DialogContent className="max-w-5xl h-[90vh] p-0 gap-0 overflow-hidden">
            <DialogHeader className="px-5 py-4 border-b flex-row items-center justify-between space-y-0">
              <DialogTitle>Prévia do contrato</DialogTitle>
              <Button variant="outline" size="sm" className="mr-8" onClick={() => previewContract && downloadPDF(previewContract)} disabled={!previewContract}>
                <FileDown className="h-4 w-4 mr-2" /> Baixar PDF
              </Button>
            </DialogHeader>
            {previewData ? (
              <div className="h-full overflow-auto bg-muted/40 p-4 md:p-6">
                <article className="mx-auto min-h-[297mm] w-full max-w-[210mm] space-y-5 bg-background p-8 text-sm shadow-sm">
                  <header className="space-y-2 border-b pb-4 text-center">
                    <img src="/mci-logo-contract.jpg" alt="MCI Store" className="mx-auto h-14 w-auto object-contain" />
                    <div className="text-xs text-muted-foreground">
                      <p className="font-semibold text-foreground">MCI STORE COMÉRCIO E SERVIÇOS LTDA</p>
                      <p>Matriz: CNPJ 05.502.390/0001-11 — Rua Senador Pompeu, 1547, Centro, Fortaleza/CE</p>
                      <p>Filiais: CNPJ 05.502.390/0002-00 (Armazém Itajaí/SC) • CNPJ 05.502.390/0003-83 (São Paulo/SP)</p>
                    </div>
                  </header>

                  <h2 className="text-center text-base font-bold text-emerald-900">CONTRATO DE PRÉ-VENDA E ENTREGA FUTURA</h2>

                  <section className="space-y-1">
                    <h3 className="font-bold">DADOS DO CLIENTE</h3>
                    <p>Razão Social: {previewData.client?.name || '-'}</p>
                    <p>CNPJ: {previewData.client?.document || '-'} | Cidade/UF: {previewData.client?.city || '-'}</p>
                    <p>Responsável: {previewData.client?.responsible || '-'} | Contato: {previewData.client?.phone || '-'} | {previewData.client?.email || '-'}</p>
                  </section>

                  <section className="space-y-2">
                    <h3 className="font-bold">EQUIPAMENTOS / PRODUTOS</h3>
                    <div className="overflow-hidden rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Equipamento</TableHead>
                            <TableHead>Descrição</TableHead>
                            <TableHead className="w-16 text-center">Qtd</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {(previewData.products || []).map((product: any, index: number) => (
                            <TableRow key={`${product.name}-${index}`}>
                              <TableCell className="align-top font-medium">{product.name || '-'}</TableCell>
                              <TableCell className="align-top">{product.description || '-'}</TableCell>
                              <TableCell className="text-center align-top">{product.quantity || 0}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </section>

                  <section className="space-y-1">
                    <h3 className="font-bold">CONDIÇÕES COMERCIAIS</h3>
                    <p className="text-lg font-bold text-emerald-700">Valor Total: {fmtBRL(previewData.commercial?.total_value || 0)}</p>
                    <p>Previsão de Entrega: {previewData.commercial?.delivery_forecast || '-'}</p>
                    <p>Forma de Pagamento: {previewData.commercial?.payment_terms || '-'}</p>
                  </section>

                  {previewData.commercial?.additional_clauses ? (
                    <section className="space-y-1">
                      <h3 className="font-bold">CLÁUSULAS ADICIONAIS</h3>
                      <p className="whitespace-pre-wrap">{previewData.commercial.additional_clauses}</p>
                    </section>
                  ) : null}

                  <footer className="pt-16 text-center text-xs text-muted-foreground">
                    <div className="mx-auto mb-2 h-px w-72 bg-border" />
                    <p className="text-foreground font-medium">ASSINATURA DO CLIENTE</p>
                    <p>O cliente poderá assinar a punho ou via GOV/assinatura digital.</p>
                  </footer>
                </article>
              </div>
            ) : (
              <div className="flex h-full items-center justify-center text-muted-foreground">Gerando prévia...</div>
            )}
          </DialogContent>
        </Dialog>

        {signSendContract && (
          <SendForSignatureDialog
            open={signSendOpen}
            onOpenChange={setSignSendOpen}
            contract={signSendContract}
            buildPdfBase64={buildPdfBase64}
            onSent={() => fetchContracts()}
          />
        )}
        <SignatureDetailsDrawer
          open={signDetailsOpen}
          onOpenChange={setSignDetailsOpen}
          contract={signDetailsContract}
          onChanged={() => fetchContracts()}
        />

        <Dialog open={clientPickerOpen} onOpenChange={setClientPickerOpen}>
          <DialogContent className="w-[calc(100vw-32px)] max-w-[560px] p-0 gap-0 overflow-hidden bg-background">
            <DialogHeader className="px-5 py-4 border-b">
              <DialogTitle className="text-base">Selecionar cliente</DialogTitle>
            </DialogHeader>
            <div className="px-5 pt-4 pb-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  autoFocus
                  className="pl-9"
                  placeholder="Buscar por nome, empresa, CNPJ, e-mail ou cidade..."
                  value={clientSearch}
                  onChange={(e) => setClientSearch(e.target.value)}
                />
              </div>
            </div>
            <div className="px-5 pb-5 max-h-[60vh] overflow-y-auto">
              <div className="space-y-2">
                {loadingClients ? (
                  <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Carregando...
                  </div>
                ) : clientResults.length === 0 ? (
                  <div className="text-center py-8 text-sm text-muted-foreground">
                    Nenhum cliente encontrado.
                  </div>
                ) : clientResults.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => applyClient(c)}
                    className="w-full min-w-0 text-left p-3 rounded-md border bg-card hover:border-primary hover:bg-primary/5 transition-colors"
                  >
                    <div className="min-w-0 font-medium text-sm truncate">{c.company_name || c.name}</div>
                    <div className="min-w-0 text-xs text-muted-foreground truncate mt-0.5">
                      {[c.cpf_cnpj, c.email, [c.city, c.state].filter(Boolean).join('/')].filter(Boolean).join(' • ') || '—'}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}

