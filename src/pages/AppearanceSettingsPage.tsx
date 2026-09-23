import AppLayout from "@/components/AppLayout";
import AppearanceSettings from "@/components/AppearanceSettings";
import { Button } from "@/components/ui/button";
import { Settings } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function AppearanceSettingsPage() {
  const navigate = useNavigate();

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto p-4 md:p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Settings className="h-6 w-6 text-primary" /> Aparência
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Personalize a interface do MCI CRM.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => navigate(-1)}>
            Voltar
          </Button>
        </div>

        <AppearanceSettings />
      </div>
    </AppLayout>
  );
}
