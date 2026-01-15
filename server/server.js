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
const VAPID_PUBLIC_KEY  = (process.env.VAPID_PUBLIC_KEY || "").trim();
const VAPID_PRIVATE_KEY = (process.env.VAPID_PRIVATE_KEY || "").trim();
const VAPID_SUBJECT     = (process.env.VAPID_SUBJECT || "mailto:contato@cartomantesonline.site").trim();

// ✅ valida rápido (evita ficar “parece que envia” mas não envia)
function looksLikeVapidPublicKey(k){
  return typeof k === "string" && k.length >= 80 && /^[A-Za-z0-9\-_]+$/.test(k);
}
function looksLikeVapidPrivateKey(k){
  return typeof k === "string" && k.length >= 40 && /^[A-Za-z0-9\-_]+$/.test(k);
}

let vapidReady = false;

if (!looksLikeVapidPublicKey(VAPID_PUBLIC_KEY) || !looksLikeVapidPrivateKey(VAPID_PRIVATE_KEY)) {
  console.warn("⚠️ VAPID inválida/ausente no Render ENV. Push NÃO vai funcionar.");
  console.warn("PUBLIC length:", VAPID_PUBLIC_KEY?.length || 0);
  console.warn("PRIVATE length:", VAPID_PRIVATE_KEY?.length || 0);
} else {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  vapidReady = true;
  console.log("✅ VAPID configurado com sucesso");
}

/* ===========================
   MEMÓRIA (RAM)
   ⚠️ Render pode reiniciar e perder inscritos.
=========================== */
let subscribers = [];

/* ===========================
   Health
=========================== */
app.get("/health", (req, res) => {
  res.json({
    ok: true,
    vapidReady,
    subs: subscribers.length
  });
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
      return res.status(400).json({ ok: false, error: "subscription inválida (sem endpoint)" });
    }

    // salva sempre os campos essenciais
    const clean = {
      endpoint: subscription.endpoint,
      keys: subscription.keys || {}
    };

    const exists = subscribers.some(s => s.endpoint === clean.endpoint);
    if (!exists) subscribers.push(clean);

    console.log("✅ Novo inscrito:", clean.endpoint);
    res.json({ ok: true, total: subscribers.length });
  } catch (e) {
    console.error("❌ subscribe error:", e);
    res.status(500).json({ ok: false, error: String(e) });
  }
});

/* ===========================
   Enviar PUSH
   ✅ retorna errors[] com o motivo real do fail
=========================== */
app.post("/api/send", async (req, res) => {
  try {
    if (!vapidReady) {
      return res.status(500).json({
        ok: false,
        error: "VAPID não configurado no Render. Confira VAPID_PUBLIC_KEY e VAPID_PRIVATE_KEY nas ENV."
      });
    }

    const { title, body, url, icon } = req.body || {};

    if (!subscribers.length) {
      return res.json({ ok: true, success: 0, failed: 0, total: 0, errors: [] });
    }

    let success = 0;
    let failed = 0;
    let errors = [];

    const defaultUrl  = "https://marcio2307.github.io/cartomantesonline/inicio.html?pwa=true";
    const defaultIcon = "https://marcio2307.github.io/cartomantesonline/logo-v2.png";

    const payload = JSON.stringify({
      title: (title || "Pai Márcio de Oxóssi").trim(),
      body: (body || "Você recebeu uma nova mensagem.").trim(),
      url: (url || defaultUrl).trim(),
      icon: (icon || defaultIcon).trim()
    });

    for (const sub of [...subscribers]) {
      try {
        await webpush.sendNotification(sub, payload);
        success++;
      } catch (err) {
        failed++;

        const status = err?.statusCode || err?.status || 0;
        const msg = err?.body || err?.message || String(err);

        // remove endpoints mortos
        if (status === 404 || status === 410) {
          subscribers = subscribers.filter(s => s.endpoint !== sub.endpoint);
        }

        console.error("❌ push fail:", status, msg);

        errors.push({
          status,
          message: String(msg).slice(0, 250),
          endpoint: (sub.endpoint || "").slice(0, 80) + "..."
        });
      }
    }

    res.json({
      ok: true,
      success,
      failed,
      total: subscribers.length,
      errors: errors.slice(0, 10)
    });

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
app.listen(PORT, () => console.log("✅ Render rodando na porta", PORT));
