export interface SourceImage {
  url: string;
  contentType?: string | undefined;
  filename?: string | undefined;
}

export interface SourceAttachment {
  url: string;
  filename: string;
  contentType?: string | undefined;
  size?: number | undefined;
}

export interface SourceEmbed {
  title?: string | undefined;
  description?: string | undefined;
  url?: string | undefined;
  imageUrl?: string | undefined;
  thumbnailUrl?: string | undefined;
  provider?: string | undefined;
  author?: string | undefined;
}

export interface SourceAuthor {
  id: string;
  name: string;
  avatarUrl?: string | undefined;
  bot?: boolean | undefined;
}

export interface SourcePollAnswer {
  id: number;
  text: string | null;
  emoji?: string | undefined;
  voteCount: number;
}

export interface SourcePoll {
  question: string | null;
  answers: SourcePollAnswer[];
  allowMultiselect: boolean;
  expiresAt: string | null;
  resultsFinalized: boolean;
}

export interface SourceContext {
  messageId: string;
  author?: SourceAuthor | undefined;
  text: string | null;
  urls: string[];
  images: SourceImage[];
  attachments: SourceAttachment[];
  embeds: SourceEmbed[];
  poll?: SourcePoll | undefined;
}
