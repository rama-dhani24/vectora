import { Construction } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Card, CardContent } from "@/components/ui/card";

export async function ComingSoon({ milestone }: { milestone: number }) {
  const t = await getTranslations("common");
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
        <span className="bg-muted flex size-12 items-center justify-center rounded-full">
          <Construction className="text-muted-foreground size-6" aria-hidden />
        </span>
        <p className="font-medium">{t("comingSoon", { milestone })}</p>
        <p className="text-muted-foreground max-w-sm text-sm">
          {t("comingSoonBody", { milestone })}
        </p>
      </CardContent>
    </Card>
  );
}
