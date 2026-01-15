app.post("/api/send", async (req, res) => {
  try {
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

        errors.push({
          endpoint: sub?.endpoint?.slice(0, 60) + "...",
          status,
          msg: String(msg).slice(0, 250)
        });

        console.error("❌ push fail:", status, msg);
      }
    }

    return res.json({
      ok: true,
      success,
      failed,
      total: subscribers.length,
      errors: errors.slice(0, 5)
    });

  } catch (e) {
    console.error("❌ send error:", e);
    return res.status(500).json({ ok: false, error: String(e) });
  }
});
