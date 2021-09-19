import fetch from 'node-fetch';
import { MatrixClient } from './MatrixClient';

export function createMatrixClient(
  serverName: string,
  homeserverUrl: string
): MatrixClient {
  return new MatrixClient(serverName, homeserverUrl, fetch);
}
