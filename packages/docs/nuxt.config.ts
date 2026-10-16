// Static documentation site. `NUXT_APP_BASE_URL` and `NUXT_PUBLIC_DOCS_VERSION` are set per
// release by the publish job (see docs/docs-site.md); unset means base `/` and version `dev`.
export default defineNuxtConfig({
  compatibilityDate: "2026-10-01",

  modules: ["@nuxt/ui", "@nuxt/content", "@nuxtjs/i18n"],

  devtools: { enabled: false },

  css: ["~/assets/css/main.css"],

  content: {
    experimental: {
      // node:sqlite ships with Node 22.5+, so no native sqlite dependency is installed.
      sqliteConnector: "native",
    },
  },

  ui: {
    // Fonts are self-hosted through @fontsource; never reach a third-party provider.
    fonts: false,
  },

  icon: {
    // Bundle icons at build time; no runtime calls to the Iconify API.
    provider: "none",
    fallbackToApi: false,
    clientBundle: { scan: true },
  },

  colorMode: {
    preference: "system",
    fallback: "light",
    classSuffix: "",
  },

  runtimeConfig: {
    public: {
      docsVersion: "dev",
    },
  },

  nitro: {
    prerender: {
      crawlLinks: true,
      routes: ["/", "/fr", "/ar", "/404.html"],
      failOnError: true,
    },
  },

  i18n: {
    // Static generation needs real /fr and /ar routes.
    strategy: "prefix_except_default",
    defaultLocale: "en",
    detectBrowserLanguage: false,
    locales: [
      { code: "en", language: "en-GB", name: "English", file: "en.json" },
      { code: "fr", language: "fr-FR", name: "Français", file: "fr.json" },
      { code: "ar", language: "ar", name: "العربية", dir: "rtl", file: "ar.json" },
    ],
  },
});
