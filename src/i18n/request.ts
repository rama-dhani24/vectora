import { getRequestConfig } from "next-intl/server";
import { defaultLocale } from "@/i18n/config";

export default getRequestConfig(async () => {
  return {
    locale: defaultLocale,
    timeZone: "Africa/Dar_es_Salaam",
    messages: (await import("../../messages/en.json")).default,
  };
});
