import { createRemoteJWKSet, importPKCS8, jwtVerify, SignJWT } from "jose";

const firebaseKeys = createRemoteJWKSet(
  new URL("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com"),
);

export async function verifyFirebaseToken(token: string, projectId: string) {
  const { payload } = await jwtVerify(token, firebaseKeys, {
    algorithms: ["RS256"],
    audience: projectId,
    issuer: `https://securetoken.google.com/${projectId}`,
  });
  if (!payload.sub) throw new Error("Unauthorized");
  return payload.sub;
}

export async function createFirebaseCustomToken(uid: string, serviceAccountEmail: string, privateKeyPem: string) {
  const now = Math.floor(Date.now() / 1000);
  const privateKey = await importPKCS8(privateKeyPem.replaceAll("\\n", "\n"), "RS256");
  return new SignJWT({ uid })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(serviceAccountEmail)
    .setSubject(serviceAccountEmail)
    .setAudience("https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit")
    .setIssuedAt(now)
    .setExpirationTime(now + 60 * 60)
    .sign(privateKey);
}
