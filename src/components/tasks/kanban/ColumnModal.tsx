import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface ColumnModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (name: string, color: string) => void;
  title: string;
  initialName?: string;
  initialColor?: string;
  existingNames?: string[];
}

const colors = [
  { name: 'Slate', value: '#94a3b8' },
  { name: 'Red', value: '#ef4444' },
  { name: 'Orange', value: '#f97316' },
  { name: 'Amber', value: '#f59e0b' },
  { name: 'Green', value: '#22c55e' },
  { name: 'Blue', value: '#3b82f6' },
  { name: 'Indigo', value: '#6366f1' },
  { name: 'Purple', value: '#a855f7' },
  { name: 'Pink', value: '#ec4899' },
];

export default function ColumnModal({ 
  isOpen, 
  onClose, 
  onSave, 
  title, 
  initialName = '', 
  initialColor = '#94a3b8',
  existingNames = []
}: ColumnModalProps) {
  const [name, setName] = useState(initialName);
  const [color, setColor] = useState(initialColor);
  const [error, setError] = useState('');

  const handleSave = () => {
    setError('');
    const trimmedName = name.trim();

    if (!trimmedName) {
      setError('O nome da coluna é obrigatório.');
      return;
    }

    if (trimmedName.length > 40) {
      setError('O nome deve ter no máximo 40 caracteres.');
      return;
    }

    if (trimmedName !== initialName && existingNames.some(n => n.toLowerCase() === trimmedName.toLowerCase())) {
      setError('Já existe uma coluna com este nome.');
      return;
    }

    onSave(trimmedName, color);
    onClose();
    setName('');
    setColor('#94a3b8');
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px] rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">{title}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-6 py-4">
          <div className="space-y-2">
            <Label htmlFor="name" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Nome da Coluna
            </Label>
            <Input
              id="name"
              placeholder="Ex: Em revisão"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (error) setError('');
              }}
              className={cn("h-11 rounded-xl", error && "border-destructive focus-visible:ring-destructive")}
              maxLength={40}
            />
            {error && <p className="text-[11px] font-medium text-destructive mt-1">{error}</p>}
          </div>
          
          <div className="space-y-3">
            <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Cor de Identificação
            </Label>
            <div className="flex flex-wrap gap-2.5">
              {colors.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setColor(c.value)}
                  className={cn(
                    "w-8 h-8 rounded-full border-2 transition-all hover:scale-110 active:scale-95",
                    color === c.value ? "border-primary ring-2 ring-primary/20 scale-110" : "border-transparent"
                  )}
                  style={{ backgroundColor: c.value }}
                  title={c.name}
                />
              ))}
            </div>
          </div>
        </div>
        <DialogFooter className="sm:justify-end gap-2 mt-2">
          <Button variant="ghost" onClick={onClose} className="rounded-xl h-11 px-6">
            Cancelar
          </Button>
          <Button onClick={handleSave} className="rounded-xl h-11 px-8 font-bold bg-primary hover:bg-primary/90 shadow-md">
            {initialName ? 'Salvar Alterações' : 'Criar Coluna'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
