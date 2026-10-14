// The updater's status vocabulary is the wire vocabulary: one definition, owned by the protocol.
import type { BuiltinPluginUpdateStatus } from "@getpaseo/protocol/messages";

export type {
  BuiltinPluginUpdateError,
  BuiltinPluginUpdateErrorCode,
  BuiltinPluginUpdateFallbackReason,
  BuiltinPluginUpdateStatus,
} from "@getpaseo/protocol/messages";

export type BuiltinPluginUpdateChannel = NonNullable<BuiltinPluginUpdateStatus["channel"]>;
