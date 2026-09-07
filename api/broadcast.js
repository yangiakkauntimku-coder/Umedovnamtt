// ============================================================
//  UMEDOVNA MTT — Botdan ommaviy xabar yuborish (broadcast)
//  Bu fayl /api/broadcast.js yo'lida turishi kerak.
//
//  Faqat admin.html orqali, is_admin=true bo'lgan hisob chaqira oladi.
//  Bot bilan bir marta ham bo'lsa gaplashgan (yoki /start bosgan)
//  barcha odamlarga xabar yuboradi.
// ============================================================

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const SUPABASE_URL = "https://zjybykvjwoictuyplvgk.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpqeWJ5a3Zqd29pY3R1eXBsdmdrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc5NDAxMzIsImV4cCI6MjEwMzUxNjEzMn0.3Wa3qqAsidpmwT4Qn4QQXpr3t9IVgOaqjn1s5-W4E-U";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Ko'p foydalanuvchiga ketma-ket yuborish vaqt olishi mumkin,
// shuning uchun funksiya vaqtini uzaytiramiz (Vercel qo'llab-quvvatlagan maksimal darajada).
export const config = {
  maxDuration: 60,
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Faqat POST so'rov qabul qilinadi" });
    return;
  }
  if (!BOT_TOKEN || !SERVICE_ROLE_KEY) {
    console.error("BOT_TOKEN yoki SERVICE_ROLE_KEY topilmadi.");
    res.status(500).json({ error: "Server sozlanmagan" });
    return;
  }

  try {
    const { access_token, message } = req.body || {};
    if (!access_token || !message || !message.trim()) {
      res.status(400).json({ error: "access_token va message majburiy" });
      return;
    }

    // 1) Foydalanuvchini tekshiramiz — u haqiqatan ham tizimga kirganmi?
    const userResp = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${access_token}` },
    });
    if (!userResp.ok) {
      res.status(401).json({ error: "Sessiya yaroqsiz, qaytadan kiring" });
      return;
    }
    const user = await userResp.json();

    // 2) U admin ekanini tekshiramiz (service role bilan, RLS'ni chetlab o'tib)
    const profileResp = await fetch(
      `${SUPABASE_URL}/rest/v1/profiles?id=eq.${user.id}&select=is_admin`,
      {
        headers: {
          apikey: SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        },
      }
    );
    const profileRows = await profileResp.json();
    if (!profileRows?.[0]?.is_admin) {
      res.status(403).json({ error: "Bu amal faqat administratorlar uchun" });
      return;
    }

    // 3) Barcha Telegram foydalanuvchilarini olamiz
    const usersResp = await fetch(`${SUPABASE_URL}/rest/v1/telegram_users?select=chat_id`, {
      headers: {
        apikey: SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      },
    });
    const telegramUsers = await usersResp.json();

    if (!telegramUsers || telegramUsers.length === 0) {
      res.status(200).json({ sent: 0, failed: 0, total: 0 });
      return;
    }

    // 4) Har biriga birma-bir yuboramiz (Telegram cheklovlariga urilmaslik uchun sekin)
    let sent = 0;
    let failed = 0;
    for (const row of telegramUsers) {
      try {
        const sendResp = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: row.chat_id, text: message }),
        });
        if (sendResp.ok) sent++;
        else failed++;
      } catch {
        failed++;
      }
      // Telegram flood-limit'iga urilmaslik uchun kichik pauza
      await new Promise((r) => setTimeout(r, 40));
    }

    res.status(200).json({ sent, failed, total: telegramUsers.length });
  } catch (err) {
    console.error("broadcast xatoligi:", err);
    res.status(500).json({ error: "Server xatosi" });
  }
}
