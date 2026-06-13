declare module 'yt-search' {
  export interface VideoSearchResult {
    title: string;
    url: string;
    image: string;
    duration: {
      seconds: number;
      timestamp: string;
    };
    author: { name: string; url: string };
  }

  export interface SearchResult {
    videos: VideoSearchResult[];
    playlists: any[];
    channels: any[];
  }

  export default function search(query: string): Promise<SearchResult>;
}
