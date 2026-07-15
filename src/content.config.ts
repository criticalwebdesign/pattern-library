import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const groups = defineCollection({
  loader: glob({
    pattern: "*/index.md",
    base: "./src/content/groups",
    generateId: ({ entry }) => entry.split("/")[0],
  }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      category: z.enum(["web", "app", "game", "material"]),
      platform: z.enum(["mobile", "console", "desktop", "browser"]).optional(),
      author: z.string().optional(),
      url: z.string().url().optional(),
      trailerUrl: z.string().url().optional(),
      description: z.string().optional(),
      images: z
        .object({
          src: image(),
          alt: z.string(),
          tags: z.array(z.string()).default([]),
          caption: z.string().optional(),
        })
        .array()
        .default([]),
    }),
});

export const collections = { groups };
