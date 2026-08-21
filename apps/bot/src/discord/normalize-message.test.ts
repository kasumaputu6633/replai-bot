import { describe, expect, it } from 'vitest';
import { normalizeMessageData } from './normalize-message.js';

describe('normalizeMessageData', () => {
  it('converts Discord-like data into bounded provider-independent context', () => {
    const result = normalizeMessageData({
      id: 'message-1',
      content: 'Claim at https://example.com and https://example.com',
      attachments: [
        {
          url: 'https://cdn.discordapp.com/photo.webp',
          filename: 'photo.webp',
          contentType: null,
          size: 42,
        },
        {
          url: 'https://cdn.discordapp.com/document.pdf',
          filename: 'document.pdf',
          contentType: 'application/pdf',
        },
      ],
      embeds: [
        {
          title: 'Original report',
          description: 'See https://openai.com for context.',
          url: 'https://news.example/article',
          imageUrl: 'https://images.example/chart.png',
          provider: 'Example News',
          author: 'Reporter',
        },
      ],
    });

    expect(result).toMatchObject({
      messageId: 'message-1',
      text: 'Claim at https://example.com and https://example.com',
      attachments: [
        { filename: 'photo.webp', size: 42 },
        { filename: 'document.pdf', contentType: 'application/pdf' },
      ],
      images: [
        { url: 'https://cdn.discordapp.com/photo.webp', filename: 'photo.webp' },
        { url: 'https://images.example/chart.png' },
      ],
    });
    expect(result.urls).toEqual([
      'https://example.com/',
      'https://openai.com/',
      'https://news.example/article',
      'https://images.example/chart.png',
    ]);
  });

  it('uses forwarded message snapshot content when the outer message is empty', () => {
    const result = normalizeMessageData({
      id: 'forwarded-message-1',
      content: '',
      attachments: [],
      embeds: [],
      snapshots: [
        {
          content: 'Official announcement at https://official.example/news',
          attachments: [
            {
              url: 'https://cdn.discordapp.com/announcement.png',
              filename: 'announcement.png',
              contentType: 'image/png',
              size: 128,
            },
          ],
          embeds: [
            {
              title: 'Announcement details',
              description: 'Read https://news.example/coverage',
              url: 'https://official.example/details',
              imageUrl: 'https://official.example/header.jpg',
              provider: 'Official Publisher',
            },
          ],
        },
      ],
    });

    expect(result.messageId).toBe('forwarded-message-1');
    expect(result.text).toBe('Official announcement at https://official.example/news');
    expect(result.attachments).toEqual([
      {
        url: 'https://cdn.discordapp.com/announcement.png',
        filename: 'announcement.png',
        contentType: 'image/png',
        size: 128,
      },
    ]);
    expect(result.images).toEqual([
      {
        url: 'https://cdn.discordapp.com/announcement.png',
        filename: 'announcement.png',
        contentType: 'image/png',
      },
      { url: 'https://official.example/header.jpg' },
    ]);
    expect(result.embeds).toHaveLength(1);
    expect(result.urls).toEqual([
      'https://official.example/news',
      'https://news.example/coverage',
      'https://official.example/details',
      'https://official.example/header.jpg',
    ]);
  });
});
