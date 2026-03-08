export interface SessionCloser {
  shutdown(options?: { drain?: boolean; reason?: string }): void;
}

export interface RoomCleaner {
  removeParticipant(room: string, identity: string): Promise<void>;
}

export interface CallCleanupLogger {
  error(message: string, error: unknown): void;
}

export interface FinishCallCleanupArgs {
  session: SessionCloser;
  roomServiceClient: RoomCleaner;
  roomName: string;
  participantIdentity: string;
  reason: string;
  logger?: CallCleanupLogger;
}

const defaultLogger: CallCleanupLogger = {
  error(message, error) {
    console.error(message, error);
  },
};

export const finishCallCleanup = async ({
  session,
  roomServiceClient,
  roomName,
  participantIdentity,
  reason,
  logger = defaultLogger,
}: FinishCallCleanupArgs): Promise<void> => {
  // The closing sentence has already finished playing. Shut the agent down
  // immediately so the tool result cannot trigger another reply cycle.
  session.shutdown({ reason, drain: false });

  await roomServiceClient.removeParticipant(roomName, participantIdentity).catch((error) => {
    logger.error("Failed to remove SIP participant during finishCall", error);
  });
};
