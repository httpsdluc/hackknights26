// Usage: node --env-file-if-exists=../.env scripts-local/parse.ts [emails/margin_call.txt]
import { parseEmail } from "../src/parser.ts";

const r = await parseEmail(process.argv[2] ?? "emails/margin_call.txt");
if (!r.ok) {
  console.log(JSON.stringify(r));
  process.exit(1);
}
console.log(JSON.stringify({ counterparty_id: r.counterparty_id, ...r.parsed }, null, 2));
