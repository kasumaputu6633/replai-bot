export interface OpenAICompatibleProviderConfig {
  apiKey: string;
  baseURL: string;
  model: string;
  webSearchModel?: string | undefined;
  webSearchMaxResults?: number | undefined;
  webFetchModel?: string | undefined;
}

export interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
  publishedAt?: string | undefined;
}

export interface WebFetchResult {
  url: string;
  title: string;
  content: string;
  author?: string | undefined;
  publishedAt?: string | undefined;
}
