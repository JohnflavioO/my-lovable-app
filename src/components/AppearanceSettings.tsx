import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useTheme } from "@/components/theme-provider";
import { Monitor, Moon, Sun } from "lucide-react";

export default function AppearanceSettings() {
  const { theme, setTheme } = useTheme();

  return (
    <Card className="border-none shadow-none bg-transparent">
      <CardHeader className="px-0 pt-0">
        <CardTitle className="text-xl font-bold">Aparência</CardTitle>
        <CardDescription>
          Personalize como o MCI CRM aparece no seu dispositivo.
        </CardDescription>
      </CardHeader>
      <CardContent className="px-0">
        <RadioGroup
          defaultValue={theme}
          onValueChange={(value) => setTheme(value as any)}
          className="grid grid-cols-1 md:grid-cols-3 gap-4"
        >
          <div>
            <RadioGroupItem
              value="light"
              id="light"
              className="peer sr-only"
            />
            <Label
              htmlFor="light"
              className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary cursor-pointer transition-all"
            >
              <Sun className="mb-3 h-6 w-6 text-orange-500" />
              <span className="font-medium">Claro</span>
            </Label>
          </div>
          <div>
            <RadioGroupItem
              value="dark"
              id="dark"
              className="peer sr-only"
            />
            <Label
              htmlFor="dark"
              className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary cursor-pointer transition-all"
            >
              <Moon className="mb-3 h-6 w-6 text-blue-400" />
              <span className="font-medium">Escuro</span>
            </Label>
          </div>
          <div>
            <RadioGroupItem
              value="system"
              id="system"
              className="peer sr-only"
            />
            <Label
              htmlFor="system"
              className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary cursor-pointer transition-all"
            >
              <Monitor className="mb-3 h-6 w-6 text-slate-500" />
              <span className="font-medium">Sistema</span>
            </Label>
          </div>
        </RadioGroup>
      </CardContent>
    </Card>
  );
}
