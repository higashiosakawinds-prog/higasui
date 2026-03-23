import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const GMAIL_USER     = Deno.env.get("GMAIL_USER")!;

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS });
  }
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const { message_id } = await req.json();

  // メッセージ取得
  const { data: msg, error: msgErr } = await supabase
    .from("messages")
    .select("*")
    .eq("id", message_id)
    .single();

  if (msgErr || !msg) {
    return new Response(JSON.stringify({ error: "message not found" }), {
      status: 404, headers: { ...CORS, "Content-Type": "application/json" }
    });
  }

  // 送信先メールアドレス取得
  let query = supabase.from("members").select("email");
  if (msg.target_type === "members") {
    query = query.in("role", ["president","vice_president","conductor","director","committee","member"]);
  } else if (msg.target_type === "part") {
    query = query.eq("part", msg.target_part);
  } else if (msg.target_type === "guardians") {
    query = query.eq("role", "guardian");
  } else if (msg.target_type === "school") {
    query = query.eq("role", "instructor");
  } else if (msg.target_type === "individual") {
    query = query.in("id", msg.target_ids ?? []);
  }

  const { data: targets, error: targetErr } = await query;
  if (targetErr || !targets) {
    return new Response(JSON.stringify({ error: "target fetch failed" }), {
      status: 500, headers: { ...CORS, "Content-Type": "application/json" }
    });
  }

  const emails = targets.map((t: any) => t.email).filter(Boolean);
  if (emails.length === 0) {
    return new Response(JSON.stringify({ error: "no recipients" }), {
      status: 400, headers: { ...CORS, "Content-Type": "application/json" }
    });
  }

  // Resendで送信
  let successCount = 0;
  for (const email of emails) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: `東大阪吹奏楽団 <onboarding@resend.dev>`,
        to: [email],
        reply_to: GMAIL_USER,
        subject: msg.subject,
        text: msg.body,
      }),
    });
    if (res.ok) successCount++;
  }

  // 送信済みに更新
  await supabase
    .from("messages")
    .update({
      status:     "sent",
      sent_at:    new Date().toISOString(),
      sent_count: successCount,
    })
    .eq("id", message_id);

  return new Response(
    JSON.stringify({ success: true, sent_count: successCount }),
    { headers: { ...CORS, "Content-Type": "application/json" } }
  );
});
