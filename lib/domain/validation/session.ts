import * as schemas from '../schemas';
import * as schemaDecode from '../schemas/decode';
import type { AgentEvent, AgentSession } from '../types';

export const validateAgentEvent = schemaDecode.decoderFor<AgentEvent>(schemas.AgentEventSchema);

export const validateAgentSession = schemaDecode.decoderFor<AgentSession>(schemas.AgentSessionSchema);
