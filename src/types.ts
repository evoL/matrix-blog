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
export interface NewPost {
  title: string;
  summary?: string;
  slug?: string;
  text: string;
  html: string;
}
export interface Post extends PostMetadata {
  title: string;
  text: string;
  html: string;
}
export interface BlogWithPostMetadata extends Blog {
  posts: ReadonlyArray<PostMetadata>;
}
