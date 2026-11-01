import { createDecipheriv, createHash } from "node:crypto";

export type MyCareerNetDecoder = {
  appName: string;
  keyPrefix: string;
  appSeparator: string;
  tokenSeparator: string;
};

export function extractMyCareerNetDecoder(bundle: string): MyCareerNetDecoder {
  const appMatch = bundle.match(/let O,g="([^"]*)";const S=this\.\$storageService\.getCollection\(/);
  const keyMatch = bundle.match(
    /let F="([^"]*)";F\+=g,F\+="([^"]*)",F\+=W,i&&\(F\+="([^"]*)",F\+=i\),F=this\.encryptionService\.getMD5\(F\)/
  );
  if (!appMatch || !keyMatch) {
    throw new Error("MyCareerNet changed its public contest response decoder; the parser needs an update.");
  }

  return {
    appName: appMatch[1],
    keyPrefix: keyMatch[1],
    appSeparator: keyMatch[2],
    tokenSeparator: keyMatch[3]
  };
}

export function decryptMyCareerNetResponse(
  encrypted: string,
  decoder: MyCareerNetDecoder,
  tenantAlias: string,
  token: string
): unknown {
  const keyMaterial =
    decoder.keyPrefix +
    decoder.appName +
    decoder.appSeparator +
    tenantAlias.toLowerCase() +
    decoder.tokenSeparator +
    token;
  const key = createHash("md5").update(keyMaterial).digest();
  let decrypted: string;
  try {
    const decipher = createDecipheriv("aes-128-ecb", key, new Uint8Array(0));
    decrypted = decipher.update(encrypted, "base64", "utf8") + decipher.final("utf8");
  } catch (error) {
    const reason = error instanceof Error ? error.message : "unknown crypto error";
    throw new Error(`MyCareerNet contest response could not be decrypted with its public client contract: ${reason}`);
  }

  try {
    return JSON.parse(decrypted);
  } catch {
    throw new Error("MyCareerNet contest response was not valid JSON after decryption.");
  }
}
