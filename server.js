const http = require("http");
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const zlib = require("zlib");

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = __dirname;
const DATA_DIR = path.join(__dirname, "data");
const LEADS_FILE = path.join(DATA_DIR, "leads.jsonl");
const MAX_BODY_SIZE = 1024 * 64;
const RATE_WINDOW_MS = 60_000;
const RATE_MAX_REQUESTS = 10;

const rateLimitMap = new Map();

function loadEnvFile() {
  const envPath = path.join(__dirname, ".env");
  if (!fs.existsSync(envPath)) return;

  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const index = trimmed.indexOf("=");
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^["']|["']$/g, "");
    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

loadEnvFile();

function isRateLimited(ip) {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  if (!entry || now - entry.windowStart > RATE_WINDOW_MS) {
    rateLimitMap.set(ip, { windowStart: now, count: 1 });
    return false;
  }

  entry.count += 1;
  return entry.count > RATE_MAX_REQUESTS;
}

setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateLimitMap) {
    if (now - entry.windowStart > RATE_WINDOW_MS) {
      rateLimitMap.delete(ip);
    }
  }
}, RATE_WINDOW_MS);

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}

function setSecurityHeaders(response) {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "SAMEORIGIN");
  response.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  response.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  response.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self' cdn.jsdelivr.net; style-src 'self' fonts.googleapis.com 'unsafe-inline'; font-src fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'"
  );
}

function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";

    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > MAX_BODY_SIZE) {
        reject(new Error("Payload too large"));
        request.destroy();
      }
    });

    request.on("end", () => resolve(body));
    request.on("error", reject);
  });
}

function sanitizeLead(rawLead) {
  const lead = {};

  for (const [key, value] of Object.entries(rawLead || {})) {
    if (key === "website") {
      continue;
    }

    lead[key] = String(value).trim().slice(0, 500);
  }

  lead.createdAt = new Date().toISOString();
  return lead;
}

function toArray(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function buildLeadComment(lead) {
  const comment = [
    lead.comment,
    lead.quantity ? `Cantitate: ${lead.quantity}` : "",
    lead.material ? `Material: ${lead.material}` : "",
    lead.panelType ? `Tip: ${lead.panelType}` : "",
    lead.thickness ? `Grosime: ${lead.thickness}` : "",
    lead.location ? `Localitate: ${lead.location}` : "",
    lead.source ? `Sursa: ${lead.source}` : "",
  ].filter(Boolean).join("\n");

  return comment || "Lead TEHNOFASAD";
}

function buildBitrix24LeadPayload(lead) {
  const fields = {
    TITLE: lead.product ? `TEHNOFASAD: ${lead.product}` : "TEHNOFASAD: solicitare de pe site",
    NAME: lead.name || "",
    COMMENTS: buildLeadComment(lead),
    SOURCE_ID: process.env.BITRIX24_SOURCE_ID || "WEB",
    STATUS_ID: process.env.BITRIX24_STATUS_ID || "NEW",
    WEB: [{ VALUE: "https://tehnofasad.md/", VALUE_TYPE: "WORK" }],
  };

  if (lead.phone) {
    fields.PHONE = [{ VALUE: lead.phone, VALUE_TYPE: "WORK" }];
  }

  if (lead.email) {
    fields.EMAIL = [{ VALUE: lead.email, VALUE_TYPE: "WORK" }];
  }

  if (lead.location) {
    fields.ADDRESS_CITY = lead.location;
  }

  if (process.env.BITRIX24_ASSIGNED_BY_ID) {
    fields.ASSIGNED_BY_ID = process.env.BITRIX24_ASSIGNED_BY_ID;
  }

  const extraFields = toArray(process.env.BITRIX24_EXTRA_FIELDS);
  extraFields.forEach((entry) => {
    const separatorIndex = entry.indexOf(":");
    if (separatorIndex > 0) {
      const key = entry.slice(0, separatorIndex).trim();
      const value = entry.slice(separatorIndex + 1).trim();
      if (key && value) fields[key] = value;
    }
  });

  return {
    fields,
    params: { REGISTER_SONET_EVENT: "Y" },
  };
}

function getBitrix24LeadUrl() {
  const webhookUrl = String(process.env.BITRIX24_WEBHOOK_URL || "").trim();
  if (!webhookUrl) return "";
  if (/crm\.lead\.add(?:\.json)?$/i.test(webhookUrl)) return webhookUrl;
  return `${webhookUrl.replace(/\/$/, "")}/crm.lead.add.json`;
}

async function sendLeadToBitrix24(lead) {
  const leadUrl = getBitrix24LeadUrl();

  if (!leadUrl) {
    return { skipped: true, reason: "BITRIX24_WEBHOOK_URL is not configured" };
  }

  const payload = buildBitrix24LeadPayload(lead);

  const response = await fetch(leadUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch (error) {
    data = { raw: text };
  }

  if (!response.ok || data.error) {
    throw new Error(`Bitrix24 CRM error: ${JSON.stringify(data).slice(0, 500)}`);
  }

  return { ok: true, response: data };
}

async function saveLead(rawLead) {
  const lead = sanitizeLead(rawLead);
  await fsp.mkdir(DATA_DIR, { recursive: true });
  await fsp.appendFile(LEADS_FILE, `${JSON.stringify(lead)}\n`, "utf8");

  try {
    const crmResult = await sendLeadToBitrix24(lead);
    if (!crmResult.skipped) {
      await fsp.appendFile(path.join(DATA_DIR, "crm-sync.jsonl"), `${JSON.stringify({ createdAt: new Date().toISOString(), leadPhone: lead.phone || "", result: crmResult })}\n`, "utf8");
    }
  } catch (error) {
    await fsp.appendFile(path.join(DATA_DIR, "crm-errors.jsonl"), `${JSON.stringify({ createdAt: new Date().toISOString(), leadPhone: lead.phone || "", error: error.message })}\n`, "utf8");
  }

  return lead;
}

async function handleLead(request, response) {
  try {
    const clientIp = request.headers["x-forwarded-for"]?.split(",")[0]?.trim() || request.socket.remoteAddress;

    if (isRateLimited(clientIp)) {
      sendJson(response, 429, { ok: false, message: "Too many requests. Try again later." });
      return;
    }

    if (!String(request.headers["content-type"] || "").includes("application/json")) {
      sendJson(response, 415, { ok: false, message: "JSON content type required" });
      return;
    }

    const body = await readRequestBody(request);
    const rawLead = JSON.parse(body || "{}");

    if (rawLead.website) {
      sendJson(response, 200, { ok: true });
      return;
    }

    const lead = sanitizeLead(rawLead);
    const phoneDigits = String(lead.phone || "").replace(/\D/g, "");

    if (phoneDigits.length < 8) {
      sendJson(response, 400, { ok: false, message: "Valid phone is required" });
      return;
    }

    await saveLead(lead);
    sendJson(response, 200, { ok: true });
  } catch (error) {
    sendJson(response, 400, { ok: false, message: "Invalid request" });
  }
}

function extractTextFromOpenAI(payload) {
  if (payload.output_text) return payload.output_text;
  const chunks = [];
  for (const item of payload.output || []) {
    for (const content of item.content || []) {
      if (content.text) chunks.push(content.text);
    }
  }
  return chunks.join("\n").trim();
}

function extractLeadFromMessage(message) {
  const phoneMatch = String(message).match(/\+?\d[\d\s()-]{7,}\d/);
  const phone = phoneMatch ? phoneMatch[0].trim() : "";
  if (!phone) return null;
  return {
    name: "",
    phone,
    comment: `AI chat lead: ${String(message).slice(0, 450)}`,
    source: "ai-chat",
  };
}

function fallbackAiReply(message, lang) {
  const isRu = lang === "ru" || /[а-яё]/i.test(message);
  const extractedLead = extractLeadFromMessage(message);
  const answer = isRu
    ? "Я AI-консультант TEHNOFASAD. Могу помочь с сэндвич-панелями, кровлей, водостоками и расчетом через 3D-конфигуратор. Для точной цены напишите материал, количество м2, город и телефон."
    : "Sunt consultantul AI TEHNOFASAD. Va pot ajuta cu panouri sandwich, acoperisuri, sisteme pluviale si calcul prin configuratorul 3D. Pentru pret exact trimiteti materialul, cantitatea m2, localitatea si telefonul.";
  return { answer, lead: extractedLead };
}

function parseAiJson(text) {
  try {
    return JSON.parse(text);
  } catch (error) {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch (nestedError) {
      return null;
    }
  }
}

async function callOpenAiAgent(messages, lang) {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL || "gpt-5.2";
  const lastMessage = messages[messages.length - 1]?.content || "";

  if (!apiKey) {
    return fallbackAiReply(lastMessage, lang);
  }

  const systemPrompt = [
    "You are TEHNOFASAD AI, a website sales assistant for a Moldova company.",
    "Reply in the user's language: Russian or Romanian.",
    "Company: TEHNOFASAD S.R.L.",
    "Phone: +373 791 55 791. Email: info@tehnofasad.md. Address: mun. Balti, str. Lev Dovator 1.",
    "Products: sandwich panels, wall sandwich panels, roof sandwich panels, metal tile, modular metal tile, bituminous shingles, profiled sheet, drainage systems, roof accessories.",
    "Do not invent exact stock or final prices. Say a specialist will confirm availability and price.",
    "If the user wants an order, collect name, phone, material, quantity, city, comment.",
    "Return ONLY JSON with keys: answer string, lead object or null.",
    "lead fields: name, phone, email, material, quantity, location, comment, source. Set source to ai-chat.",
    "Create lead only when a phone number is present and the user asks for price/order/callback.",
  ].join("\n");

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      input: [
        { role: "system", content: systemPrompt },
        ...messages.slice(-10).map((message) => ({
          role: message.role === "assistant" ? "assistant" : "user",
          content: String(message.content || "").slice(0, 1200),
        })),
      ],
      max_output_tokens: 650,
    }),
  });

  if (!response.ok) {
    return fallbackAiReply(lastMessage, lang);
  }

  const payload = await response.json();
  const text = extractTextFromOpenAI(payload);
  const parsed = parseAiJson(text);

  if (!parsed || !parsed.answer) {
    return { answer: text || fallbackAiReply(lastMessage, lang).answer, lead: null };
  }

  return { answer: String(parsed.answer).slice(0, 1200), lead: parsed.lead || null };
}

async function handleAiChat(request, response) {
  try {
    const clientIp = request.headers["x-forwarded-for"]?.split(",")[0]?.trim() || request.socket.remoteAddress;
    if (isRateLimited(`ai:${clientIp}`)) {
      sendJson(response, 429, { ok: false, message: "Too many requests. Try again later." });
      return;
    }

    if (!String(request.headers["content-type"] || "").includes("application/json")) {
      sendJson(response, 415, { ok: false, message: "JSON content type required" });
      return;
    }

    const body = await readRequestBody(request);
    const raw = JSON.parse(body || "{}");
    const messages = Array.isArray(raw.messages) ? raw.messages : [];
    const lang = raw.lang === "ru" ? "ru" : "ro";

    if (!messages.length) {
      sendJson(response, 400, { ok: false, message: "Message is required" });
      return;
    }

    const aiResult = await callOpenAiAgent(messages, lang);
    const lastMessage = messages[messages.length - 1]?.content || "";
    aiResult.lead = aiResult.lead || extractLeadFromMessage(lastMessage);
    let leadCreated = false;

    if (aiResult.lead) {
      const phoneDigits = String(aiResult.lead.phone || "").replace(/\D/g, "");
      if (phoneDigits.length >= 8) {
        await saveLead({ ...aiResult.lead, source: "ai-chat" });
        leadCreated = true;
      }
    }

    sendJson(response, 200, { ok: true, answer: aiResult.answer, leadCreated });
  } catch (error) {
    sendJson(response, 400, { ok: false, message: "Invalid AI chat request" });
  }
}

function serveStatic(request, response) {
  const requestUrl = new URL(request.url, `http://${request.headers.host}`);
  const pathname = decodeURIComponent(requestUrl.pathname);
  const safePath = path.normalize(pathname).replace(/^[/\\]+/, "").replace(/^(\.\.[/\\])+/, "");
  const filePath = path.resolve(PUBLIC_DIR, safePath || "index.html");
  const relativePath = path.relative(PUBLIC_DIR, filePath);

  if (
    relativePath.startsWith("..") ||
    path.isAbsolute(relativePath) ||
    /^(data|\.git|\.idea)([/\\]|$)/.test(relativePath) ||
    /^\.env($|\.)/.test(relativePath) ||
    ["server.js", "package.json", "package-lock.json"].includes(relativePath)
  ) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      const notFoundPath = path.join(PUBLIC_DIR, "404.html");
      fs.readFile(notFoundPath, (notFoundError, notFoundContent) => {
        if (notFoundError) {
          response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
          response.end("Not found");
        } else {
          response.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
          response.end(request.method === "HEAD" ? undefined : notFoundContent);
        }
      });
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || "application/octet-stream";
    const headers = { "Content-Type": contentType };

    if ([".png", ".jpg", ".jpeg", ".svg", ".ico"].includes(ext)) {
      headers["Cache-Control"] = "public, max-age=604800";
    }

    const isTextType = contentType.startsWith("text/") || contentType.includes("javascript") || contentType.includes("json") || contentType.includes("xml");
    const acceptEncoding = String(request.headers["accept-encoding"] || "");

    if (isTextType && acceptEncoding.includes("gzip") && content.length > 1024) {
      headers["Content-Encoding"] = "gzip";
      headers["Vary"] = "Accept-Encoding";
      zlib.gzip(content, (gzipError, compressed) => {
        if (gzipError) {
          delete headers["Content-Encoding"];
          delete headers["Vary"];
          response.writeHead(200, headers);
          response.end(request.method === "HEAD" ? undefined : content);
        } else {
          response.writeHead(200, headers);
          response.end(request.method === "HEAD" ? undefined : compressed);
        }
      });
      return;
    }

    response.writeHead(200, headers);
    response.end(request.method === "HEAD" ? undefined : content);
  });
}

const server = http.createServer((request, response) => {
  setSecurityHeaders(response);

  const requestUrl = new URL(request.url, `http://${request.headers.host}`);

  if (request.method === "GET" && requestUrl.pathname === "/health") {
    sendJson(response, 200, { ok: true });
    return;
  }

  if (request.method === "POST" && requestUrl.pathname === "/api/leads") {
    handleLead(request, response);
    return;
  }

  if (request.method === "POST" && requestUrl.pathname === "/api/ai-chat") {
    handleAiChat(request, response);
    return;
  }

  if (request.method === "GET" || request.method === "HEAD") {
    serveStatic(request, response);
    return;
  }

  response.writeHead(405, { "Content-Type": "text/plain; charset=utf-8" });
  response.end("Method not allowed");
});

server.listen(PORT, () => {
  console.log(`TEHNOFASAD server running at http://localhost:${PORT}`);
});
