import path from "path";
import { fileURLToPath } from "url";
const root = path.dirname(fileURLToPath(import.meta.url));
export default {
  experimental: { serverComponentsExternalPackages: ["better-sqlite3"] },
  webpack(config) { config.resolve.alias["@"] = path.join(root, "src"); return config; },
};
