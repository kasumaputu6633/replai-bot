import { beforeEach, describe, expect, it, vi } from 'vitest';

const { completionCreate } = vi.hoisted(() => ({
  completionCreate: vi.fn(),
}));

vi.mock('openai', () => ({
  default: class MockOpenAI {
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
    completionCreate.mockResolvedValue({
      choices: [{ message: { content: 'Menurut gue, idenya bagus tapi eksekusinya ramai.' } }],
    });
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
    expect(request.messages).toHaveLength(4);
    expect(request.messages[0]).toMatchObject({ role: 'system' });
    expect(request.messages[0].content).toContain('"Ox Alpha"');
    expect(request.messages[0].content).toContain('Nando Ganteng');
    expect(request.messages[1]).toEqual({
      role: 'user',
      content: '[Nanda]: Menurutku warnanya terlalu ramai.',
    });
    expect(request.messages[2]).toEqual({
      role: 'assistant',
      content: 'Iya, kontrasnya bertabrakan.',
    });
    expect(request.messages[3].role).toBe('user');
    expect(request.messages[3].content[0].text).toContain('"activeRequest"');
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
});
