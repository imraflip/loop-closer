import Resolver from '@forge/resolver';
import { defineResolvers } from './resolvers';

const resolverInstance = new Resolver();
defineResolvers(resolverInstance);
export const resolver = resolverInstance.getDefinitions();

export { onVersionReleased } from './triggers/versionReleased';
export {
  getWaitingCustomers,
  getReleaseMatches,
  getDraftContext,
  saveReplyDraft,
  getLoopStatus,
} from './actions/agentActions';
