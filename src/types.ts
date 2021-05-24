export interface Blog {
  id: string;
  title?: string;
  description?: string;
}
export interface PostMetadata {
  id: string;
  title?: string;
  summary?: string;
  slug?: string;
}
export interface PostContent {
  text: string;
  html: string;
  created_ms: number;
  edited_ms?: number;
  published_ms?: number;
}
export interface NewPost {
  title: string;
  summary?: string;
  slug?: string;
  text: string;
  html: string;
}
export type Post = PostMetadata & PostContent & { title: string };

export interface BlogWithPostMetadata extends Blog {
  posts: ReadonlyArray<PostMetadata>;
}
