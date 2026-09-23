import { Card, CardContent } from '@/components/ui/card';
import { Construction } from 'lucide-react';

export default function SupportPlaceholder({ title }: { title: string }) {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{title}</h1>
      <Card>
        <CardContent className="py-16 text-center text-muted-foreground">
          <Construction className="h-12 w-12 mx-auto mb-3 opacity-50" />
          <p className="font-medium">Em construção</p>
          <p className="text-sm">Este módulo será entregue na próxima fase.</p>
        </CardContent>
      </Card>
    </div>
  );
}
