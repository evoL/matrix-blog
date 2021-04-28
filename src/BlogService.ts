import { MatrixClient } from './matrix/MatrixClient';
import {
  NameEvent,
  PersistedStateEvent,
  StateEvent,
  TopicEvent,
} from './matrix/types';
import { Blog, BlogWithPostMetadata, PostMetadata } from './types';

const TYPE_KEY = 'org.matrix.msc1772.type';
const SPACE_VALUE = 'org.matrix.msc1772.space';

interface SpaceCreateEvent {
  [TYPE_KEY]?: string;
}

export class BlogServiceError extends Error {}

export class BlogService {
  constructor(private readonly matrixClient: MatrixClient) {}

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
      }));

    return {
      id,
      title: blogRoom.name,
      description: blogRoom.topic,
      posts,
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
