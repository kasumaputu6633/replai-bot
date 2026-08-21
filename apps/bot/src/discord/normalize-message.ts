import {
  extractHttpUrls,
  isSupportedImage,
  MAX_ATTACHMENTS,
  MAX_EMBEDS,
  MAX_IMAGES,
  MAX_SOURCE_TEXT_LENGTH,
  MAX_URLS,
  type SourceAttachment,
  type SourceContext,
  type SourceEmbed,
  type SourceImage,
} from '@replai/core';
import type { Message, MessageSnapshot } from 'discord.js';

export interface DiscordAttachmentData {
  url: string;
  filename: string;
  contentType?: string | null | undefined;
  size?: number | undefined;
}

export interface DiscordEmbedData {
  title?: string | null | undefined;
  description?: string | null | undefined;
  url?: string | null | undefined;
  imageUrl?: string | null | undefined;
  thumbnailUrl?: string | null | undefined;
  provider?: string | null | undefined;
  author?: string | null | undefined;
}

export interface DiscordMessageContentData {
  content?: string | null | undefined;
  attachments: readonly DiscordAttachmentData[];
  embeds: readonly DiscordEmbedData[];
}

export interface DiscordMessageData extends DiscordMessageContentData {
  id: string;
  snapshots?: readonly DiscordMessageContentData[] | undefined;
}

function cleanOptional(value: string | null | undefined): string | undefined {
  const cleaned = value?.trim();
  return cleaned ? cleaned : undefined;
}

function normalizeAttachment(data: DiscordAttachmentData): SourceAttachment {
  const attachment: SourceAttachment = {
    url: data.url,
    filename: data.filename,
  };

  const contentType = cleanOptional(data.contentType);
  if (contentType) {
    attachment.contentType = contentType;
  }
  if (data.size !== undefined) {
    attachment.size = data.size;
  }

  return attachment;
}

function normalizeEmbed(data: DiscordEmbedData): SourceEmbed | null {
  const embed: SourceEmbed = {};
  const fields: Array<[keyof SourceEmbed, string | null | undefined]> = [
    ['title', data.title],
    ['description', data.description],
    ['url', data.url],
    ['imageUrl', data.imageUrl],
    ['thumbnailUrl', data.thumbnailUrl],
    ['provider', data.provider],
    ['author', data.author],
  ];

  for (const [key, value] of fields) {
    const cleaned = cleanOptional(value);
    if (cleaned) {
      embed[key] = cleaned;
    }
  }

  return Object.keys(embed).length > 0 ? embed : null;
}

function addImage(images: SourceImage[], seenUrls: Set<string>, image: SourceImage): void {
  if (images.length >= MAX_IMAGES || seenUrls.has(image.url)) {
    return;
  }
  seenUrls.add(image.url);
  images.push(image);
}

export function normalizeMessageData(data: DiscordMessageData): SourceContext {
  const sourceData = data.snapshots?.[0] ?? data;
  const content = cleanOptional(sourceData.content);
  const text = content ? content.slice(0, MAX_SOURCE_TEXT_LENGTH) : null;
  const attachments = sourceData.attachments.slice(0, MAX_ATTACHMENTS).map(normalizeAttachment);
  const embeds = sourceData.embeds
    .slice(0, MAX_EMBEDS)
    .map(normalizeEmbed)
    .filter((embed): embed is SourceEmbed => embed !== null);

  const images: SourceImage[] = [];
  const seenImageUrls = new Set<string>();

  for (const attachment of attachments) {
    if (isSupportedImage(attachment.contentType, attachment.filename)) {
      addImage(images, seenImageUrls, {
        url: attachment.url,
        ...(attachment.contentType ? { contentType: attachment.contentType } : {}),
        filename: attachment.filename,
      });
    }
  }

  for (const embed of embeds) {
    if (embed.imageUrl) {
      addImage(images, seenImageUrls, { url: embed.imageUrl });
    }
    if (embed.thumbnailUrl) {
      addImage(images, seenImageUrls, { url: embed.thumbnailUrl });
    }
  }

  const embedValues = embeds.flatMap((embed) => [
    embed.title,
    embed.description,
    embed.url,
    embed.imageUrl,
    embed.thumbnailUrl,
    embed.provider,
    embed.author,
  ]);

  return {
    messageId: data.id,
    text,
    urls: extractHttpUrls(text, ...embedValues).slice(0, MAX_URLS),
    images,
    attachments,
    embeds,
  };
}

function mapDiscordContent(message: Message | MessageSnapshot): DiscordMessageContentData {
  return {
    content: message.content,
    attachments: [...message.attachments.values()].map((attachment) => ({
      url: attachment.url,
      filename: attachment.name,
      contentType: attachment.contentType,
      size: attachment.size,
    })),
    embeds: message.embeds.map((embed) => ({
      title: embed.title,
      description: embed.description,
      url: embed.url,
      imageUrl: embed.image?.url,
      thumbnailUrl: embed.thumbnail?.url,
      provider: embed.provider?.name,
      author: embed.author?.name,
    })),
  };
}

export function normalizeDiscordMessage(message: Message): SourceContext {
  const snapshots = [...message.messageSnapshots.values()].map(mapDiscordContent);

  return normalizeMessageData({
    id: message.id,
    ...mapDiscordContent(message),
    ...(snapshots.length > 0 ? { snapshots } : {}),
  });
}
