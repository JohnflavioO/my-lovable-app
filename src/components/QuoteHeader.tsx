export default function QuoteHeader() {
  return (
    <div className="rounded-t-lg overflow-hidden border">
      {/* Top bar */}
      <div className="bg-gradient-to-r from-teal-500 to-teal-600 text-center py-1.5">
        <span className="text-white font-bold text-sm tracking-wider">ORDEM DE COMPRA / ORÇAMENTO</span>
      </div>

      {/* Main content */}
      <div className="bg-gradient-to-br from-slate-50 to-white p-4">
        <div className="flex items-start gap-6">
          {/* Logo */}
          <div className="flex-shrink-0">
            <img src="/mci-logo-quote.png" alt="MCI Store" className="w-20 h-auto" />
            <p className="text-[9px] text-teal-700 font-medium mt-1 text-center">Distribuidor Oficial Brasil</p>
          </div>

          {/* Locations grid */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 flex-1 text-[11px] leading-tight">
            {/* Ceará */}
            <div>
              <p className="font-bold text-teal-700 mb-1">🇧🇷 CEARÁ</p>
              <p className="text-muted-foreground">Rua Senador Pompeu, 1547</p>
              <p className="text-muted-foreground">Centro - CEP: 60.025-001</p>
              <p className="text-muted-foreground">Tel.: <span className="font-semibold text-teal-700">+55 (85) 3254-4700</span></p>
              <p className="text-muted-foreground font-semibold">CNPJ: 05.502.390/0001-11</p>
            </div>

            {/* Santa Catarina */}
            <div>
              <p className="font-bold text-teal-700 mb-1">🇧🇷 SANTA CATARINA</p>
              <p className="text-muted-foreground">Rua Odílio Garcia, 211</p>
              <p className="text-muted-foreground">Sala B, Box 10 - Cordeiro</p>
              <p className="text-muted-foreground">CEP: 88310-180</p>
              <p className="text-muted-foreground font-semibold">CNPJ: 05.502.390/0002-00</p>
            </div>

            {/* São Paulo */}
            <div>
              <p className="font-bold text-teal-700 mb-1">🇧🇷 SÃO PAULO</p>
              <p className="text-muted-foreground">Av. Imperatriz Leopoldina, 1718</p>
              <p className="text-muted-foreground">2º andar - Vila Leopoldina</p>
              <p className="text-muted-foreground">CEP: 05305-003</p>
              <p className="text-muted-foreground font-semibold">CNPJ: 05.502.390/0003-83</p>
            </div>

            {/* Miami */}
            <div>
              <p className="font-bold text-teal-700 mb-1">🇺🇸 MIAMI</p>
              <p className="text-muted-foreground">8123 NW 29th</p>
              <p className="text-muted-foreground">St Doral, FL - USA</p>
              <p className="text-muted-foreground">+1 (786) 925-6661</p>
              <p className="text-muted-foreground font-semibold">MCI IMP & EXP CORP</p>
            </div>
          </div>
        </div>

        {/* Brands bar */}
        <div className="mt-3 pt-2 border-t border-slate-200 flex flex-wrap items-center justify-center gap-3 text-[10px] font-semibold text-slate-500 tracking-wide">
          {['Aputure', 'DZOFILM', 'Caligri', 'SECCED', 'Amaran', 'Miliboo', 'Dearkol', '7artisans', 'CREAM SOURCE', 'DopChoice', 'Astera', 'Kupo'].map(b => (
            <span key={b}>{b}</span>
          ))}
        </div>
      </div>
    </div>
  );
}
