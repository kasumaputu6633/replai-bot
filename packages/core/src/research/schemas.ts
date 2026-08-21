import { z } from 'zod';
import {
  MAX_ATTACHMENTS,
  MAX_COMPARISON_SOURCES,
  MAX_EMBEDS,
  MAX_IMAGES,
  MAX_RESEARCH_TURN_LENGTH,
  MAX_RESEARCH_TURNS,
  MAX_SOURCE_TEXT_LENGTH,
  MAX_URLS,
} from '../context/limits.js';

const optionalNonEmptyString = z.string().trim().min(1).optional();

export const sourceImageSchema = z.object({
  url: z.url(),
  contentType: optionalNonEmptyString,
  filename: optionalNonEmptyString,
});

export const sourceAttachmentSchema = z.object({
  url: z.url(),
  filename: z.string().trim().min(1),
  contentType: optionalNonEmptyString,
  size: z.number().int().nonnegative().optional(),
});

export const sourceEmbedSchema = z.object({
  title: optionalNonEmptyString,
  description: optionalNonEmptyString,
  url: z.url().optional(),
  imageUrl: z.url().optional(),
  thumbnailUrl: z.url().optional(),
  provider: optionalNonEmptyString,
  author: optionalNonEmptyString,
});

export const sourceContextSchema = z.object({
  messageId: z.string().trim().min(1),
  text: z.string().max(MAX_SOURCE_TEXT_LENGTH).nullable(),
  urls: z.array(z.url()).max(MAX_URLS),
  images: z.array(sourceImageSchema).max(MAX_IMAGES),
  attachments: z.array(sourceAttachmentSchema).max(MAX_ATTACHMENTS),
  embeds: z.array(sourceEmbedSchema).max(MAX_EMBEDS),
});

export const researchModeSchema = z.enum(['answer', 'verify', 'compare']);

export const researchTurnSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().trim().min(1).max(MAX_RESEARCH_TURN_LENGTH),
});

export const researchInputSchema = z.object({
  question: z.string().trim().min(1).max(2_000),
  source: sourceContextSchema,
  mode: researchModeSchema.optional(),
  context: z.array(researchTurnSchema).max(MAX_RESEARCH_TURNS).optional(),
  comparisonSources: z.array(sourceContextSchema).max(MAX_COMPARISON_SOURCES).optional(),
  metadata: z
    .object({
      guildId: optionalNonEmptyString,
      channelId: optionalNonEmptyString,
      sourceMessageId: optionalNonEmptyString,
      queryMessageId: optionalNonEmptyString,
      userId: optionalNonEmptyString,
    })
    .optional(),
});
