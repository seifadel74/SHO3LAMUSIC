declare module 'yt-search' {
  interface VideoData {
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
    author: { name: string; url: string; };
  }

  interface SearchOptions {
    query?: string;
    videoId?: string;
    listId?: string;
  }

  interface SearchResult {
    videos: VideoData[];
    playlists: any[];
    channels: any[];
    live: any[];
  }

  function search(query: string): Promise<SearchResult>;
  function search(options: SearchOptions): Promise<VideoData>;
  export default search;
}
