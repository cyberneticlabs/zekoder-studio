import { defineCollection, defineContentConfig, z } from "@nuxt/content";

// One collection per locale. `prefix: ""` keeps a page path identical in every locale, so
// `en/getting-started/install.md` and `fr/getting-started/install.md` are both
// `/getting-started/install` and the page can fall back from a locale to English by path.
const schema = z.object({
  navigation: z
    .union([
      z.boolean(),
      z.object({
        title: z.string().optional(),
        description: z.string().optional(),
        icon: z.string().optional(),
        // Sidebar position among siblings; unset sorts first. `whats-changed.md` uses 99.
        order: z.number().optional(),
      }),
    ])
    .optional(),
});

function localeCollection(locale: "en" | "fr" | "ar") {
  return defineCollection({
    type: "page",
    source: { include: `${locale}/**`, prefix: "" },
    schema,
  });
}

export default defineContentConfig({
  collections: {
    docs_en: localeCollection("en"),
    docs_fr: localeCollection("fr"),
    docs_ar: localeCollection("ar"),
  },
});
