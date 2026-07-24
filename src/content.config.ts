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
    // When true, the post is a preview: viewable at its URL (noindex) but hidden
    // from the blog list. Flip to false in the CMS to publish publicly.
    draft: z.boolean().default(false),
  }),
});

export const collections = { blog };
