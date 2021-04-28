import { MatrixClient } from './matrix/MatrixClient';
import { BlogWithPostMetadata } from './types';

export class BlogServiceError extends Error {}

export class BlogService {
  constructor(private readonly matrixClient: MatrixClient) {}

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
}
