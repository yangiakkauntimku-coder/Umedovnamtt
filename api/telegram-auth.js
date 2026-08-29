// ============================================================
//  UMEDOVNA MTT — Telegram orqali avtomatik kirish + kanal tekshiruvi
//  Bu fayl /api/telegram-auth.js yo'lida turishi kerak.
//
//  Vazifasi:
//   1) Telegram yuborgan ma'lumotni (initData) TEKSHIRADI (soxta
//      bo'lmasligi uchun bot tokeni bilan imzo tasdiqlanadi).
//   2) Foydalanuvchi CHANNEL_USERNAME kanaliga a'zo ekanini tekshiradi.
//      A'zo bo'lmasa — { subscribed:false } qaytaradi.
//   3) A'zo bo'lsa — Supabase'da hisob topadi/yaratadi va saytga
//      kirish uchun email+parolni qaytaradi.
// ============================================================

import crypto from "crypto";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const SUPABASE_URL = "https://zjybykvjwoictuyplvgk.supabase.co";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const APP_SECRET = process.env.TELEGRAM_LOGIN_SECRET;

// -------- O'ZGARTIRISHINGIZ MUMKIN BO'LGAN QATOR --------
// Majburiy a'zolik so'raladigan kanal (@ belgisi bilan).
// Botingiz shu kanalga ADMIN sifatida qo'shilgan bo'lishi shart,
// aks holda Telegram a'zolikni tekshirishga ruxsat bermaydi.
const CHANNEL_USERNAME = "@maktabgachaHub";
// ------------------------------------------------------------

function verifyTelegramInitData(initData) {
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return false;
  params.delete("hash");

  const pairs = [];
  for (const [key, value] of [...params.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    pairs.push(`${key}=${value}`);
  }
  const dataCheckString = pairs.join("\n");

  const secretKey = crypto.createHmac("sha256", "WebAppData").update(BOT_TOKEN).digest();
  const computedHash = crypto.createHmac("sha256", secretKey).update(dataCheckString).digest("hex");

  return computedHash === hash;
}

async function isChannelMember(tgId) {
  try {
    const resp = await fetch(
      `https://api.telegram.org/bot${BOT_TOKEN}/getChatMember?chat_id=${encodeURIComponent(CHANNEL_USERNAME)}&user_id=${tgId}`
    );
    const data = await resp.json();
    if (!data.ok) {
      // Bot kanalga admin qilib qo'shilmagan yoki boshqa sozlash xatosi.
      // Bunday holda foydalanuvchini bloklamaymiz (fail-open), lekin logga yozamiz.
      console.error("getChatMember xatoligi (bot kanalga admin qilib qo'shilganmi tekshiring):", data);
      return true;
    }
    const status = data.result?.status;
    return ["member", "administrator", "creator"].includes(status);
  } catch (err) {
    console.error("Kanal a'zoligini tekshirishda xatolik:", err);
    return true; // tarmoq xatosida ham bloklamaymiz
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Faqat POST so'rov qabul qilinadi" });
    return;
  }
  if (!BOT_TOKEN || !SERVICE_ROLE_KEY || !APP_SECRET) {
    console.error("Muhim muhit o'zgaruvchilari topilmadi (BOT_TOKEN / SERVICE_ROLE_KEY / APP_SECRET).");
    res.status(500).json({ error: "Server sozlanmagan" });
    return;
  }

  try {
    const { initData } = req.body || {};
    if (!initData) {
      res.status(400).json({ error: "initData yuborilmadi" });
      return;
    }
    if (!verifyTelegramInitData(initData)) {
      res.status(401).json({ error: "Telegram ma'lumoti tasdiqlanmadi" });
      return;
    }

    const params = new URLSearchParams(initData);
    const userJson = params.get("user");
    if (!userJson) {
      res.status(400).json({ error: "Foydalanuvchi ma'lumoti topilmadi" });
      return;
    }
    const tgUser = JSON.parse(userJson);
    const tgId = tgUser.id;

    const subscribed = await isChannelMember(tgId);
    if (!subscribed) {
      res.status(200).json({
        subscribed: false,
        channelUrl: `https://t.me/${CHANNEL_USERNAME.replace("@", "")}`,
      });
      return;
    }

    const fullName = [tgUser.first_name, tgUser.last_name].filter(Boolean).join(" ") || "Telegram foydalanuvchisi";
    const usernameTag = tgUser.username ? "@" + tgUser.username : "";

    const email = `mtt.tg${tgId}@gmail.com`;
    const password = crypto.createHmac("sha256", APP_SECRET).update(`tg${tgId}`).digest("hex");

    const createResp = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: fullName, phone: usernameTag },
      }),
    });

    if (!createResp.ok) {
      const errBody = await createResp.json().catch(() => ({}));
      const msg = (errBody.msg || errBody.error_description || errBody.message || "").toLowerCase();
      const alreadyExists = msg.includes("already") || msg.includes("registered") || msg.includes("exists");
      if (!alreadyExists) {
        console.error("Foydalanuvchi yaratishda xatolik:", createResp.status, errBody);
      }
    }

    res.status(200).json({ subscribed: true, email, password });
  } catch (err) {
    console.error("telegram-auth xatoligi:", err);
    res.status(500).json({ error: "Server xatosi" });
  }
}
