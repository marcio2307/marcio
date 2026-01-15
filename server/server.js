import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import webpush from "web-push";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

/* ===========================
   CORS liberado (GitHub Pages → Render)
=========================== */
app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type"]
}));

app.use(express.json({ limit: "1mb" }));

/* ===========================
   Servir painel /admin.html
=========================== */
app.use(express.static(path.join(__dirname, "public")));

/* ===========================
   VAPID (Render ENV)
=========================== */
const VAPID_PUBLIC_KEY  = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT     = process.env.VAPID_SUBJECT || "mailto:contato@cartomantesonline.site";

if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
  console.warn("⚠️ VAPID keys ausentes no Render");
} else {
  webpush.setVapidDetails(
    VAPID_SUBJECT,
    VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY
  );
  console.log("✅ VAPID configurado");
}

/* ===========================
   MEMÓRIA (RAM)
=========================== */
let subscribers = [];

/* ===========================
   Health
=========================== */
app.get("/health", (req, res) => {
  res.json({ ok: true });
});

/* ===========================
   Total de inscritos
=========================== */
app.get("/api/subscribers", (req, res) => {
  res.json({ total: subscribers.length });
});

/* ===========================
   Registrar inscrição
=========================== */
app.post("/api/subscribe", (req, res) => {
  try {
    const { subscription } = req.body || {};

    if (!subscription || !subscription.endpoint) {
      return res.status(400).json({ ok: false, error: "subscription inválida" });
    }

    const exists = subscribers.some(s => s.endpoint === subscription.endpoint);
    if (!exists) subscribers.push(subscription);

    console.log("✅ Novo inscrito:", subscription.endpoint);
    res.json({ ok: true, total: subscribers.length });
  } catch (e) {
    console.error("❌ subscribe error:", e);
    res.status(500).json({ ok: false, error: String(e) });
  }
});

/* ===========================
   Enviar PUSH
=========================== */
app.post("/api/send", async (req, res) => {
  try {
    const { title, body, url, icon } = req.body || {};

    if (!subscribers.length) {
      return res.json({ ok: true, success: 0, failed: 0, total: 0 });
    }

    let success = 0;
    let failed = 0;

    const defaultUrl  = "https://marcio2307.github.io/cartomantesonline/inicio.html";
    const defaultIcon = "https://marcio2307.github.io/cartomantesonline/logo.png";

    const payload = JSON.stringify({
      title: title || "Cartomantes Online",
      body: body || "Você recebeu uma nova mensagem.",
      url: url?.trim() || defaultUrl,
      icon: icon?.trim() || defaultIcon
    });

    for (const sub of [...subscribers]) {
      try {
        await webpush.sendNotification(sub, payload);
        success++;
      } catch (err) {
        failed++;

        const status = err?.statusCode || err?.status;
        if (status === 404 || status === 410) {
          subscribers = subscribers.filter(s => s.endpoint !== sub.endpoint);
        }

        console.error("❌ push fail:", status, err?.message);
      }
    }

    res.json({ ok: true, success, failed, total: subscribers.length });
  } catch (e) {
    console.error("❌ send error:", e);
    res.status(500).json({ ok: false, error: String(e) });
  }
});

/* ===========================
   Raiz
=========================== */
app.get("/", (req, res) => {
  res.send("Render API OK ✅");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () =>
  console.log("✅ Render rodando na porta", PORT)
);
