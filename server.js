const http = require("http");
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const zlib = require("zlib");

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = __dirname;
const DATA_DIR = process.env.VERCEL ? path.join("/tmp", "tehnofasad-data") : path.join(__dirname, "data");
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

async function appendLeadLog(fileName, payload) {
  try {
    await fsp.mkdir(DATA_DIR, { recursive: true });
    await fsp.appendFile(path.join(DATA_DIR, fileName), `${JSON.stringify(payload)}\n`, "utf8");
  } catch (error) {
    console.error(`Lead log write failed: ${error.message}`);
  }
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
  await appendLeadLog("leads.jsonl", lead);

  try {
    const crmResult = await sendLeadToBitrix24(lead);
    if (!crmResult.skipped) {
      await appendLeadLog("crm-sync.jsonl", { createdAt: new Date().toISOString(), leadPhone: lead.phone || "", result: crmResult });
    }
  } catch (error) {
    await appendLeadLog("crm-errors.jsonl", { createdAt: new Date().toISOString(), leadPhone: lead.phone || "", error: error.message });
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
  const text = String(message || "");
  const lower = text.toLowerCase();
  const phoneMatch = text.match(/\+?\d[\d\s()-]{7,}\d/);
  const phone = phoneMatch ? phoneMatch[0].trim() : "";
  if (!phone) return null;

  const emailMatch = text.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i);
  const quantityMatch = text.match(/(\d+(?:[.,]\d+)?)\s*(m2|m²|м2|м²|mp|m\.p\.|метр|metri)/i);
  const thicknessMatch = text.match(/(\d{2,3})\s*(mm|мм|milimetri)/i);
  const knownLocationMatch = text.match(/\b(Chisinau|Chișinău|Кишинев|Кишинёв|Balti|Bălți|Бельцы|Orhei|Оргеев|Ungheni|Унгены|Cahul|Кагул|Soroca|Сороки|Edinet|Единец)\b/i);
  const locationPhraseMatch = text.match(/(?:город|localitate|localitatea|oras|oraș|in|în|в)\s+([A-Za-zА-Яа-яЁёĂăÂâÎîȘșȚț -]{3,40})/i);
  const nameMatch = text.match(/(?:меня зовут|я\s+|numele meu este|ma numesc|mă numesc|nume)\s+([A-Za-zА-Яа-яЁёĂăÂâÎîȘșȚț -]{2,40})/i);

  let material = "";
  if (/sandwich|сэндвич|panou|panouri|панел/i.test(lower)) material = "sandwich panels";
  if (/acoperis|acoperiș|кры|roof/i.test(lower)) material = material ? `${material}, roof` : "roof";
  if (/perete|стен|wall/i.test(lower)) material = material ? `${material}, wall` : "wall";
  if (/tigla|țigl|черепиц|metal tile/i.test(lower)) material = "metal tile";

  return {
    name: nameMatch ? nameMatch[1].trim() : "",
    phone,
    email: emailMatch ? emailMatch[0] : "",
    material,
    quantity: quantityMatch ? `${quantityMatch[1]} ${quantityMatch[2]}` : "",
    thickness: thicknessMatch ? `${thicknessMatch[1]} ${thicknessMatch[2]}` : "",
    location: knownLocationMatch ? knownLocationMatch[0] : (locationPhraseMatch ? locationPhraseMatch[1].trim() : ""),
    comment: `AI chat lead: ${text.slice(0, 450)}`,
    source: "ai-chat",
  };
}

function fallbackAiReply(message, lang) {
  const text = String(message || "");
  const isRu = lang === "ru" || /[а-яё]/i.test(text);
  const extractedLead = extractLeadFromMessage(message);
  const wantsOffer = /(цена|стоим|заказ|заявк|позвон|оферт|pret|oferta|comand|sunati|apel|calcul)/i.test(text);
  let answer;

  if (extractedLead && wantsOffer) {
    answer = isRu
      ? "Принял данные для заявки. Специалист TEHNOFASAD проверит наличие, уточнит параметры и свяжется с вами. Если есть возможность, допишите тип панели, толщину, количество м2 и город."
      : "Am preluat datele pentru cerere. Specialistul TEHNOFASAD va verifica disponibilitatea, va confirma parametrii si va va contacta. Daca puteti, scrieti tipul panoului, grosimea, cantitatea m2 si localitatea.";
  } else {
    answer = isRu
      ? "Я AI-консультант TEHNOFASAD. Помогаю выбрать сэндвич-панели, кровельные материалы, водостоки и подготовить заявку. Для точного предложения напишите: тип материала, толщина, количество м2, город и телефон."
      : "Sunt consultantul AI TEHNOFASAD. Va ajut sa alegeti panouri sandwich, materiale pentru acoperis, sisteme pluviale si sa pregatim cererea. Pentru oferta exacta scrieti: tipul materialului, grosimea, cantitatea m2, localitatea si telefonul.";
  }

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
    "You are TEHNOFASAD AI Manager, a senior sales manager and technical consultant for a Moldova construction-materials company.",
    "Primary goal: manage the conversation like a real sales manager: greet, qualify the need, ask the next useful question, collect buying details, create a clean CRM lead, and hand off to a human specialist.",
    "Reply in the user's language. Use Russian for Cyrillic/Russian messages and Romanian for Romanian messages.",
    "Company facts: TEHNOFASAD S.R.L.; phone +373 791 55 791; email info@tehnofasad.md; address mun. Balti, str. Lev Dovator 1; website tehnofasad.md.",
    "Products: sandwich panels for walls, sandwich panels for roofs, metal tile, modular metal tile, bituminous shingles, profiled sheet, drainage systems, roof accessories.",
    "Strong consultation rules:",
    "- For sandwich panels, ask/track purpose, panel type wall/roof, thickness, quantity in m2, color if mentioned, city, pickup/delivery, phone.",
    "- For roofs, ask/track roof type, roof area or dimensions, material, drainage, city, phone. Mention that the 3D configurator can estimate roof area and drainage length.",
    "- For price, stock, delivery, callback, order, reservation: collect phone and order parameters, then create a lead.",
    "- Never invent exact prices, stock quantities, delivery price or final deadlines. Say a specialist confirms by real stock and parameters.",
    "- Keep answers short, practical and sales-focused: 2-5 sentences unless the user asks for details.",
    "- Always end with one clear next step or one targeted question. Avoid generic endings.",
    "- If data is missing, ask for the next 1-3 most important missing fields, not a long questionnaire.",
    "- Act like an account manager: summarize what is already known, then ask only what is missing.",
    "- When enough information exists except phone, ask for phone to create the CRM request.",
    "- If the user already gave phone plus a buying intent, confirm that the request was accepted and say a specialist will contact them.",
    "Return ONLY valid JSON, no markdown, no prose outside JSON.",
    "JSON shape: {\"answer\":\"string\",\"lead\":null or {\"name\":\"\",\"phone\":\"\",\"email\":\"\",\"material\":\"\",\"quantity\":\"\",\"thickness\":\"\",\"location\":\"\",\"comment\":\"\",\"source\":\"ai-chat\"}}.",
    "Create lead only when phone is present and the user asks for price, order, stock check, delivery, callback, reservation or calculation.",
    "If there is no phone, lead must be null and answer should ask for phone only if the user wants an offer/order/callback.",
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
    return fallbackAiReply(lastMessage, lang);
  }

  const fallbackLead = extractLeadFromMessage(lastMessage);
  const lead = parsed.lead && parsed.lead.phone ? parsed.lead : fallbackLead;

  return { answer: String(parsed.answer).slice(0, 1200), lead: lead || null };
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

function handleRequest(request, response) {
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
}

if (require.main === module) {
  const server = http.createServer(handleRequest);

  server.listen(PORT, () => {
    console.log(`TEHNOFASAD server running at http://localhost:${PORT}`);
  });
}

module.exports = handleRequest;
