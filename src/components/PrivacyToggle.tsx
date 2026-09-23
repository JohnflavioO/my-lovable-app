import { Eye, EyeOff } from 'lucide-react';
import { Button } from './ui/button';
import { usePrivacy } from '@/hooks/usePrivacy';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';

export default function PrivacyToggle() {
  const { isHidden, togglePrivacy } = usePrivacy();

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            onClick={togglePrivacy}
            className="rounded-full hover:bg-muted transition-all duration-300"
            aria-label={isHidden ? "Mostrar valores" : "Ocultar valores"}
          >
            {isHidden ? (
              <EyeOff className="h-5 w-5 text-muted-foreground animate-in fade-in zoom-in duration-300" />
            ) : (
              <Eye className="h-5 w-5 text-primary animate-in fade-in zoom-in duration-300" />
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>{isHidden ? "Mostrar valores financeiros" : "Ocultar valores financeiros"}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
