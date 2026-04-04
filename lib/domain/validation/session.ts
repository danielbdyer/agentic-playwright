import * as schemas from '../schemas';
import * as schemaDecode from '../schemas/decode';
import type { AgentEvent, AgentSession } from '../handshake/session';

export const validateAgentEvent = schemaDecode.decoderFor<AgentEvent>(schemas.AgentEventSchema);

export const validateAgentSession = schemaDecode.decoderFor<AgentSession>(schemas.AgentSessionSchema);
