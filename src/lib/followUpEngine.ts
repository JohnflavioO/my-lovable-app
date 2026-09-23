/**
 * Follow-up Intelligence Engine
 * 
 * Generates contextual follow-up suggestions based on negotiation data.
 * Prepared for future Genkit integration — the generateFollowUp function
 * can be replaced by an edge function call to Genkit.
 */

export interface FollowUpContext {
  clientName: string;
  companyName: string;
  contactName: string;
  currentStage: string;
  daysWithoutInteraction: number;
  lastInteraction: string | null;
  objectionReason: string | null;
  quoteValue: number;
  sellerName: string;
  tone: 'leve' | 'objetivo' | 'urgente' | 'reativacao';
  objective: FollowUpObjective;
  quoteNumber: string;
}

export type FollowUpObjective =
  | 'retomar_conversa'
  | 'cobrar_decisao'
  | 'reforcar_valor'
  | 'contornar_objecao'
  | 'recuperar_lead';

export type FollowUpCategory = 'retomada' | 'objecao' | 'reativacao' | 'acompanhamento';

export interface FollowUpSuggestion {
  message: string;
  category: FollowUpCategory;
  intention: string;
  cta: string;
  tone: string;
}

// Determine tone based on days without interaction
export function determineTone(days: number): FollowUpContext['tone'] {
  if (days <= 2) return 'leve';
  if (days <= 7) return 'objetivo';
  if (days <= 15) return 'urgente';
  return 'reativacao';
}

// Determine objective based on stage + days
export function determineObjective(stage: string, days: number, objection: string | null): FollowUpObjective {
  if (objection) return 'contornar_objecao';
  if (days >= 15) return 'recuperar_lead';
  
  switch (stage) {
    case 'pre_venda':
      return days >= 5 ? 'recuperar_lead' : 'retomar_conversa';
    case 'contato_feito':
      return days >= 7 ? 'cobrar_decisao' : 'retomar_conversa';
    case 'sent':
      return days >= 5 ? 'cobrar_decisao' : 'reforcar_valor';
    case 'negociacao':
      return days >= 3 ? 'cobrar_decisao' : 'reforcar_valor';
    default:
      return 'retomar_conversa';
  }
}

// Determine category from objective
function determineCategory(objective: FollowUpObjective): FollowUpCategory {
  switch (objective) {
    case 'retomar_conversa': return 'retomada';
    case 'cobrar_decisao': return 'acompanhamento';
    case 'reforcar_valor': return 'acompanhamento';
    case 'contornar_objecao': return 'objecao';
    case 'recuperar_lead': return 'reativacao';
  }
}

const stageLabels: Record<string, string> = {
  pre_venda: 'Pré-venda',
  contato_feito: 'Contato Feito',
  sent: 'Proposta Enviada',
  negociacao: 'Negociação',
  approved: 'Fechado',
};

const formatCurrency = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

/**
 * Generate follow-up suggestion based on context.
 * 
 * FUTURE: Replace this function body with a call to an edge function
 * that uses Genkit for AI-powered message generation.
 * 
 * Payload structure for Genkit:
 * POST /functions/v1/generate-followup
 * Body: FollowUpContext
 * Response: FollowUpSuggestion
 */
export function generateFollowUp(ctx: FollowUpContext): FollowUpSuggestion {
  const _category = determineCategory(ctx.objective);
  const name = ctx.contactName || ctx.companyName || ctx.clientName || 'Cliente';
  const company = ctx.companyName || '';

  // Pre-venda templates
  if (ctx.currentStage === 'pre_venda') {
    if (ctx.daysWithoutInteraction <= 2) {
      return {
        message: `Olá ${name}! Tudo bem? Sou ${ctx.sellerName} da MCI. Vi que temos soluções que podem te ajudar${company ? ` na ${company}` : ''}. Posso te apresentar algumas opções? Tenho certeza que vai se surpreender com o custo-benefício.`,
        category: 'retomada',
        intention: 'Abrir conversa inicial',
        cta: 'Agendar apresentação',
        tone: 'Leve e amigável',
      };
    }
    if (ctx.daysWithoutInteraction <= 7) {
      return {
        message: `${name}, tudo bem? Entrei em contato há alguns dias sobre nossas soluções${company ? ` para a ${company}` : ''}. Sei que a rotina é corrida, mas queria confirmar se conseguiu avaliar. Posso agendar uma conversa rápida de 10 minutos no melhor horário pra você?`,
        category: 'retomada',
        intention: 'Retomar conversa',
        cta: 'Sugerir horário para conversa',
        tone: 'Objetivo e respeitoso',
      };
    }
    return {
      message: `Olá ${name}! Faz um tempo que conversamos e queria retomar o contato. Temos novidades e condições especiais que podem fazer sentido${company ? ` para a ${company}` : ''}. Que tal uma conversa rápida para eu te atualizar?`,
      category: 'reativacao',
      intention: 'Recuperar lead frio',
      cta: 'Propor conversa sem compromisso',
      tone: 'Reativação gentil',
    };
  }

  // Contato feito templates
  if (ctx.currentStage === 'contato_feito') {
    if (ctx.daysWithoutInteraction <= 3) {
      return {
        message: `${name}, como combinamos na nossa conversa, estou preparando uma proposta personalizada${company ? ` para a ${company}` : ''}. Tem alguma necessidade específica que eu deva considerar? Quero garantir que a proposta atenda exatamente o que vocês precisam.`,
        category: 'acompanhamento',
        intention: 'Avançar para proposta',
        cta: 'Confirmar necessidades antes da proposta',
        tone: 'Proativo e consultivo',
      };
    }
    if (ctx.daysWithoutInteraction <= 7) {
      return {
        message: `${name}, tudo bem? Conversamos recentemente e fiquei de retornar com mais informações. Tenho uma proposta que pode ser interessante${ctx.quoteValue > 0 ? ` com condições especiais` : ''}. Quando podemos conversar para eu apresentar?`,
        category: 'acompanhamento',
        intention: 'Cobrar retorno',
        cta: 'Agendar apresentação da proposta',
        tone: 'Objetivo',
      };
    }
    return {
      message: `Olá ${name}! Tivemos uma boa conversa há algum tempo e gostaria de retomar. O cenário pode ter mudado, e temos novidades que podem se encaixar melhor agora. Posso te ligar rapidamente para alinharmos?`,
      category: 'reativacao',
      intention: 'Reativar contato',
      cta: 'Propor ligação rápida',
      tone: 'Reativação',
    };
  }

  // Proposta enviada templates
  if (ctx.currentStage === 'sent') {
    if (ctx.objectionReason === 'caro' || ctx.objective === 'contornar_objecao') {
      return {
        message: `${name}, entendo a preocupação com o investimento. Mas quero te mostrar como ${ctx.quoteValue > 0 ? `o valor de ${formatCurrency(ctx.quoteValue)}` : 'essa proposta'} se paga rapidamente. Nossos equipamentos têm durabilidade e performance superiores, o que reduz custos a médio prazo. Posso detalhar o retorno sobre investimento pra você?`,
        category: 'objecao',
        intention: 'Contornar objeção de preço',
        cta: 'Apresentar ROI / custo-benefício',
        tone: 'Consultivo e seguro',
      };
    }
    if (ctx.daysWithoutInteraction <= 2) {
      return {
        message: `${name}, enviei a proposta ${ctx.quoteNumber}${ctx.quoteValue > 0 ? ` no valor de ${formatCurrency(ctx.quoteValue)}` : ''}. Queria saber se conseguiu analisar e se ficou alguma dúvida. Estou à disposição para ajustar qualquer detalhe!`,
        category: 'acompanhamento',
        intention: 'Acompanhar proposta enviada',
        cta: 'Verificar se há dúvidas',
        tone: 'Leve',
      };
    }
    if (ctx.daysWithoutInteraction <= 7) {
      return {
        message: `${name}, nossa proposta ${ctx.quoteNumber} está em análise há ${ctx.daysWithoutInteraction} dias. Sei que decisões assim demandam tempo, mas quero garantir que não perca as condições especiais. Tem algum ponto que eu possa esclarecer para agilizar a decisão?`,
        category: 'acompanhamento',
        intention: 'Criar senso de urgência moderado',
        cta: 'Esclarecer dúvidas para decisão',
        tone: 'Objetivo',
      };
    }
    return {
      message: `${name}, faz ${ctx.daysWithoutInteraction} dias que enviei a proposta ${ctx.quoteNumber}. Gostaria de entender se ainda faz sentido para ${company || 'vocês'}. Se o cenário mudou, posso ajustar a proposta conforme a nova necessidade. O que acha?`,
      category: 'reativacao',
      intention: 'Recuperar proposta parada',
      cta: 'Oferecer ajuste na proposta',
      tone: 'Reativação',
    };
  }

  // Negociação templates
  if (ctx.currentStage === 'negociacao') {
    if (ctx.objectionReason === 'caro') {
      return {
        message: `${name}, entendo a questão do valor. Preparei uma análise de custo-benefício${ctx.quoteValue > 0 ? ` para o investimento de ${formatCurrency(ctx.quoteValue)}` : ''} mostrando como nossos equipamentos geram economia a longo prazo. Posso apresentar? Também temos opções de parcelamento que podem facilitar.`,
        category: 'objecao',
        intention: 'Contornar objeção com benefícios',
        cta: 'Apresentar condições facilitadas',
        tone: 'Consultivo',
      };
    }
    if (ctx.objectionReason === 'prazo') {
      return {
        message: `${name}, sobre o prazo que mencionou, consegui verificar alternativas para agilizar a entrega. Podemos trabalhar com prioridade no seu pedido. Quer que eu formalize as novas condições?`,
        category: 'objecao',
        intention: 'Resolver objeção de prazo',
        cta: 'Apresentar prazo revisado',
        tone: 'Proativo',
      };
    }
    if (ctx.daysWithoutInteraction <= 3) {
      return {
        message: `${name}, como está a análise da nossa proposta? Estamos prontos para fechar e começar a atender ${company || 'vocês'} o quanto antes. Precisa de algum ajuste para finalizarmos?`,
        category: 'acompanhamento',
        intention: 'Pedir decisão',
        cta: 'Fechar negociação',
        tone: 'Objetivo',
      };
    }
    if (ctx.daysWithoutInteraction <= 7) {
      return {
        message: `${name}, nossa negociação está parada há ${ctx.daysWithoutInteraction} dias e quero entender se posso fazer algo mais para ajudar na decisão. Existe algum ponto que precisa ser revisto? Estou pronto para ajustar o que for necessário.`,
        category: 'acompanhamento',
        intention: 'Cobrar decisão com abertura',
        cta: 'Identificar bloqueio e resolver',
        tone: 'Urgente mas aberto',
      };
    }
    return {
      message: `${name}, percebo que a negociação ficou parada. Quero ser transparente: as condições que ofereci são especiais e tenho prazo limitado para mantê-las. Se ainda há interesse, vamos alinhar esta semana? Se o cenário mudou, me avise para eu entender melhor.`,
      category: 'reativacao',
      intention: 'Última tentativa de reativação',
      cta: 'Definir prazo final',
      tone: 'Urgente e direto',
    };
  }

  // Default fallback
  return {
    message: `Olá ${name}! Sou ${ctx.sellerName} e gostaria de retomar nosso contato. Tem novidades que podem te interessar${company ? ` para a ${company}` : ''}. Podemos conversar?`,
    category: 'retomada',
    intention: 'Retomar contato geral',
    cta: 'Iniciar conversa',
    tone: 'Leve',
  };
}

/**
 * Build the payload that will be sent to Genkit in the future.
 * This function structures all needed data for AI generation.
 */
export function buildGenkitPayload(ctx: FollowUpContext) {
  return {
    client: {
      name: ctx.clientName,
      company: ctx.companyName,
      contact: ctx.contactName,
    },
    negotiation: {
      stage: ctx.currentStage,
      stageLabel: stageLabels[ctx.currentStage] || ctx.currentStage,
      daysWithoutInteraction: ctx.daysWithoutInteraction,
      lastInteraction: ctx.lastInteraction,
      objection: ctx.objectionReason,
      quoteValue: ctx.quoteValue,
      quoteNumber: ctx.quoteNumber,
    },
    seller: {
      name: ctx.sellerName,
    },
    preferences: {
      tone: ctx.tone,
      objective: ctx.objective,
    },
  };
}
