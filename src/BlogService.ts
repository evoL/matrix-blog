import { MatrixClient } from './matrix/MatrixClient';
import {
  NameEvent,
  PersistedStateEvent,
  StateEvent,
  TopicEvent,
} from './matrix/types';
import type { Blog, BlogWithPostMetadata, NewPost, PostMetadata } from './types';

const TYPE_KEY = 'org.matrix.msc1772.type';
const SPACE_VALUE = 'org.matrix.msc1772.space';
const CHILD_EVENT = 'org.matrix.msc1772.space.child';
const PARENT_EVENT = 'org.matrix.msc1772.space.parent';

interface SpaceCreateEvent {
  [TYPE_KEY]?: string;
}

export class BlogServiceError extends Error {}

export class BlogService {
  constructor(private readonly matrixClient: MatrixClient, private readonly roomPrefix = 'blog.') {}

  createLocalRoomAlias(name: string): string {
    return `${this.roomPrefix}${name}`;
  }

  getSlugFromRoomAlias(alias: string): string|null {
    const rx = new RegExp(`^#${escapeRegexp(this.roomPrefix)}([^:]+)`);
    const matches = alias.match(rx);
    return matches && matches[1];
  }

  async getBlog(id: string): Promise<Blog> {
    const stateEvents = await this.getStateEvents(id);

    // Populate the name
    let name: string | undefined;
    const nameEvent = stateEvents.find(e => e.type === 'm.room.name') as
      | StateEvent<NameEvent>
      | undefined;
    if (nameEvent) {
      name = nameEvent.content.name;
    }

    // Populate the topic
    let topic: string | undefined;
    const topicEvent = stateEvents.find(
      e => e.type === 'm.room.topic'
    ) as StateEvent<TopicEvent>;
    if (topicEvent) {
      topic = topicEvent.content.topic;
    }

    return { id, title: name, description: topic };
  }

  async getPosts(blogId: string): Promise<ReadonlyArray<PostMetadata>> {
    const blogWithPosts = await this.getBlogWithPosts(blogId);
    return blogWithPosts.posts;
  }

  async getBlogWithPosts(id: string): Promise<BlogWithPostMetadata> {
    const spaceSummary = await this.matrixClient.getSpaceSummary(id);
    const blogRoom = spaceSummary.rooms.find(room => room.room_id === id);
    if (!blogRoom) {
      throw new BlogServiceError('Could not find blog room');
    }

    const posts = spaceSummary.rooms
      .filter(room => room.room_id !== id)
      .map(room => ({
        id: room.room_id,
        title: room.name,
        summary: room.topic,
        slug: room.canonical_alias && this.getSlugFromRoomAlias(room.canonical_alias)!,
      }));

    return {
      id,
      title: blogRoom.name,
      description: blogRoom.topic,
      posts,
    };
  }

  async addPost(blogId: string, post: NewPost): Promise<PostMetadata> {
    const postId = await this.matrixClient.createRoom({
      name: post.title,
      topic: post.summary,
      room_alias_name: post.slug && this.createLocalRoomAlias(post.slug),
      preset: 'public_chat',
      initial_state: [
        {
          type: 'm.room.history_visibility',
          content: {history_visibility: 'world_readable'},
        }
      ]
    });

    const message = this.matrixClient.sendMessageEvent(postId, 'm.room.message', {
      msgtype: 'm.text',
      format: 'org.matrix.custom.html',
      body: post.text,
      formatted_body: post.html,
    });

    const serverName = this.matrixClient.getServerName();
    const child = this.matrixClient.sendStateEvent(blogId, CHILD_EVENT, postId, {
      via: [serverName],
    });
    const parent = this.matrixClient.sendStateEvent(postId, PARENT_EVENT, blogId, {
      via: [serverName],
      canonical: true,
    });

    await Promise.all([message, child, parent]);

    return {
      id: postId,
      title: post.title,
      summary: post.summary,
      slug: post.slug,
    };
  }

  private async getStateEvents(
    blogId: string
  ): Promise<ReadonlyArray<PersistedStateEvent<unknown>>> {
    const stateEvents = await this.matrixClient.getStateEvents(blogId);

    // Validate that this is indeed a blog room by checking if it's a space.
    // Yes, this is hacky.
    const createEvent = stateEvents.find(e => e.type === 'm.room.create') as
      | StateEvent<SpaceCreateEvent>
      | undefined;
    if (!createEvent) {
      throw new BlogServiceError('Could not find room creation event');
    }
    if (createEvent.content[TYPE_KEY] !== SPACE_VALUE) {
      throw new BlogServiceError('This room is not a space');
    }

    return stateEvents;
  }
}

function escapeRegexp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}