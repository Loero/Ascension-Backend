import express from "express";
import cors from "cors";
import multer from "multer";
import { v2 as cloudinary } from "cloudinary";
import fs from "fs";

const app = express();
app.use(cors());
const upload = multer({ dest: "uploads/" });

/* ====== CLOUDINARY ====== */
cloudinary.config({
  cloud_name: "dpgrckgpd",
  api_key: "971153315419944",
  api_secret: "8Il9Me1gW-ZOK-hkwjazlT_rMYM",
});

/* ====== YOUCAM ====== */
const YOUCAM_URL =
  "https://yce-api-01.makeupar.com/s2s/v2.0/task/skin-analysis";

const YOUCAM_TOKEN =
  "sk-k-JqVOqEWFz8RxwRkOjAC05xLtfkfCQ5Vf8dEJ0vDykLXPpWhk2dGtWc9CNcZeX7";

/* ====== SEGÉD ====== */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ====== YOUCAM START ====== */
async function startTask(imageUrl) {
  const res = await fetch(YOUCAM_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${YOUCAM_TOKEN}`,
    },
    body: JSON.stringify({
      src_file_url: imageUrl,
      dst_actions: ["acne", "oiliness"],
      format: "json",
    }),
  });

  const payload = await res.json();
  console.log("YouCam START válasz:", JSON.stringify(payload, null, 2));
  return payload?.data?.task_id;
}

/* ====== YOUCAM POLL ====== */
async function pollTask(taskId) {
  for (let i = 0; i < 60; i++) {
    const res = await fetch(`${YOUCAM_URL}/${encodeURIComponent(taskId)}`, {
      headers: {
        Authorization: `Bearer ${YOUCAM_TOKEN}`,
      },
    });

    const payload = await res.json();
    const status = payload?.data?.task_status;

    console.log("YouCam poll státusz:", status);
    console.log("YouCam poll payload:", JSON.stringify(payload, null, 2));

    if (status === "success") {
      return payload.data.results;
    }

    if (status === "error") {
      throw new Error(
        "YouCam task error: " + JSON.stringify(payload?.data?.error || payload)
      );
    }

    await sleep(2000);
  }

  throw new Error("YouCam timeout");
}

/* ====== EGYSZERŰ TANÁCS ====== */
function generateAdvice(rawResults) {
  const advice = [];

  if (!rawResults?.output) {
    return ["Nem sikerült elemezni az arcot."];
  }

  const oiliness = rawResults.output.find((o) => o.type === "oiliness");
  const acne = rawResults.output.find((o) => o.type === "acne");

  if (oiliness && oiliness.ui_score > 60) {
    advice.push("Zsíros bőr: könnyű, gél állagú hidratálót használj.");
  }

  if (acne && acne.ui_score > 30) {
    advice.push("Pattanások: BHA / szalicilsav segíthet.");
  }

  if (advice.length === 0) {
    advice.push("A bőröd jó állapotban van, tartsd a rutinod.");
  }

  return advice;
}

/* ====== API ====== */
app.post("/analyze", upload.single("image"), async (req, res) => {
  try {
    // 1. feltöltés Cloudinary-be
    const uploadRes = await cloudinary.uploader.upload(req.file.path, {
      resource_type: "image",
      transformation: [{ quality: "auto:best" }, { fetch_format: "jpg" }],
    });

    const imageUrl = uploadRes.secure_url;

    // 2. YouCam indítás
    const taskId = await startTask(imageUrl);
    if (!taskId) throw new Error("No task id from YouCam");

    // 3. YouCam poll
    const rawResults = await pollTask(taskId);

    // 4. tanács
    const advice = generateAdvice(rawResults);

    // 5. letisztult eredmény JSON-hoz
    const cleanedResults = {};

    rawResults.output.forEach((item) => {
      if (item.type === "oiliness") cleanedResults.oiliness = item.ui_score;
      if (item.type === "acne") cleanedResults.acne = item.ui_score;
      if (item.type === "all") cleanedResults.overall = item.score;
    });

    // ✅ SIKERES VÁLASZ A FRONTENDNEK
    res.json({
      success: true,
      results: cleanedResults,
      advice: advice,
    });
  } catch (err) {
    console.error("BACKEND ERROR:", err);
    res.status(500).json({ error: "Elemzés sikertelen" });
  }
});

/* ====== START ====== */
app.listen(3000, () => {
  console.log("Backend fut: http://localhost:3000");
});
