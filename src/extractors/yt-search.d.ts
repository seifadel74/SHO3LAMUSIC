declare module 'yt-search' {
  interface VideoSearchResult {
    type: 'video';
    videoId: string;
    url: string;
    title: string;
    description: string;
    image: string;
    thumbnail: string;
    seconds: number;
    timestamp: string;
    duration: { seconds: number; timestamp: string };
    ago: string;
    views: number;
    author: { name: string; url: string };
  }

  interface SearchResult {
    videos: VideoSearchResult[];
    playlists: any[];
    channels: any[];
    live: any[];
  }

  export default function search(query: string): Promise<SearchResult>;
}
