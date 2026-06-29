import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const blog = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/blog' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    pubDate: z.coerce.date(),
    author: z.string().default('InfoOnVisa'),
    tags: z.array(z.string()).default([]),
    cover: z.string().optional(),
    readMins: z.number().optional(),
  }),
});

export const collections = { blog };
