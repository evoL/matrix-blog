import fetch from 'node-fetch';
import { MatrixClient } from './MatrixClient';

export function createMatrixClient(homeserverUrl: string) {
  return new MatrixClient(homeserverUrl, fetch);
}
