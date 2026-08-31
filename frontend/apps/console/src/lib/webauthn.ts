type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord {
  return value && typeof value === "object" ? (value as UnknownRecord) : {};
}

export function base64UrlToArrayBuffer(value: string): ArrayBuffer {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = `${value}${padding}`.replaceAll("-", "+").replaceAll("_", "/");
  const binary = globalThis.atob(base64);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return bytes.buffer;
}

export function arrayBufferToBase64Url(value: ArrayBufferLike): string {
  const bytes = new Uint8Array(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return globalThis.btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

function publicKeyOptions(value: unknown): UnknownRecord {
  const payload = asRecord(value);
  const options =
    payload.publicKey ?? payload.PublicKey ?? payload.response ?? payload.Response ?? value;
  const record = asRecord(options);
  if (typeof record.challenge !== "string") {
    throw new Error("The server returned invalid Passkey options.");
  }
  return record;
}

export function prepareCredentialCreationOptions(
  value: unknown,
): PublicKeyCredentialCreationOptions {
  const options = publicKeyOptions(value);
  const user = asRecord(options.user);
  if (typeof user.id !== "string") {
    throw new Error("The server returned an invalid Passkey user.");
  }
  const prepared: UnknownRecord = {
    ...options,
    challenge: base64UrlToArrayBuffer(options.challenge as string),
    user: { ...user, id: base64UrlToArrayBuffer(user.id) },
  };
  if (Array.isArray(options.excludeCredentials)) {
    prepared.excludeCredentials = options.excludeCredentials.map((value) => {
      const credential = asRecord(value);
      return {
        ...credential,
        id: base64UrlToArrayBuffer(String(credential.id ?? "")),
      };
    });
  }
  if (Array.isArray(options.attestationFormats) && options.attestationFormats.length === 0) {
    delete prepared.attestationFormats;
  }
  return prepared as unknown as PublicKeyCredentialCreationOptions;
}

export function prepareCredentialRequestOptions(value: unknown): PublicKeyCredentialRequestOptions {
  const options = publicKeyOptions(value);
  const prepared: UnknownRecord = {
    ...options,
    challenge: base64UrlToArrayBuffer(options.challenge as string),
  };
  if (Array.isArray(options.allowCredentials)) {
    prepared.allowCredentials = options.allowCredentials.map((value) => {
      const credential = asRecord(value);
      return {
        ...credential,
        id: base64UrlToArrayBuffer(String(credential.id ?? "")),
      };
    });
  }
  return prepared as unknown as PublicKeyCredentialRequestOptions;
}

export function buildRegistrationCredential(
  credential: PublicKeyCredential,
): Record<string, unknown> {
  const response = credential.response as AuthenticatorAttestationResponse & {
    getTransports?: () => string[];
  };
  return {
    id: credential.id,
    rawId: arrayBufferToBase64Url(credential.rawId),
    type: credential.type,
    authenticatorAttachment: credential.authenticatorAttachment,
    response: {
      attestationObject: arrayBufferToBase64Url(response.attestationObject),
      clientDataJSON: arrayBufferToBase64Url(response.clientDataJSON),
      transports: response.getTransports?.(),
    },
    clientExtensionResults: credential.getClientExtensionResults(),
  };
}

export function buildAssertionCredential(credential: PublicKeyCredential): Record<string, unknown> {
  const response = credential.response as AuthenticatorAssertionResponse;
  return {
    id: credential.id,
    rawId: arrayBufferToBase64Url(credential.rawId),
    type: credential.type,
    authenticatorAttachment: credential.authenticatorAttachment,
    response: {
      authenticatorData: arrayBufferToBase64Url(response.authenticatorData),
      clientDataJSON: arrayBufferToBase64Url(response.clientDataJSON),
      signature: arrayBufferToBase64Url(response.signature),
      userHandle: response.userHandle ? arrayBufferToBase64Url(response.userHandle) : null,
    },
    clientExtensionResults: credential.getClientExtensionResults(),
  };
}

export function isWebAuthnSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.PublicKeyCredential !== "undefined" &&
    typeof navigator.credentials?.create === "function" &&
    typeof navigator.credentials?.get === "function"
  );
}
