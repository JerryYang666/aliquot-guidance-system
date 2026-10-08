import {
  createHash,
  generateKeyPairSync,
  randomBytes,
  sign,
} from "node:crypto";

import type {
  AuthenticationResponseJSON,
  RegistrationResponseJSON,
} from "@simplewebauthn/server";

const b64 = (data: Uint8Array) => Buffer.from(data).toString("base64url");
const sha256 = (data: string | Uint8Array) =>
  createHash("sha256").update(data).digest();

// Just enough CBOR for a COSE key and an attestation object.
function head(major: number, n: number): Buffer {
  if (n < 24) return Buffer.from([(major << 5) | n]);
  if (n < 256) return Buffer.from([(major << 5) | 24, n]);
  return Buffer.from([(major << 5) | 25, n >> 8, n & 0xff]);
}
const int = (n: number) => (n >= 0 ? head(0, n) : head(1, -1 - n));
const bytes = (data: Uint8Array) => Buffer.concat([head(2, data.length), data]);
const text = (s: string) => Buffer.concat([head(3, s.length), Buffer.from(s)]);
const map = (entries: [Buffer, Buffer][]) =>
  Buffer.concat([head(5, entries.length), ...entries.flat()]);

const USER_PRESENT = 0x01;
const USER_VERIFIED = 0x04;
const HAS_CREDENTIAL = 0x40;

/**
 * A passkey in software: it answers the two WebAuthn prompts the way a
 * browser and its authenticator would (ES256, no attestation), so the
 * server's side can be tested against real signatures.
 */
export class FakePasskey {
  private readonly id = randomBytes(16);
  private readonly key = generateKeyPairSync("ec", { namedCurve: "P-256" });

  constructor(private readonly site: { origin: string; id: string }) {}

  private clientData(type: string, challenge: string): Buffer {
    return Buffer.from(
      JSON.stringify({
        type,
        challenge,
        origin: this.site.origin,
        crossOrigin: false,
      }),
    );
  }

  private authenticatorData(flags: number, credential?: Buffer): Buffer {
    // Signature counter 0, as synced passkeys report.
    return Buffer.concat([
      sha256(this.site.id),
      Buffer.from([flags, 0, 0, 0, 0]),
      credential ?? Buffer.alloc(0),
    ]);
  }

  /** What navigator.credentials.create() returns. */
  create(options: { challenge: string }): RegistrationResponseJSON {
    const jwk = this.key.publicKey.export({ format: "jwk" });
    const coseKey = map([
      [int(1), int(2)], // kty: EC2
      [int(3), int(-7)], // alg: ES256
      [int(-1), int(1)], // crv: P-256
      [int(-2), bytes(Buffer.from(jwk.x ?? "", "base64url"))],
      [int(-3), bytes(Buffer.from(jwk.y ?? "", "base64url"))],
    ]);
    const authenticatorData = this.authenticatorData(
      USER_PRESENT | USER_VERIFIED | HAS_CREDENTIAL,
      Buffer.concat([
        Buffer.alloc(16), // AAGUID
        Buffer.from([0, this.id.length]),
        this.id,
        coseKey,
      ]),
    );
    return {
      id: b64(this.id),
      rawId: b64(this.id),
      type: "public-key",
      clientExtensionResults: {},
      response: {
        clientDataJSON: b64(
          this.clientData("webauthn.create", options.challenge),
        ),
        attestationObject: b64(
          map([
            [text("fmt"), text("none")],
            [text("attStmt"), map([])],
            [text("authData"), bytes(authenticatorData)],
          ]),
        ),
        transports: ["internal"],
      },
    };
  }

  /** What navigator.credentials.get() returns. */
  get(options: { challenge: string }): AuthenticationResponseJSON {
    const clientData = this.clientData("webauthn.get", options.challenge);
    const authenticatorData = this.authenticatorData(
      USER_PRESENT | USER_VERIFIED,
    );
    return {
      id: b64(this.id),
      rawId: b64(this.id),
      type: "public-key",
      clientExtensionResults: {},
      response: {
        clientDataJSON: b64(clientData),
        authenticatorData: b64(authenticatorData),
        signature: b64(
          sign(
            "sha256",
            Buffer.concat([authenticatorData, sha256(clientData)]),
            this.key.privateKey,
          ),
        ),
      },
    };
  }
}
