export interface Invite {
  display_name: string;
  signed: { mxid: string; signatures: unknown; token: string };
}

export interface Invite3pid {
  id_server: string;
  id_access_token: string;
  medium: string;
  address: string;
}

export interface UnsignedData {
  age: number;
  [key: string]: unknown;
}

export interface StateEvent<T> {
  type: string;
  state_key?: string;
  content: T;
}

export interface PersistedStateEvent<T> extends StateEvent<T> {
  state_key: string;
  event_id: string;
  sender: string;
  origin_server_ts: number;
  unsigned?: UnsignedData;
  room_id: string;
  prev_content?: T;
}

export interface NameEvent {
  name: string;
}

export interface TopicEvent {
  topic: string;
}

export interface CanonicalAliasEvent {
  alias?: string;
  alt_aliases?: readonly string[];
}

export interface MembershipEvent {
  avatar_url?: string;
  displayname?: string | null;
  membership: 'invite' | 'join' | 'knock' | 'leave' | 'ban';
  is_direct?: boolean;
  third_party_invite?: Invite;
}

export interface PowerLevelEvent {
  ban?: number;
  events?: Record<string, number>;
  events_default?: number;
  invite?: number;
  kick?: number;
  redact?: number;
  state_default?: number;
  users?: Record<string, number>;
  users_default?: number;
  notifications?: { room?: number };
}

export interface MessageEvent {
  msgtype: string;
  body: string;
}

export interface TextMessageEvent extends MessageEvent {
  msgtype: 'm.text';
  format?: 'org.matrix.custom.html';
  formatted_body?: string;
}

export interface SpaceChildEvent {
  via: ReadonlyArray<string>;
  suggested?: boolean;
  order?: string;
}

export interface SpaceParentEvent {
  via: ReadonlyArray<string>;
  canonical?: boolean;
}

export interface PublicRoomsChunk {
  aliases?: ReadonlyArray<string>;
  canonical_alias?: string;
  name?: string;
  num_joined_members: number;
  room_id: string;
  topic?: string;
  world_readable: boolean;
  guest_can_join: boolean;
  avatar_url?: string;
}

export interface CreateRoomRequest {
  visibility?: 'public' | 'private';
  room_alias_name?: string;
  name?: string;
  topic?: string;
  invite?: readonly string[];
  invite_3pid?: ReadonlyArray<Invite3pid>;
  room_version?: string;
  creation_content?: Record<string, unknown>;
  initial_state?: ReadonlyArray<StateEvent<unknown>>;
  preset?: 'private_chat' | 'public_chat' | 'trusted_private_chat';
  is_direct?: boolean;
  power_level_content_override?: PowerLevelEvent;
}

export interface SpaceSummaryRequest {
  suggested_only?: boolean;
  max_rooms_per_space?: number;
}

export interface SpaceSummaryResponse {
  rooms: ReadonlyArray<PublicRoomsChunk>;
  events: ReadonlyArray<StateEvent<SpaceChildEvent>>;
}
