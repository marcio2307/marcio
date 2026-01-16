// server.js (COMPLETO) — Pai Márcio (Render Web Push)
// ✅ /health mostra vapidReady e quantidade de inscritos
// ✅ /api/subscribe registra subscription
// ✅ /api/send (POST) envia push e retorna details com erros por endpoint
// ✅ /api/send-test (GET) envia um push de teste pra você abrir no navegador
// ✅ remove automaticamente subscriptions inválidas (404/410)

import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import webpush from "web-push";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

/* ===========================
   CORS (GitHub Pages → Render)
=========================== */
app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type"],
  })
);

app.use(express.json({ limit: "1mb" }));

/* ===========================
   Servir painel (se tiver /public)
=========================== */
app.use(express.static(path.join(__dirname, "public")));

/* ===========================
   VAPID (Render ENV)
=========================== */
const VAPID_PUBLIC_KEY = (process.env.VAPID_PUBLIC_KEY || "").trim();
const VAPID_PRIVATE_KEY = (process.env.VAPID_PRIVATE_KEY || "").trim();
const VAPID_SUBJECT = (process.env.VAPID_SUBJECT || "mailto:contato@cartomantesonline.site").trim();

let vapidReady = false;

if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
  console.warn("⚠️ VAPID keys ausentes no Render");
} else {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  vapidReady = true;
  console.log("✅ VAPID configurado");
}

/* ===========================
   MEMÓRIA (RAM)
   (Se reiniciar o Render, zera)
=========================== */
let subscribers = [];

/* ===========================
   Util: envia push para todos
=========================== */
async function sendToAll({ title, body, url, icon }) {
  if (!vapidReady) {
    return {
      ok: false,
      status: 500,
      error: "VAPID não configurado no Render (ENV)",
    };
  }

  if (!subscribers.length) {
    return { ok: true, success: 0, failed: 0, total: 0, details: [] };
  }

  const payload = JSON.stringify({
    title: (title || "Pai Márcio de Oxóssi").trim(),
    body: (body || "Você recebeu uma nova mensagem.").trim(),
    url: (url || "https://marcio2307.github.io/cartomantesonline/inicio.html?pwa=true").trim(),
    icon: (icon || "https://marcio2307.github.io/cartomantesonline/logo-v2.png").trim(),
  });

  let success = 0;
  let failed = 0;
  const details = [];

  for (const sub of [...subscribers]) {
    try {
      await webpush.sendNotification(sub, payload);
      success++;
      details.push({ endpoint: sub.endpoint, ok: true });
    } catch (err) {
      failed++;

      const status = err?.statusCode || err?.status || 0;
      const msg = err?.body || err?.message || String(err);

      details.push({ endpoint: sub.endpoint, ok: false, status, msg });

      // remove inválidas (muito comum quando troca VAPID / reinstala PWA)
      if (status === 404 || status === 410) {
        subscribers = subscribers.filter((s) => s.endpoint !== sub.endpoint);
      }

      console.error("❌ push fail:", status, msg);
    }
  }

  return { ok: true, success, failed, total: subscribers.length, details };
}

/* ===========================
   Health
=========================== */
app.get("/health", (req, res) => {
  res.json({ ok: true, vapidReady, subs: subscribers.length });
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

    const exists = subscribers.some((s) => s.endpoint === subscription.endpoint);
    if (!exists) subscribers.push(subscription);

    console.log("✅ Novo inscrito:", subscription.endpoint);
    res.json({ ok: true, total: subscribers.length });
  } catch (e) {
    console.error("❌ subscribe error:", e);
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

/* ===========================
   Enviar PUSH (POST)
=========================== */
app.post("/api/send", async (req, res) => {
  try {
    const { title, body, url, icon } = req.body || {};
    const result = await sendToAll({ title, body, url, icon });

    if (!result.ok && result.status) {
      return res.status(result.status).json(result);
    }
    res.json(result);
  } catch (e) {
    console.error("❌ send error:", e);
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

/* ===========================
   Enviar teste (GET) — abre no navegador
   https://SEU-RENDER.onrender.com/api/send-test
=========================== */
app.get("/api/send-test", async (req, res) => {
  try {
    const result = await sendToAll({
      title: "Pai Márcio de Oxóssi ✅",
      body: "Teste do Render — " + new Date().toLocaleString("pt-BR"),
      url: "https://marcio2307.github.io/cartomantesonline/inicio.html?pwa=true",
      icon: "https://marcio2307.github.io/cartomantesonline/logo-v2.png",
    });

    if (!result.ok && result.status) {
      return res.status(result.status).json(result);
    }
    res.json(result);
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

/* ===========================
   Raiz
=========================== */
app.get("/", (req, res) => {
  res.send("Render API OK ✅");
});

/* ===========================
   Start
=========================== */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("✅ Render rodando na porta", PORT));
