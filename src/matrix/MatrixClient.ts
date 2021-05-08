import type fetchFn from 'node-fetch';
import { CreateRoomRequest, PersistedStateEvent, SpaceSummaryRequest, SpaceSummaryResponse } from './types';

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

  constructor(
    private readonly serverName: string,
    private readonly homeserverUrl: string,
    private readonly fetch: typeof fetchFn,
  ) {}

  setAccessToken(token: string) {
    this.accessToken = token;
  }

  getServerName() { return this.serverName; }

  async createRoom(req: CreateRoomRequest): Promise<string> {
    const response = await this.sendRequest(
      '/_matrix/client/r0/createRoom',
      'post',
      req
    );
    if (!response.ok) {
      const error = (await response.json()) as MatrixErrorDetails;
      throw new MatrixError(response.status, error);
    }

    const json = (await response.json()) as CreateRoomResponse;
    return json.room_id;
  }

  async getStateEvents(roomId: string): Promise<ReadonlyArray<PersistedStateEvent<unknown>>> {
    const response = await this.sendRequest(
      `/_matrix/client/r0/rooms/${roomId}/state`,
      'get'
    );
    if (!response.ok) {
      const error = (await response.json()) as MatrixErrorDetails;
      throw new MatrixError(response.status, error);
    }

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
    if (!response.ok) {
      const error = (await response.json()) as MatrixErrorDetails;
      throw new MatrixError(response.status, error);
    }

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
    if (!response.ok) {
      const error = (await response.json()) as MatrixErrorDetails;
      throw new MatrixError(response.status, error);
    }

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
      {reason},
    );
    if (!response.ok) {
      const error = (await response.json()) as MatrixErrorDetails;
      throw new MatrixError(response.status, error);
    }

    const json = (await response.json()) as SendEventResponse;
    return json.event_id;
  }

  async leaveRoom(roomId: string): Promise<void> {
    const response = await this.sendRequest(
      `/_matrix/client/r0/rooms/${roomId}/leave`,
      'post'
    );
    if (!response.ok) {
      const error = (await response.json()) as MatrixErrorDetails;
      throw new MatrixError(response.status, error);
    }
  }

  async kickUser(
    roomId: string,
    userId: string,
    reason?: string
  ): Promise<void> {
    const response = await this.sendRequest(
      `/_matrix/client/r0/rooms/${roomId}/kick`,
      'post',
      {user_id: userId, reason},
    );
    if (!response.ok) {
      const error = (await response.json()) as MatrixErrorDetails;
      throw new MatrixError(response.status, error);
    }
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
    if (!response.ok) {
      const error = (await response.json()) as MatrixErrorDetails;
      throw new MatrixError(response.status, error);
    }

    return (await response.json()) as SpaceSummaryResponse;
  }

  private sendRequest(
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

    return this.fetch(`${this.homeserverUrl}${endpoint}`, {
      method,
      body: body && JSON.stringify(body),
      headers,
    });
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
