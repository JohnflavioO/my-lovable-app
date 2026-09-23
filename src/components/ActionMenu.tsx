import React from 'react';
import { 
  MoreHorizontal, 
  MoreVertical 
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';

export interface ActionItem {
  label: string;
  icon: React.ElementType;
  onClick: () => void;
  variant?: 'default' | 'destructive' | 'ghost' | 'outline' | 'secondary';
  className?: string;
  disabled?: boolean;
  isLoading?: boolean;
  isPrimary?: boolean; // WhatsApp
  isSecondary?: boolean; // Editar
  showInBar?: boolean; // Force showing in the bar if possible
}

interface ActionMenuProps {
  actions: ActionItem[];
  className?: string;
  variant?: 'horizontal' | 'vertical';
}

export function ActionMenu({ actions, className, variant = 'horizontal' }: ActionMenuProps) {
  const isMobile = useIsMobile();
  const [isNotebook, setIsNotebook] = React.useState(false);

  React.useEffect(() => {
    const checkSize = () => {
      setIsNotebook(window.innerWidth >= 768 && window.innerWidth < 1280);
    };
    checkSize();
    window.addEventListener('resize', checkSize);
    return () => window.removeEventListener('resize', checkSize);
  }, []);

  // Filter actions that should be visible in the bar based on screen size
  const visibleActions = React.useMemo(() => {
    if (isMobile) return [];
    
    if (isNotebook) {
      // In notebooks, only show primary (WhatsApp)
      return actions.filter(a => a.isPrimary && !a.disabled).slice(0, 1);
    }
    
    // In desktop, show primary and secondary (WhatsApp and Edit)
    return actions.filter(a => (a.isPrimary || a.isSecondary) && !a.disabled).slice(0, 2);
  }, [actions, isMobile, isNotebook]);

  // Actions that will go into the dropdown
  const dropdownActions = React.useMemo(() => {
    if (isMobile) return actions;
    
    // In other sizes, exclude the ones already visible in the bar
    const visibleLabels = visibleActions.map(a => a.label);
    return actions.filter(a => !visibleLabels.includes(a.label));
  }, [actions, visibleActions, isMobile]);

  const DotsIcon = variant === 'horizontal' ? MoreHorizontal : MoreVertical;

  return (
    <div className={cn("flex items-center gap-1", className)}>
      <TooltipProvider>
        {visibleActions.map((action, idx) => {
          const Icon = action.icon;
          return (
            <Tooltip key={idx}>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className={cn("h-8 w-8 rounded-full", action.className)}
                  onClick={(e) => {
                    e.stopPropagation();
                    action.onClick();
                  }}
                  disabled={action.disabled || action.isLoading}
                >
                  <Icon className={cn("h-4 w-4", action.isLoading && "animate-spin")} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>{action.label}</p>
              </TooltipContent>
            </Tooltip>
          );
        })}

        {dropdownActions.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-8 w-8 rounded-full hover:bg-muted"
                onClick={(e) => e.stopPropagation()}
              >
                <DotsIcon className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52 p-1">
              {dropdownActions.map((action, idx) => {
                const Icon = action.icon;
                return (
                  <DropdownMenuItem
                    key={idx}
                    onClick={(e) => {
                      e.stopPropagation();
                      action.onClick();
                    }}
                    disabled={action.disabled || action.isLoading}
                    className={cn(
                      "flex items-center gap-2 px-3 py-2 cursor-pointer rounded-md transition-colors",
                      action.variant === 'destructive' 
                        ? "text-destructive focus:bg-destructive/10 focus:text-destructive" 
                        : "text-foreground focus:bg-muted",
                      action.className
                    )}
                  >
                    <Icon className={cn("h-4 w-4", action.isLoading && "animate-spin")} />
                    <span className="flex-1 truncate">{action.label}</span>
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </TooltipProvider>
    </div>
  );
}
