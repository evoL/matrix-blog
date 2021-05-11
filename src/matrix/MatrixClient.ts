import type fetchFn from 'node-fetch';
import {
  CreateRoomRequest,
  PersistedStateEvent,
  SpaceSummaryRequest,
  SpaceSummaryResponse,
} from './types';

interface CreateRoomResponse {
  room_id: string;
}

interface SendEventResponse {
  event_id: string;
}

export interface MatrixErrorDetails {
  errcode: string;
  error: string;
}

export class MatrixError extends Error {
  constructor(readonly status: number, readonly details: MatrixErrorDetails) {
    super(`Matrix Error: ${status} ${JSON.stringify(details)}`);
  }
}

export class MatrixClient {
  private accessToken: string = '';
  private currentUserId?: string;

  constructor(
    private readonly serverName: string,
    private readonly homeserverUrl: string,
    private readonly fetch: typeof fetchFn
  ) {}

  setAccessToken(token: string) {
    this.accessToken = token;
  }

  getServerName() {
    return this.serverName;
  }

  async getCurrentUser(): Promise<string> {
    if (this.currentUserId == null) {
      const response = await this.sendRequest(
        '/_matrix/client/r0/account/whoami',
        'get'
      );
      const json = (await response.json()) as { user_id: string };
      this.currentUserId = json.user_id;
    }
    return this.currentUserId;
  }

  async createRoom(req: CreateRoomRequest): Promise<string> {
    const response = await this.sendRequest(
      '/_matrix/client/r0/createRoom',
      'post',
      req
    );

    const json = (await response.json()) as CreateRoomResponse;
    return json.room_id;
  }

  async getStateEvents(
    roomId: string
  ): Promise<ReadonlyArray<PersistedStateEvent<unknown>>> {
    const response = await this.sendRequest(
      `/_matrix/client/r0/rooms/${roomId}/state`,
      'get'
    );

    return (await response.json()) as ReadonlyArray<PersistedStateEvent<{}>>;
  }

  async sendStateEvent(
    roomId: string,
    eventType: string,
    stateKey: string,
    event: {}
  ): Promise<string> {
    const response = await this.sendRequest(
      `/_matrix/client/r0/rooms/${roomId}/state/${eventType}/${stateKey}`,
      'put',
      event
    );

    const json = (await response.json()) as SendEventResponse;
    return json.event_id;
  }

  async sendMessageEvent(
    roomId: string,
    eventType: string,
    event: {}
  ): Promise<string> {
    const txnId = randomString(8);
    const response = await this.sendRequest(
      `/_matrix/client/r0/rooms/${roomId}/send/${eventType}/${txnId}`,
      'put',
      event
    );

    const json = (await response.json()) as SendEventResponse;
    return json.event_id;
  }

  async redactEvent(
    roomId: string,
    eventId: string,
    reason?: string
  ): Promise<string> {
    const txnId = randomString(8);
    const response = await this.sendRequest(
      `/_matrix/client/r0/rooms/${roomId}/redact/${eventId}/${txnId}`,
      'put',
      { reason }
    );

    const json = (await response.json()) as SendEventResponse;
    return json.event_id;
  }

  async leaveRoom(roomId: string): Promise<void> {
    await this.sendRequest(`/_matrix/client/r0/rooms/${roomId}/leave`, 'post');
  }

  async kickUser(
    roomId: string,
    userId: string,
    reason?: string
  ): Promise<void> {
    await this.sendRequest(`/_matrix/client/r0/rooms/${roomId}/kick`, 'post', {
      user_id: userId,
      reason,
    });
  }

  async addRoomAlias(alias: string, roomId: string): Promise<void> {
    await this.sendRequest(
      `/_matrix/client/r0/directory/room/${alias}`,
      'put',
      { room_id: roomId }
    );
  }

  async removeRoomAlias(alias: string): Promise<void> {
    await this.sendRequest(
      `/_matrix/client/r0/directory/room/${encodeURIComponent(alias)}`,
      'delete'
    );
  }

  async getSpaceSummary(
    roomId: string,
    options: SpaceSummaryRequest = {}
  ): Promise<SpaceSummaryResponse> {
    const response = await this.sendRequest(
      `/_matrix/client/unstable/org.matrix.msc2946/rooms/${roomId}/spaces`,
      'post',
      options
    );

    return (await response.json()) as SpaceSummaryResponse;
  }

  private async sendRequest(
    endpoint: string,
    method: 'post' | 'put' | 'get' | 'delete',
    body?: {}
  ) {
    const headers: Record<string, string> = {
      'User-Agent': 'matrix-blog/0.1.0',
    };
    if (this.accessToken) {
      headers['Authorization'] = `Bearer ${this.accessToken}`;
    }
    if (body) {
      headers['Content-Type'] = 'application/json';
    }

    const response = await this.fetch(`${this.homeserverUrl}${endpoint}`, {
      method,
      body: body && JSON.stringify(body),
      headers,
    });

    if (!response.ok) {
      const error = (await response.json()) as MatrixErrorDetails;
      throw new MatrixError(response.status, error);
    }

    return response;
  }
}

const CHARS = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
function randomString(length: number): string {
  const array: string[] = [];
  while (length--) {
    const char = CHARS[(Math.random() * CHARS.length) | 0];
    array.push(char);
  }
  return array.join('');
}
