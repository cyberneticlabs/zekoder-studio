import { ar, en, fr } from "@nuxt/ui/locale";

const uiLocales = { en, fr, ar };

// Nuxt UI's own component strings (and `dir`) follow the active site locale.
export function useUiLocale() {
  const { locale } = useI18n();
  return computed(() => uiLocales[locale.value as keyof typeof uiLocales] ?? en);
}
