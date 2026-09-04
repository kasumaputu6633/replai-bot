import { beforeEach, describe, expect, it, vi } from 'vitest';

const { completionCreate, openAIConfigs } = vi.hoisted(() => ({
  completionCreate: vi.fn(),
  openAIConfigs: [] as unknown[],
}));

vi.mock('openai', () => ({
  default: class MockOpenAI {
    public constructor(config: unknown) {
      openAIConfigs.push(config);
    }

    public readonly chat = {
      completions: {
        create: completionCreate,
      },
    };
  },
}));

import { OpenAICompatibleResearchProvider } from './openai-compatible.js';

describe('OpenAICompatibleResearchProvider conversation messages', () => {
  beforeEach(() => {
    completionCreate.mockReset();
    openAIConfigs.length = 0;
    completionCreate.mockResolvedValue({
      choices: [{ message: { content: 'Menurut gue, idenya bagus tapi eksekusinya ramai.' } }],
    });
  });

  it('reports when an answer was produced without any web research', async () => {
    const provider = new OpenAICompatibleResearchProvider({
      apiKey: 'test-key',
      baseURL: 'https://gateway.example/v1',
      model: 'provider-model-id',
    });

    const result = await provider.research({
      question: 'discord.js masih support FileUploadBuilder ga?',
      source: {
        messageId: 'source',
        text: 'discord.js masih support FileUploadBuilder ga?',
        urls: [],
        images: [],
        attachments: [],
        embeds: [],
      },
    });

    expect(result.diagnostics).toEqual({
      interaction: 'research',
      searchPerformed: false,
      searchResultCount: 0,
      fetchedPageCount: 0,
      evidenceCount: 0,
      webSearchConfigured: false,
    });
  });

  it('enables Exa web search from the base URL without a search model', async () => {
    const webFetch = vi.fn<typeof fetch>();
    webFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          results: [
            {
              url: 'https://discordjs.dev/docs',
              title: 'FileUploadBuilder',
              text: 'File upload component builder.',
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    vi.stubGlobal('fetch', webFetch);

    try {
      const provider = new OpenAICompatibleResearchProvider({
        apiKey: 'test-key',
        baseURL: 'https://gateway.example/v1',
        model: 'provider-model-id',
        webApiKey: 'exa-key',
        webBaseURL: 'https://api.exa.ai',
      });

      const result = await provider.research({
        question: 'discord.js masih support FileUploadBuilder ga?',
        source: {
          messageId: 'source',
          text: 'discord.js masih support FileUploadBuilder ga?',
          urls: [],
          images: [],
          attachments: [],
          embeds: [],
        },
      });

      expect(webFetch).toHaveBeenCalled();
      expect(String(webFetch.mock.calls[0]?.[0])).toBe('https://api.exa.ai/search');
      expect(result.diagnostics).toMatchObject({
        interaction: 'research',
        searchPerformed: true,
        searchResultCount: 1,
        webSearchConfigured: true,
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('searches when a short follow-up challenges a replied technical claim', async () => {
    const webFetch = vi.fn<typeof fetch>();
    webFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          results: [
            {
              url: 'https://discordjs.dev/docs/packages/builders/main/FileUploadBuilder:Class',
              title: 'FileUploadBuilder',
              text: 'Creates file upload components for Discord modals.',
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    vi.stubGlobal('fetch', webFetch);

    try {
      const provider = new OpenAICompatibleResearchProvider({
        apiKey: 'test-key',
        baseURL: 'https://gateway.example/v1',
        model: 'provider-model-id',
        webApiKey: 'exa-key',
        webBaseURL: 'https://api.exa.ai',
      });

      const result = await provider.research({
        question: 'setau saya ada deh',
        source: {
          messageId: 'replied-bot-message',
          text: 'Discord API tidak punya komponen file picker di dalam modal.',
          urls: [],
          images: [],
          attachments: [],
          embeds: [],
        },
      });

      const requestBody = JSON.parse(String(webFetch.mock.calls[0]?.[1]?.body)) as {
        query: string;
      };
      expect(requestBody.query).toContain('setau saya ada deh');
      expect(requestBody.query).toContain('Discord API tidak punya komponen file picker');
      expect(result.diagnostics).toMatchObject({
        interaction: 'research',
        searchPerformed: true,
        searchResultCount: 1,
        evidenceCount: 1,
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('configures the OpenAI-compatible client for xAI Grok', async () => {
    const provider = new OpenAICompatibleResearchProvider({
      apiKey: 'xai-key',
      baseURL: 'https://api.x.ai/v1',
      model: 'grok-4',
    });

    await provider.research({
      question: 'halo',
      source: {
        messageId: 'source',
        text: 'halo',
        urls: [],
        images: [],
        attachments: [],
        embeds: [],
      },
    });

    expect(openAIConfigs[0]).toMatchObject({
      apiKey: 'xai-key',
      baseURL: 'https://api.x.ai/v1',
    });
    expect(completionCreate.mock.calls[0]?.[0]).toMatchObject({ model: 'grok-4' });
  });

  it('sends real multi-turn roles, speaker labels, identity, and creativity settings', async () => {
    const provider = new OpenAICompatibleResearchProvider({
      apiKey: 'test-key',
      baseURL: 'https://gateway.example/v1',
      model: 'provider-model-id',
      publicModelName: 'Ox Alpha',
      ownerName: 'Nando Ganteng',
      temperature: 0.85,
    });

    await provider.research({
      question: 'menurut lu desain ini bagus gak? bahas agak dalam',
      metadata: { userId: 'putu', speakerName: 'Putu' },
      context: [
        {
          role: 'user',
          content: 'Menurutku warnanya terlalu ramai.',
          speakerId: 'nanda',
          speakerName: 'Nanda',
        },
        {
          role: 'assistant',
          content: 'Iya, kontrasnya bertabrakan.',
          speakerId: 'bot',
          speakerName: 'Replai',
        },
      ],
      source: {
        messageId: 'source',
        author: { id: 'nanda', name: 'Nanda' },
        text: 'Menurutku warnanya terlalu ramai.',
        urls: [],
        images: [],
        attachments: [],
        embeds: [],
      },
    });

    expect(completionCreate).toHaveBeenCalledOnce();
    const request = completionCreate.mock.calls[0]?.[0];
    expect(request).toMatchObject({ model: 'provider-model-id', temperature: 0.85 });
    // A bystander's message must not enter the transcript as an addressed turn; it
    // travels inside the prompt payload as labeled background instead.
    expect(request.messages).toHaveLength(3);
    expect(request.messages[0]).toMatchObject({ role: 'system' });
    expect(request.messages[0].content).toContain('"Ox Alpha"');
    expect(request.messages[0].content).toContain('Nando Ganteng');
    expect(request.messages[1]).toEqual({
      role: 'assistant',
      content: 'Iya, kontrasnya bertabrakan.',
    });
    expect(request.messages[2].role).toBe('user');
    expect(request.messages[2].content[0].text).toContain('"activeRequest"');
    expect(request.messages[2].content[0].text).toContain('Menurutku warnanya terlalu ramai.');
  });

  it('omits temperature when the provider should use its own default', async () => {
    const provider = new OpenAICompatibleResearchProvider({
      apiKey: 'test-key',
      baseURL: 'https://gateway.example/v1',
      model: 'provider-model-id',
    });

    await provider.research({
      question: 'halo',
      source: {
        messageId: 'source',
        text: 'halo',
        urls: [],
        images: [],
        attachments: [],
        embeds: [],
      },
    });

    expect(completionCreate.mock.calls[0]?.[0]).not.toHaveProperty('temperature');
  });

  it('sends deduplicated labeled avatars for mentioned users and caps the image count', async () => {
    const provider = new OpenAICompatibleResearchProvider({
      apiKey: 'test-key',
      baseURL: 'https://gateway.example/v1',
      model: 'provider-model-id',
    });
    const mentionedUsers = Array.from({ length: 5 }, (_, index) => ({
      id: `member-${index}`,
      name: `Member ${index}`,
      avatarUrl: `https://cdn.discordapp.com/member-${index}.png`,
    }));

    await provider.research({
      question: 'menurut lu mereka gimana?',
      metadata: {
        userId: 'active',
        speakerName: 'Active User',
        speakerAvatarUrl: 'https://cdn.discordapp.com/active.png',
        mentionedUsers: [...mentionedUsers, mentionedUsers[0]!],
      },
      source: {
        messageId: 'source',
        author: {
          id: 'source-author',
          name: 'Source Author',
          avatarUrl: 'https://cdn.discordapp.com/source.png',
        },
        text: 'context',
        urls: [],
        images: [],
        attachments: [],
        embeds: [],
      },
    });

    const request = completionCreate.mock.calls[0]?.[0];
    const content = request.messages.at(-1).content as Array<{
      type: string;
      text?: string;
      image_url?: { url: string };
    }>;
    const avatarImages = content.filter((part) => part.type === 'image_url');
    const labels = content.filter((part) => part.type === 'text').map((part) => part.text);

    expect(avatarImages).toHaveLength(4);
    expect(avatarImages.map((part) => part.image_url?.url)).toEqual(
      mentionedUsers.slice(0, 4).map((participant) => participant.avatarUrl),
    );
    expect(labels).toContainEqual(expect.stringContaining('Member 0 (user ID member-0)'));
    expect(labels.join('\n')).not.toContain('Source Author (user ID source-author)');
    expect(labels.join('\n')).not.toContain('Active User (user ID active)');
  });

  it('adds source and active-speaker avatars for appearance requests', async () => {
    const provider = new OpenAICompatibleResearchProvider({
      apiKey: 'test-key',
      baseURL: 'https://gateway.example/v1',
      model: 'provider-model-id',
    });

    await provider.research({
      question: 'roast avatar gue dan dia dong',
      metadata: {
        userId: 'active',
        speakerName: 'Active User',
        speakerAvatarUrl: 'https://cdn.discordapp.com/active.png',
      },
      source: {
        messageId: 'source',
        author: {
          id: 'source-author',
          name: 'Source Author',
          avatarUrl: 'https://cdn.discordapp.com/source.png',
        },
        text: 'context',
        urls: [],
        images: [],
        attachments: [],
        embeds: [],
      },
    });

    const request = completionCreate.mock.calls[0]?.[0];
    const content = request.messages.at(-1).content as Array<{
      type: string;
      text?: string;
      image_url?: { url: string };
    }>;
    expect(content.map((part) => part.image_url?.url).filter(Boolean)).toEqual([
      'https://cdn.discordapp.com/source.png',
      'https://cdn.discordapp.com/active.png',
    ]);
  });

  it('compacts short casual provider output before delivery', async () => {
    completionCreate.mockResolvedValueOnce({
      choices: [{ message: { content: 'Santai aja, bro.\n\nNgapain dibikin ribet.' } }],
    });
    const provider = new OpenAICompatibleResearchProvider({
      apiKey: 'test-key',
      baseURL: 'https://gateway.example/v1',
      model: 'provider-model-id',
    });

    const result = await provider.research({
      question: 'menurut lu gimana?',
      source: {
        messageId: 'source',
        text: 'context',
        urls: [],
        images: [],
        attachments: [],
        embeds: [],
      },
    });

    expect(result.content).toBe('Santai aja, bro. Ngapain dibikin ribet.');
  });
});
