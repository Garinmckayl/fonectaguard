import { findDirectoryListing } from "../src/lib/fonecta";
import { parseHours } from "../src/lib/normalize";
const [name, city, website, address, phone, hours] = process.argv.slice(2);
(async () => console.log(JSON.stringify(await findDirectoryListing({ name, city, website, address, phone, hours: hours ? parseHours(hours) : undefined }), null, 1)))();
