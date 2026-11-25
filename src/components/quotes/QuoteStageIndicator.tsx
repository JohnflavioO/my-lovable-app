import { LockKeyhole } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { QuoteStage } from './quoteStage';

const STEPS = [1, 2, 3, 4] as const;

/** Mini progresso de 4 passos + nome da etapa. Apenas visual. */
export function QuoteStageIndicator({ stage, locked }: { stage: QuoteStage; locked?: boolean }) {
  return (
    <div className="min-w-[112px]" title={stage.label}>
      <div className="flex w-28 gap-[3px]" aria-hidden="true">
        {STEPS.map((i) => (
          <span
            key={i}
            className={cn('h-1.5 flex-1 rounded-full', stage.step >= i ? stage.barClass : 'bg-muted')}
          />
        ))}
      </div>
      <p className={cn('mt-1.5 flex items-center gap-1 text-xs font-semibold whitespace-nowrap', stage.textClass)}>
        {locked && <LockKeyhole className="h-3 w-3" aria-hidden="true" />}
        {stage.label}
      </p>
    </div>
  );
}
