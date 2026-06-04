import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
function readVar(name) {
  for (const f of [".env.local", ".env"]) {
    let txt = ""; try { txt = readFileSync(f, "utf8"); } catch { continue; }
    for (const line of txt.split(/\r?\n/)) {
      const m = line.match(new RegExp(`^\\s*${name}\\s*=\\s*(.*)\\s*$`));
      if (m) { const v = m[1].trim().replace(/^["']|["']$/g, ""); if (v) return v; }
    }
  }
  return "";
}
const admin = createClient(readVar("NEXT_PUBLIC_SUPABASE_URL"), readVar("SUPABASE_SERVICE_ROLE_KEY"), { auth: { autoRefreshToken: false, persistSession: false } });
const USER_ID = "bae94c19-4c5d-480a-aef2-18b37ea2fc8e";
const bal = async () => (await admin.from("ai_credit_balances").select("balance").eq("user_id", USER_ID).maybeSingle()).data?.balance ?? 0;
console.log("balance before:", await bal());
const { data, error } = await admin.rpc("spend_ai_credits", { p_user_id: USER_ID, p_amount: 2 });
if (error) {
  console.log("spend_ai_credits ERROR:", error.code, error.message);
} else {
  console.log("spend_ai_credits(2) OK -> new balance", data);
  await admin.rpc("add_ai_credits", { p_user_id: USER_ID, p_amount: 2, p_reason: "refund", p_ref: null });
  console.log("refunded; balance restored:", await bal());
}
