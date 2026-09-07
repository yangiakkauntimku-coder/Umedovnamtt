// ============================================================
//  UMEDOVNA MTT — Telegram bot webhook (Vercel Serverless Function)
//  Bu fayl /api/webhook.js yo'lida turishi kerak.
//
//  Pastki menyuda 2 ta tugma bo'ladi (Test ishlash BotFather orqali
//  sozlangan chap tomondagi doimiy Menu Button orqali ochiladi,
//  shuning uchun bu yerda takrorlanmaydi):
//   🔥 VIP obuna            -> obuna haqida matn bilan javob beradi
//   ℹ️ Ma'lumot va yordam   -> platforma haqida qisqa ma'lumot beradi
// ============================================================

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const SUPABASE_URL = "https://zjybykvjwoictuyplvgk.supabase.co";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// -------- O'ZGARTIRISHINGIZ MUMKIN BO'LGAN MATNLAR --------
const ADMIN_CONTACT = "@AzadiB_way"; // <-- shu yerga o'z Telegram username'ingizni yozing
const VIP_TEXT =
  `🔥 VIP obuna\n\n` +
  `VIP obuna orqali barcha maxsus testlarga kirish imkoniyati ochiladi.\n\n` +
  `Obuna olish uchun administrator bilan bog'laning: ${ADMIN_CONTACT}`;
const INFO_TEXT =
  `ℹ️ Umedovna MTT haqida\n\n` +
  `Bu platforma attestatsiyaga tayyorlanayotgan tarbiyachilar uchun mo'ljallangan.\n\n` +
  `📝 Testlar rasmiy attestatsiya formatida (belgilangan vaqt ichida)\n` +
  `📊 Har bir test yakunida natijangizni darhol ko'rasiz\n` +
  `⭐ Ba'zi testlar VIP obunachilar uchun\n\n` +
  `Savollar bo'lsa: ${ADMIN_CONTACT}`;
// ------------------------------------------------------------

const MAIN_MENU = {
  keyboard: [
    [{ text: "🔥 VIP obuna" }, { text: "ℹ️ Ma'lumot va yordam" }],
  ],
  resize_keyboard: true,
  is_persistent: true,
};

async function sendMessage(chatId, text, extra = {}) {
  const resp = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      reply_markup: MAIN_MENU,
      ...extra,
    }),
  });
  if (!resp.ok) {
    const body = await resp.text();
    console.error("Telegram sendMessage xatoligi:", resp.status, body);
  }
}

async function rememberTelegramUser(chatId, firstName, username) {
  if (!SERVICE_ROLE_KEY) return; // sozlanmagan bo'lsa, jim o'tkazib yuboramiz
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/telegram_users`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        Prefer: "resolution=merge-duplicates",
      },
      body: JSON.stringify({
        chat_id: chatId,
        first_name: firstName || "",
        username: username || "",
      }),
    });
  } catch (err) {
    console.error("Telegram foydalanuvchini saqlashda xatolik:", err);
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(200).send("Umedovna MTT bot webhook ishlayapti.");
    return;
  }

  if (!BOT_TOKEN) {
    console.error("TELEGRAM_BOT_TOKEN muhit o'zgaruvchisi topilmadi.");
    res.status(200).send("OK");
    return;
  }

  try {
    const update = req.body;
    const message = update?.message;
    const chatId = message?.chat?.id;
    const text = (message?.text || "").trim();

    if (chatId) {
      const firstName = message?.from?.first_name || "";
      const username = message?.from?.username ? "@" + message.from.username : "";
      await rememberTelegramUser(chatId, firstName, username);

      if (text.startsWith("/start")) {
        await sendMessage(
          chatId,
          `Assalomu alaykum${firstName ? ", " + firstName : ""}! 👋\n\n` +
            `Umedovna MTT — attestatsiyaga tayyorlanayotgan tarbiyachilar uchun test platformasi.\n\n` +
            `📢 Diqqat: saytdan foydalanish uchun avval @maktabgachaHub va @attestatsiya100natija kanallariga a'zo bo'lishingiz kerak.\n\n` +
            `🎓 Test ishlash uchun yozish maydoni yonidagi tugmani bosing.\n` +
            `Qolgan savollar uchun pastdagi menyudan foydalaning 👇`
        );
      } else if (text.includes("VIP")) {
        await sendMessage(chatId, VIP_TEXT);
      } else if (text.includes("Ma'lumot") || text.includes("Malumot") || text.includes("yordam")) {
        await sendMessage(chatId, INFO_TEXT);
      } else {
        // Boshqa har qanday matnga ham menyuni qayta ko'rsatamiz
        await sendMessage(chatId, "Pastdagi menyudan foydalaning 👇");
      }
    }

    res.status(200).send("OK");
  } catch (err) {
    console.error("Webhook xatoligi:", err);
    res.status(200).send("OK");
  }
}
