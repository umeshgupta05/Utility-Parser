import { createCipheriv, createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decryptMyCareerNetResponse, extractMyCareerNetDecoder } from "./mycareernet-decoder";

const decoderBundle = [
  'let O,g="Hackathon";const S=this.$storageService.getCollection(',
  'let F="key-prefix";F+=g,F+="-app-",F+=W,i&&(F+="-tenant-",F+=i),F=this.encryptionService.getMD5(F)'
].join("");

describe("MyCareerNet public contest decoder", () => {
  it("extracts the app and key parameters from the public bundle", () => {
    expect(extractMyCareerNetDecoder(decoderBundle)).toEqual({
      appName: "Hackathon",
      keyPrefix: "key-prefix",
      appSeparator: "-app-",
      tokenSeparator: "-tenant-"
    });
  });

  it("decrypts and parses an encrypted contest response", () => {
    const decoder = extractMyCareerNetDecoder(decoderBundle);
    const tenantAlias = "MyCareerNet";
    const token = "test-token";
    const keyMaterial =
      decoder.keyPrefix +
      decoder.appName +
      decoder.appSeparator +
      tenantAlias.toLowerCase() +
      decoder.tokenSeparator +
      token;
    const key = createHash("md5").update(keyMaterial).digest();
    const cipher = createCipheriv("aes-128-ecb", key, null);
    const encrypted =
      cipher.update(JSON.stringify({ data: { hackthons: [{ slug: "sample", name: "Sample contest" }] } }), "utf8", "base64") +
      cipher.final("base64");

    expect(decryptMyCareerNetResponse(encrypted, decoder, tenantAlias, token)).toEqual({
      data: { hackthons: [{ slug: "sample", name: "Sample contest" }] }
    });
  });

  it("reports when the public bundle no longer exposes the decoder", () => {
    expect(() => extractMyCareerNetDecoder("unrecognized bundle")).toThrow(
      "MyCareerNet changed its public contest response decoder"
    );
  });

  it("reports malformed encrypted responses explicitly", () => {
    const decoder = extractMyCareerNetDecoder(decoderBundle);
    expect(() => decryptMyCareerNetResponse("not-base64", decoder, "mycareernet", "test-token")).toThrow(
      "could not be decrypted"
    );
  });
});
