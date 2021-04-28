export interface Blog {
  id: string;
  title?: string;
  description?: string;
}
export interface PostMetadata {
  id: string;
  title?: string;
  summary?: string;
}
export interface BlogWithPostMetadata extends Blog {
  posts: ReadonlyArray<PostMetadata>;
}
