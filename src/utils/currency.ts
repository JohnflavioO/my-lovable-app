
export function parseMoneyBR(value: any): number {
  if (value === null || value === undefined || value === '') return 0;
  if (typeof value === 'number') return value;
  let str = String(value)
    .replace(/R\$/g, '')
    .replace(/\u00A0/g, '')
    .replace(/\s/g, '')
    .trim();
  str = str.replace(/[^\d.,-]/g, '');
  if (str.includes('.') && str.includes(',')) {
    return Number(str.replace(/\./g, '').replace(',', '.')) || 0;
  }
  if (str.includes(',') && !str.includes('.')) {
    return Number(str.replace(',', '.')) || 0;
  }
  // Apenas pontos OU apenas dígitos: ponto = milhar no padrão BR exportado
  if (str.includes('.')) {
    return Number(str.replace(/\./g, '')) || 0;
  }
  return Number(str) || 0;
}

export const parseCurrencyBR = (value: any): number => {
  if (value === null || value === undefined || value === '') return 0;

  // Se for um número e o usuário está reclamando de divisão por 100, 
  // pode ser que o motor de leitura do Excel (SheetJS) já esteja dividindo.
  // No entanto, para arquivos HTML exportados como XLS, costuma vir como STRING.
  if (typeof value === 'number') {
    return value;
  }

  // Limpeza total de espaços HTML, símbolos e espaços em branco
  let str = String(value)
    .replace(/&nbsp;/g, '')
    .replace(/\u00A0/g, '')
    .replace(/R\$/g, '')
    .replace(/\s/g, '')
    .trim();

  if (!str) return 0;

  // LÓGICA DE PRECISÃO TOTAL PARA EXPORTAÇÕES BRASILEIRAS (SISTEMA MCI)
  // O sistema exportador (HTML) usa ponto para MILHAR e vírgula para DECIMAL.
  // Ex: "10.000,00" -> 10000.00
  // Ex: "3.556,70" -> 3556.70
  // Ex: "10.000" -> 10000
  
  // 1. Se contém vírgula, tratamos como o padrão brasileiro (vírgula = decimal)
  if (str.includes(',')) {
    // Removemos todos os pontos (que são milhares) e trocamos a vírgula por ponto decimal (padrão JS)
    const sanitized = str.replace(/\./g, '').replace(',', '.');
    return Number(sanitized);
  }

  // 2. Se NÃO contém vírgula, mas contém ponto(s), tratamos como MILHAR.
  if (str.includes('.')) {
    // Para o financeiro do MCI, se vier "10.000" sem vírgula, é dez mil reais, não dez.
    // Portanto, removemos o ponto.
    const sanitized = str.replace(/\./g, '');
    return Number(sanitized);
  }

  // 3. Apenas dígitos (ex: "10000")
  const num = Number(str);
  return isNaN(num) ? 0 : num;
};
