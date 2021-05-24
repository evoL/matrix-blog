import { MatrixClient, MatrixError } from './matrix/MatrixClient';
import type {
  CanonicalAliasEvent,
  MembershipEvent,
  NameEvent,
  PersistedStateEvent,
  SpaceParentEvent,
  StateEvent,
  TextMessageEvent,
  TopicEvent,
} from './matrix/types';
import type {
  Blog,
  BlogWithPostMetadata,
  Post,
  NewPost,
  PostContent,
  PostMetadata,
} from './types';

const TYPE_KEY = 'org.matrix.msc1772.type';
const SPACE_VALUE = 'org.matrix.msc1772.space';
const CHILD_EVENT = 'org.matrix.msc1772.space.child';
const PARENT_EVENT = 'org.matrix.msc1772.space.parent';

const POST_CONTENT_EVENT = 'co.hirsz.blog.post_content';

interface SpaceCreateEvent {
  [TYPE_KEY]?: string;
}
interface PostContentEvent {
  event_id: string;
}

export class BlogServiceError extends Error {}

export class BlogService {
  constructor(
    private readonly matrixClient: MatrixClient,
    private readonly roomPrefix = 'blog.'
  ) {}

  createLocalRoomAlias(name: string): string {
    return `${this.roomPrefix}${name}`;
  }

  createRoomAlias(slug: string): string {
    return `#${this.createLocalRoomAlias(
      slug
    )}:${this.matrixClient.getServerName()}`;
  }

  getSlugFromRoomAlias(alias: string): string | undefined {
    const rx = new RegExp(`^#${escapeRegexp(this.roomPrefix)}([^:]+)`);
    const matches = alias.match(rx);
    if (!matches) return undefined;
    return matches[1];
  }

  async getBlog(id: string): Promise<Blog> {
    const stateEvents = await this.getStateEvents(id);

    // Populate the name
    let name: string | undefined;
    const nameEvent = stateEvents.find((e) => e.type === 'm.room.name') as
      | StateEvent<NameEvent>
      | undefined;
    if (nameEvent) {
      name = nameEvent.content.name;
    }

    // Populate the topic
    let topic: string | undefined;
    const topicEvent = stateEvents.find(
      (e) => e.type === 'm.room.topic'
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

  async getFullPosts(blogId: string): Promise<ReadonlyArray<Post>> {
    const postMetadata = await this.getPosts(blogId);

    // Get the content for each post.
    const contents = await Promise.all(
      postMetadata.map((post) => this.getPostContent(post.id))
    );

    // Zip the arrays together to form full posts.
    return postMetadata.map(
      (post, i) => Object.assign(post, contents[i]) as Post
    );
  }

  async getBlogWithPosts(id: string): Promise<BlogWithPostMetadata> {
    const spaceSummary = await this.matrixClient.getSpaceSummary(id);
    const blogRoom = spaceSummary.rooms.find((room) => room.room_id === id);
    if (!blogRoom) {
      throw new BlogServiceError('Could not find blog room');
    }

    const posts = spaceSummary.rooms
      .filter((room) => room.room_id !== id)
      .map((room) => ({
        id: room.room_id,
        title: room.name,
        summary: room.topic,
        slug:
          room.canonical_alias &&
          this.getSlugFromRoomAlias(room.canonical_alias),
      }));

    return {
      id,
      title: blogRoom.name,
      description: blogRoom.topic,
      posts,
    };
  }

  async getPost(postId: string): Promise<Post> {
    const [title, summary, slug, content] = await Promise.all([
      this.getPostTitle(postId),
      this.getPostSummary(postId),
      this.getPostSlug(postId),
      this.getPostContent(postId),
    ]);

    return {
      id: postId,
      title,
      summary,
      slug,
      ...content,
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
          content: { history_visibility: 'world_readable' },
        },
      ],
    });

    const message = this.matrixClient.sendMessageEvent(
      postId,
      'm.room.message',
      {
        msgtype: 'm.text',
        format: 'org.matrix.custom.html',
        body: post.text,
        formatted_body: post.html,
      }
    );

    const serverName = this.matrixClient.getServerName();
    const child = this.matrixClient.sendStateEvent(
      blogId,
      CHILD_EVENT,
      postId,
      {
        via: [serverName],
      }
    );
    const parent = this.matrixClient.sendStateEvent(
      postId,
      PARENT_EVENT,
      blogId,
      {
        via: [serverName],
        canonical: true,
      }
    );

    const [messageEventId] = await Promise.all([message, child, parent]);

    // Mark the message event ID.
    await this.matrixClient.sendStateEvent(postId, POST_CONTENT_EVENT, '', {
      event_id: messageEventId,
    });

    return {
      id: postId,
      title: post.title,
      summary: post.summary,
      slug: post.slug,
    };
  }

  async deletePost(
    postId: string,
    reason: string = 'Deleting blog post'
  ): Promise<void> {
    const stateEvents = await this.matrixClient.getStateEvents(postId);

    const parentEvent = stateEvents.find((e) => e.type === PARENT_EVENT) as
      | PersistedStateEvent<SpaceParentEvent>
      | undefined;
    if (!parentEvent) {
      throw new BlogServiceError('No parent linkage');
    }

    const currentUserId = await this.matrixClient.getCurrentUser();

    // In parallel:
    const eventPromises: Array<Promise<unknown>> = [];

    // 1. Remove parent link
    eventPromises.push(
      this.matrixClient.redactEvent(postId, parentEvent.event_id, reason)
    );

    // 2. Remove child link
    const blogId = parentEvent.state_key!;
    eventPromises.push(
      this.matrixClient.getStateEvents(blogId).then((parentStateEvents) => {
        const childEvent = parentStateEvents.find(
          (e) => e.type === CHILD_EVENT && e.state_key === postId
        );
        if (!childEvent) return;
        return this.matrixClient.redactEvent(
          blogId,
          childEvent.event_id,
          reason
        );
      })
    );

    // 3. Remove alias
    const aliasEvent = stateEvents.find(
      (e) => e.type === 'm.room.canonical_alias'
    ) as PersistedStateEvent<CanonicalAliasEvent> | undefined;
    if (aliasEvent?.content.alias != null) {
      eventPromises.push(
        this.matrixClient.removeRoomAlias(aliasEvent.content.alias)
      );
    }

    // 4. Remove all other members
    const memberships = stateEvents.filter(
      (e) => e.type === 'm.room.member' && e.state_key !== currentUserId
    ) as ReadonlyArray<StateEvent<MembershipEvent>>;
    for (const membership of memberships) {
      eventPromises.push(
        this.matrixClient.kickUser(postId, membership.state_key!, reason)
      );
    }

    await Promise.all(eventPromises);

    // Finally, leave the room.
    await this.matrixClient.leaveRoom(postId);
  }

  async editPost(postId: string, post: Partial<NewPost>): Promise<void> {
    const promises: Array<Promise<unknown>> = [];

    if (post.title != null) {
      promises.push(this.setPostTitle(postId, post.title));
    }
    if (post.summary != null) {
      promises.push(this.setPostSummary(postId, post.summary));
    }
    if (post.slug != null) {
      promises.push(this.setPostSlug(postId, post.slug));
    }
    if (post.text != null && post.html != null) {
      promises.push(
        this.setPostContent(postId, { text: post.text, html: post.html })
      );
    }

    await Promise.all(promises);
  }

  private async getPostTitle(postId: string): Promise<string> {
    const event = (await this.matrixClient.getStateEvent(
      postId,
      'm.room.name'
    )) as NameEvent;
    return event.name;
  }

  private setPostTitle(postId: string, title: string): Promise<string> {
    return this.matrixClient.sendStateEvent(postId, 'm.room.name', '', {
      name: title,
    });
  }

  private async getPostSummary(postId: string): Promise<string | undefined> {
    try {
      const event = (await this.matrixClient.getStateEvent(
        postId,
        'm.room.topic'
      )) as TopicEvent;
      return event.topic;
    } catch (e) {
      if (e instanceof MatrixError && e.status === 404) {
        return undefined;
      }
      throw e;
    }
  }

  private setPostSummary(postId: string, summary: string): Promise<string> {
    return this.matrixClient.sendStateEvent(postId, 'm.room.topic', '', {
      topic: summary,
    });
  }

  private async getPostSlug(postId: string): Promise<string | undefined> {
    try {
      const { alias } = (await this.matrixClient.getStateEvent(
        postId,
        'm.room.canonical_alias'
      )) as CanonicalAliasEvent;
      if (!alias) return undefined;

      return this.getSlugFromRoomAlias(alias);
    } catch (e) {
      if (e instanceof MatrixError && e.status === 404) {
        return undefined;
      }
      throw e;
    }
  }

  private async setPostSlug(postId: string, slug: string): Promise<void> {
    // Allow to unset a slug by passing an empty string.
    const newAlias = slug && this.createRoomAlias(slug);

    // Get the old alias
    let oldAlias: string | undefined;
    try {
      const aliasEvent = (await this.matrixClient.getStateEvent(
        postId,
        'm.room.canonical_alias'
      )) as CanonicalAliasEvent;
      oldAlias = aliasEvent.alias;
    } catch (e) {
      // It's fine if there's no event.
    }

    // If the old alias is the same as the new one, do nothing.
    if (oldAlias === newAlias) return;

    // Swap aliases
    if (newAlias) {
      await this.matrixClient.addRoomAlias(newAlias, postId);
      await this.matrixClient.sendStateEvent(
        postId,
        'm.room.canonical_alias',
        '',
        { alias: newAlias }
      );
    }
    if (oldAlias) {
      await this.matrixClient.removeRoomAlias(oldAlias);
    }
  }

  private async getPostContent(postId: string): Promise<PostContent> {
    // Get state events
    const stateEvents = await this.matrixClient.getStateEvents(postId);

    // Find the message event ID
    const postContent = stateEvents.find(event => event.type === POST_CONTENT_EVENT) as PersistedStateEvent<PostContentEvent> | undefined;
    if (!postContent) {
      throw new BlogServiceError('Could not find post content event');
    }

    // Find the latest slug event to check if the post is published
    const aliasEvent = stateEvents.find(event => event.type === 'm.room.canonical_alias') as PersistedStateEvent<CanonicalAliasEvent> | undefined;
    const publishedMs = (aliasEvent?.content.alias) ? aliasEvent.origin_server_ts : undefined;

    // Get the message
    const message = await this.matrixClient.getEvent(
      postId,
      postContent.content.event_id
    );
    const content = message.content as TextMessageEvent;

    return {
      text: content.body,
      html: content.formatted_body!,
      created_ms: message.origin_server_ts,
      published_ms: publishedMs,
      edited_ms: message.unsigned?.['m.relations']?.['m.replace'].origin_server_ts,
    };
  }

  private async setPostContent(
    postId: string,
    content: { text: string; html: string }
  ): Promise<string> {
    // Find the message event ID
    const postContent = (await this.matrixClient.getStateEvent(
      postId,
      POST_CONTENT_EVENT
    )) as PostContentEvent;

    // Send the new message
    return await this.matrixClient.sendMessageEvent(postId, 'm.room.message', {
      msgtype: 'm.text',
      format: 'org.matrix.custom.html',
      body: `(edited) ${content.text}`,
      formatted_body: `<p>(edited)</p> ${content.html}`,
      'm.new_content': {
        msgtype: 'm.text',
        format: 'org.matrix.custom.html',
        body: content.text,
        formatted_body: content.html,
      },
      'm.relates_to': {
        rel_type: 'm.replace',
        event_id: postContent.event_id,
      },
    });
  }

  private async getStateEvents(
    blogId: string
  ): Promise<ReadonlyArray<PersistedStateEvent<unknown>>> {
    const stateEvents = await this.matrixClient.getStateEvents(blogId);

    // Validate that this is indeed a blog room by checking if it's a space.
    // Yes, this is hacky.
    const createEvent = stateEvents.find((e) => e.type === 'm.room.create') as
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
