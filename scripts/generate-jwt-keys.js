const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const outDir = path.join(process.cwd(), "config", "keys");
const privatePath = path.join(outDir, "jwt-private.pem");
const publicPath = path.join(outDir, "jwt-public.pem");

if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" }
});

fs.writeFileSync(privatePath, privateKey, { encoding: "utf8" });
fs.writeFileSync(publicPath, publicKey, { encoding: "utf8" });

console.log(`Generated private key: ${privatePath}`);
console.log(`Generated public key: ${publicPath}`);
