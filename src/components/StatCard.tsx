import { memo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { usePrivacy } from '@/hooks/usePrivacy';

interface StatCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  trend?: string;
  className?: string;
  onClick?: () => void;
  isCurrency?: boolean;
}

function StatCard({ title, value, icon: Icon, trend, className, onClick, isCurrency = false }: StatCardProps) {
  const { maskValue } = usePrivacy();
  
  // Decide if we should format/mask the value
  const displayValue = isCurrency || typeof value === 'string' && value.includes('R$') 
    ? maskValue(typeof value === 'number' ? value : value) 
    : value;

  return (
    <Card 
      className={cn(
        'shadow-card transition-all duration-300 group relative overflow-hidden h-full', 
        onClick ? 'hover:shadow-elevated hover:border-primary/50 cursor-pointer active:scale-[0.98]' : '',
        className
      )}
      onClick={onClick}
    >
      <CardContent className="p-3 sm:p-4 md:p-6 h-full flex flex-col justify-center">
        <div className="flex items-center justify-between gap-2 sm:gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 mb-0.5 sm:mb-1">
              <p className="text-[10px] sm:text-xs md:text-sm font-medium text-muted-foreground/80 truncate uppercase tracking-wider">{title}</p>
            </div>
            <div className="flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-2">
              <p className="text-lg sm:text-xl md:text-2xl lg:text-3xl font-bold font-display tracking-tight truncate leading-tight">
                {displayValue}
              </p>
              {trend && <p className="text-[10px] sm:text-xs text-success font-medium flex items-center gap-0.5">{trend}</p>}
            </div>
            {onClick && (
              <div className="mt-1 sm:mt-2 flex items-center gap-1 text-[10px] md:text-xs text-primary font-semibold opacity-0 group-hover:opacity-100 transform translate-y-1 group-hover:translate-y-0 transition-all duration-200">
                Ver detalhes <span className="text-base leading-none">→</span>
              </div>
            )}
          </div>
          <div className="relative shrink-0">
            <div className="w-8 h-8 sm:w-10 sm:h-10 md:w-14 md:h-14 rounded-xl sm:rounded-2xl bg-primary/10 flex items-center justify-center transition-transform group-hover:scale-110 group-hover:rotate-3 duration-300">
              <Icon className="h-4 w-4 sm:h-5 w-5 md:h-7 md:w-7 text-primary" />
            </div>
            <div className="absolute inset-0 bg-primary/20 blur-xl rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-500 -z-10" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default memo(StatCard);
