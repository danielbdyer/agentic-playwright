import * as schemas from '../schemas';
import * as schemaDecode from '../schemas/decode';
import type {
  InterventionReceipt,
  InterventionTarget,
  Participant,
  ParticipantRef,
} from '../handshake/intervention';

export const validateParticipantRef = schemaDecode.decoderFor<ParticipantRef>(schemas.ParticipantRefSchema);
export const validateParticipant = schemaDecode.decoderFor<Participant>(schemas.ParticipantSchema);
export const validateInterventionTarget = schemaDecode.decoderFor<InterventionTarget>(schemas.InterventionTargetSchema);
export const validateInterventionReceipt = schemaDecode.decoderFor<InterventionReceipt>(schemas.InterventionReceiptSchema);
