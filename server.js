const http = require("http");
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const zlib = require("zlib");
const crypto = require("crypto");

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

function buildTeamsaleLeadPayload(lead) {
  const payload = {
    title: lead.product ? `TEHNOFASAD: ${lead.product}` : "TEHNOFASAD: solicitare de pe site",
    name: lead.name || "Client Website",
    phone: lead.phone || "",
    email: lead.email || "",
    comment: buildLeadComment(lead),
    source: process.env.TEAMSALE_SOURCE_ID || lead.source || "WEB",
    city: lead.location || "",
    website: "https://tehnofasad.md/"
  };

  const extraFields = toArray(process.env.TEAMSALE_EXTRA_FIELDS);
  extraFields.forEach((entry) => {
    const separatorIndex = entry.indexOf(":");
    if (separatorIndex > 0) {
      const key = entry.slice(0, separatorIndex).trim();
      const value = entry.slice(separatorIndex + 1).trim();
      if (key && value) payload[key] = value;
    }
  });

  return payload;
}

function generateZadarmaAuth(urlPath, params, key, secret) {
  const sortedKeys = Object.keys(params).sort();
  const sortedParams = {};
  for (const k of sortedKeys) {
    sortedParams[k] = params[k];
  }
  
  // Create x-www-form-urlencoded query string
  const queryString = new URLSearchParams(sortedParams).toString();
  const md5hash = crypto.createHash("md5").update(queryString).digest("hex");
  const dataToSign = urlPath + queryString + md5hash;
  const hmac = crypto.createHmac("sha1", secret).update(dataToSign).digest("base64");
  
  return {
    authHeader: `${key}:${hmac}`,
    queryString: queryString
  };
}

async function sendLeadToTeamsale(lead) {
  const webhookUrl = String(process.env.TEAMSALE_WEBHOOK_URL || "").trim();
  const zadarmaKey = String(process.env.ZADARMA_KEY || "").trim();
  const zadarmaSecret = String(process.env.ZADARMA_SECRET || "").trim();

  if (!webhookUrl) {
    return { skipped: true, reason: "TEAMSALE_WEBHOOK_URL is not configured" };
  }

  const payload = buildTeamsaleLeadPayload(lead);
  let headers = { "Content-Type": "application/json" };
  let body = JSON.stringify(payload);

  if (zadarmaKey && zadarmaSecret) {
    try {
      const urlObj = new URL(webhookUrl);
      const urlPath = urlObj.pathname;
      const authData = generateZadarmaAuth(urlPath, payload, zadarmaKey, zadarmaSecret);
      headers["Authorization"] = authData.authHeader;
      headers["Content-Type"] = "application/x-www-form-urlencoded";
      body = authData.queryString;
    } catch (e) {
      console.error("Error generating Zadarma auth:", e);
    }
  }

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers,
    body,
  });

  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch (error) {
    data = { raw: text };
  }

  if (!response.ok || (data.status && data.status !== "success" && data.status !== "ok")) {
    throw new Error(`Teamsale CRM error: ${JSON.stringify(data).slice(0, 500)}`);
  }

  return { ok: true, response: data };
}

async function saveLead(rawLead) {
  const lead = sanitizeLead(rawLead);
  await appendLeadLog("leads.jsonl", lead);

  try {
    const crmResult = await sendLeadToTeamsale(lead);
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

function parseNumber(value) {
  return Number(String(value || "").replace(",", "."));
}

const AI_PRICE_RATES_MDL = {
  wall: { 40: 180, 50: 180, 60: 220, 80: 240, 100: 290 },
  roof: { 40: 200, 50: 200, 60: 230, 80: 260, 100: 290 },
  metalTile: 120,
  profiledSheet: 90,
};

function nearestRate(rateMap, thickness) {
  if (!thickness) return null;
  const keys = Object.keys(rateMap).map(Number).sort((a, b) => a - b);
  const nearest = keys.reduce((best, current) => {
    return Math.abs(current - thickness) < Math.abs(best - thickness) ? current : best;
  }, keys[0]);
  return rateMap[nearest];
}

function formatMdlRange(range) {
  if (!range) return "";
  return `${range.min.toLocaleString("ro-MD")}-${range.max.toLocaleString("ro-MD")} MDL`;
}

function getPriceRangeMdl(area, analysis = {}) {
  const envMin = Number(process.env.PANEL_PRICE_MIN_MDL_M2 || 0);
  const envMax = Number(process.env.PANEL_PRICE_MAX_MDL_M2 || 0);
  if (area && envMin && envMax && envMax >= envMin) {
    return {
      min: Math.round(area * envMin),
      max: Math.round(area * envMax),
      note: `${envMin}-${envMax} MDL/m2 env range`,
    };
  }

  let base = 0;
  if (analysis.materialIntent === "metal tile") {
    base = Number(area || 0) * AI_PRICE_RATES_MDL.metalTile;
  } else if (analysis.materialIntent === "profiled sheet") {
    base = Number(area || 0) * AI_PRICE_RATES_MDL.profiledSheet;
  } else if (analysis.wallArea && analysis.roofArea) {
    const wallRate = nearestRate(AI_PRICE_RATES_MDL.wall, analysis.thicknessValue) || AI_PRICE_RATES_MDL.wall[80];
    const roofRate = nearestRate(AI_PRICE_RATES_MDL.roof, analysis.thicknessValue) || AI_PRICE_RATES_MDL.roof[80];
    base = analysis.wallArea * wallRate + analysis.roofArea * roofRate;
  } else if (area) {
    const rateMap = analysis.materialIntent === "sandwich panels" && analysis.roofArea === analysis.calculatedArea
      ? AI_PRICE_RATES_MDL.roof
      : AI_PRICE_RATES_MDL.wall;
    base = area * (nearestRate(rateMap, analysis.thicknessValue) || rateMap[80]);
  }

  if (!base) return null;
  return {
    min: Math.round(base * 0.85),
    max: Math.round(base * 1.15),
    note: "preliminary calculator range, +/-15%",
  };
}

function buildManagerContext(message) {
  const analysis = analyzeProjectMessage(message);
  const priceRange = getPriceRangeMdl(analysis.calculatedArea, analysis);
  const parts = [];

  if (analysis.objectType) parts.push(`object_type=${analysis.objectType}`);
  if (analysis.dimensions) parts.push(`dimensions=${analysis.dimensions}`);
  if (analysis.roofArea) parts.push(`roof_area_m2_with_15_percent_reserve=${analysis.roofArea}`);
  if (analysis.wallArea) parts.push(`wall_area_m2=${analysis.wallArea}`);
  if (analysis.totalArea) parts.push(`total_panels_area_m2=${analysis.totalArea}`);
  if (analysis.calculatedArea) parts.push(`suggested_area_m2=${analysis.calculatedArea}`);
  if (analysis.thickness) parts.push(`thickness=${analysis.thickness}`);
  if (priceRange) parts.push(`optional_price_range_mdl=${priceRange.min}-${priceRange.max}`);
  if (analysis.assumptions.length) parts.push(`assumptions=${analysis.assumptions.join("; ")}`);
  if (analysis.missing.length) parts.push(`missing=${analysis.missing.join(", ")}`);

  return {
    analysis,
    priceRange,
    text: parts.length ? `Manager calculator context: ${parts.join(" | ")}` : "",
  };
}

function buildAiCrmData(lead, managerContext) {
  if (!lead) return null;
  const analysis = managerContext?.analysis || {};
  const priceRange = managerContext?.priceRange;
  return {
    name: lead.name || "",
    phone: lead.phone || "",
    object: analysis.objectType || lead.material || "",
    area_m2: analysis.calculatedArea || "",
    thickness: lead.thickness || analysis.thickness || "",
    logistics: lead.location ? `delivery/pickup: ${lead.location}` : "",
    estimate_mdl: formatMdlRange(priceRange),
  };
}

function fallbackAiReply(message, lang) {
  const text = String(message || "");
  const isRu = lang === "ru" || /[а-яё]/i.test(text);
  const extractedLead = extractLeadFromMessage(message);
  const wantsOffer = /(цена|стоим|заказ|заявк|позвон|оферт|pret|oferta|comand|sunati|apel|calcul|расчет|расчёт)/i.test(text);
  const managerContext = buildManagerContext(text);
  const area = managerContext.analysis.calculatedArea;
  const range = formatMdlRange(managerContext.priceRange);

  if (area) {
    const analysis = managerContext.analysis;
    const details = analysis.wallArea && analysis.roofArea
      ? (isRu
        ? `Стены около ${analysis.wallArea} м2, крыша с запасом 15% около ${analysis.roofArea} м2, всего примерно ${area} м2.`
        : `Pereti aproximativ ${analysis.wallArea} m2, acoperis cu rezerva 15% aproximativ ${analysis.roofArea} m2, total aproximativ ${area} m2.`)
      : (isRu ? `Предварительная площадь около ${area} м2.` : `Suprafata preliminara este aproximativ ${area} m2.`);
    const estimate = range
      ? (isRu ? ` Ориентир по материалу: ${range}.` : ` Orientativ material: ${range}.`)
      : "";
    const question = isRu
      ? "Напишите толщину панели, город и телефон, чтобы я создал заявку для менеджера."
      : "Scrieti grosimea panoului, localitatea si telefonul ca sa creez cererea pentru manager.";
    return { answer: `${details}${estimate} ${question}`, lead: extractedLead, crmData: buildAiCrmData(extractedLead, managerContext) };
  }

  if (extractedLead && wantsOffer) {
    const answer = isRu
      ? "Принял данные для заявки. Специалист TEHNOFASAD проверит наличие, уточнит параметры и свяжется с вами."
      : "Am preluat datele pentru cerere. Specialistul TEHNOFASAD va verifica disponibilitatea, va confirma parametrii si va va contacta.";
    return { answer, lead: extractedLead, crmData: buildAiCrmData(extractedLead, managerContext) };
  }

  let specificProductMsg = "";
  if (extractedLead?.material?.includes("roof")) {
    specificProductMsg = isRu ? "Для расчета крыши вы можете использовать наш 3D конфигуратор на сайте. " : "Pentru calculul acoperisului puteti utiliza configuratorul nostru 3D de pe site. ";
  } else if (extractedLead?.material?.includes("wall")) {
    specificProductMsg = isRu ? "Для стеновых панелей важна толщина (от 40 до 100 мм). " : "Pentru panourile de perete este importanta grosimea (intre 40 si 100 mm). ";
  }

  return {
    answer: isRu
      ? `${specificProductMsg}Я AI-менеджер TEHNOFASAD. Напишите тип объекта и размеры, например: ангар 20x40, панели 100 мм.`
      : `${specificProductMsg}Sunt AI manager TEHNOFASAD. Scrieti tipul obiectului si dimensiunile, de exemplu: hala 20x40, panouri 100 mm.`,
    lead: extractedLead,
    crmData: buildAiCrmData(extractedLead, managerContext),
  };
}

function extractLeadFromMessage(message) {
  const text = String(message || "");
  const lower = text.toLowerCase();
  const phoneMatch = text.match(/\+?\d[\d\s()-]{7,}\d/);
  const phone = phoneMatch ? phoneMatch[0].trim() : "";
  if (!phone) return null;

  const emailMatch = text.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i);
  const quantityMatch = text.match(/(\d+(?:[.,]\d+)?)\s*(m2|m²|м2|м²|mp|m\.p\.|метр|metri|ml|мл|buc|шт)/i);
  const thicknessMatch = text.match(/(\d{2,3})\s*(mm|\u043c\u043c|milimetri)/i);
  const knownLocationMatch = text.match(/\b(Chisinau|Chișinău|\u041a\u0438\u0448\u0438\u043d\u0435\u0432|\u041a\u0438\u0448\u0438\u043d\u0451\u0432|Balti|Bălți|\u0411\u0435\u043b\u044c\u0446\u044b|Orhei|\u041e\u0440\u0433\u0435\u0435\u0432|Ungheni|\u0423\u043d\u0433\u0435\u043d\u044b|Cahul|\u041a\u0430\u0433\u0443\u043b|Soroca|\u0421\u043e\u0440\u043e\u043a\u0438|Edinet|\u0415\u0434\u0438\u043d\u0435\u0446|Comrat|\u041a\u043e\u043c\u0440\u0430\u0442|Ceadir-Lunga|Drochia|\u0414\u0440\u043e\u043a\u0438\u044f|Floresti|Hincesti|Ialoveni|Nisporeni|Rezina|Riscani|Singerei|Straseni|Taraclia|Telenesti|Causeni|\u041a\u0430\u0443\u0448\u0430\u043d\u044b|Cimislia|Criuleni|Dubasari|Falesti|Glodeni|Leova|Ocnita|Stefan Voda|Soldanesti|Briceni|Donduseni|Cantemir|Anenii Noi)\b/i);
  const locationPhraseMatch = text.match(/(?:\u0433\u043e\u0440\u043e\u0434|localitate|localitatea|oras|oraș|in|în|\u0432|din|город)\s+([A-Za-z\u0400-\u04ffĂăÂâÎîȘșȚț -]{3,40})/i);
  const nameMatch = text.match(/(?:\u043c\u0435\u043d\u044f \u0437\u043e\u0432\u0443\u0442|\u044f\s+|numele meu este|ma numesc|mă numesc|nume)\s+([A-Za-z\u0400-\u04ffĂăÂâÎîȘșȚț -]{2,40})/i);
  const colorMatch = text.match(/RAL\s*(\d{4})/i) || text.match(/\b(rosu|roșu|alb|verde|albastru|gri|maro|negru|bej|красн|бел|зелен|син|сер|коричнев|черн|бежев)\w*/i);

  let material = "";
  if (/sandwich|\u0441\u044d\u043d\u0434\u0432\u0438\u0447|panou|panouri|\u043f\u0430\u043d\u0435\u043b/i.test(lower)) material = "sandwich panels";
  if (/acoperis|acoperiș|\u043a\u0440\u044b|roof/i.test(lower)) material = material ? `${material}, roof` : "roof";
  if (/perete|\u0441\u0442\u0435\u043d|wall/i.test(lower)) material = material ? `${material}, wall` : "wall";
  if (/tigla metalica modulara|модульная металлочерепица/i.test(lower)) material = "modular metal tile";
  else if (/tigla bituminoasa|битумная черепица|шинглас|shingles/i.test(lower)) material = "bituminous shingles";
  else if (/tigla|țigl|\u0447\u0435\u0440\u0435\u043f\u0438\u0446|metal tile/i.test(lower)) material = "metal tile";
  if (/sistem pluvia|водосточ|jgheab|желоб|burlan|труб.*водосток|drainage/i.test(lower)) material = material ? `${material}, drainage` : "drainage system";
  if (/tabla profil|tablă profil|профнастил|профлист|profiled sheet/i.test(lower)) material = material ? `${material}, profiled sheet` : "profiled sheet";
  if (/gard|забор|împrejmuire|ограждени/i.test(lower)) material = material ? `${material}, fence` : "fence/profiled sheet";

  return {
    name: nameMatch ? nameMatch[1].trim() : "",
    phone,
    email: emailMatch ? emailMatch[0] : "",
    material,
    quantity: quantityMatch ? `${quantityMatch[1]} ${quantityMatch[2]}` : "",
    thickness: thicknessMatch ? `${thicknessMatch[1]} ${thicknessMatch[2]}` : "",
    color: colorMatch ? colorMatch[0] : "",
    location: knownLocationMatch ? knownLocationMatch[0] : (locationPhraseMatch ? locationPhraseMatch[1].trim() : ""),
    comment: `AI chat lead: ${text.slice(0, 450)}`,
    source: "ai-chat",
  };
}

function analyzeProjectMessage(message) {
  const text = String(message || "");
  const lower = text.toLowerCase();
  const dimensionsMatch = text.match(/(\d+(?:[.,]\d+)?)\s*[x\u0445\u00d7]\s*(\d+(?:[.,]\d+)?)(?:\s*[x\u0445\u00d7]\s*(\d+(?:[.,]\d+)?))?/i);
  const explicitAreaMatch = text.match(/(\d+(?:[.,]\d+)?)\s*(m2|m²|м2|м²|mp|m\.p\.)/i);
  const thicknessMatch = text.match(/(\d{2,3})\s*(mm|\u043c\u043c|milimetri)/i);
  const hasPhone = /\+?\d[\d\s()-]{7,}\d/.test(text);
  const isHall = /(hala|hală|angar|hangar|depozit|\u0430\u043d\u0433\u0430\u0440|\u0441\u043a\u043b\u0430\u0434)/i.test(lower);
  const isHouse = /(casa|casă|house|\u0434\u043e\u043c)/i.test(lower);
  const isGarage = /(garaj|\u0433\u0430\u0440\u0430\u0436)/i.test(lower);
  const isRoof = /(roof|acoperis|acoperiș|\u043a\u0440\u044b|\u043a\u0440\u043e\u0432)/i.test(lower);
  const isWall = /(wall|perete|\u0441\u0442\u0435\u043d|\u0444\u0430\u0441\u0430\u0434)/i.test(lower);
  const isMetalTile = /(tigla|țigl|\u0447\u0435\u0440\u0435\u043f\u0438\u0446|metal tile)/i.test(lower);
  const isProfiledSheet = /(tabla profil|tablă profil|\u043f\u0440\u043e\u0444\u043d\u0430\u0441\u0442\u0438\u043b|\u043f\u0440\u043e\u0444\u043b\u0438\u0441\u0442|profiled sheet)/i.test(lower);
  const result = {
    objectType: "",
    dimensions: "",
    length: null,
    width: null,
    height: null,
    explicitArea: explicitAreaMatch ? parseNumber(explicitAreaMatch[1]) : null,
    calculatedArea: null,
    wallArea: null,
    roofArea: null,
    totalArea: null,
    thicknessValue: thicknessMatch ? Number(thicknessMatch[1]) : null,
    thickness: thicknessMatch ? `${thicknessMatch[1]} ${thicknessMatch[2]}` : "",
    materialIntent: isMetalTile ? "metal tile" : (isProfiledSheet ? "profiled sheet" : "sandwich panels"),
    assumptions: [],
    missing: [],
  };

  if (isHall) result.objectType = "industrial/agricultural hall";
  if (isHouse) result.objectType = "house";
  if (isGarage) result.objectType = "garage";

  if (dimensionsMatch) {
    result.length = parseNumber(dimensionsMatch[1]);
    result.width = parseNumber(dimensionsMatch[2]);
    result.height = dimensionsMatch[3] ? parseNumber(dimensionsMatch[3]) : null;
    result.dimensions = dimensionsMatch[0];

    const effectiveHeight = result.height || (isHall ? 6 : null);
    result.roofArea = Math.round(result.length * result.width * 1.15);

    if (effectiveHeight) {
      result.wallArea = Math.round(2 * (result.length + result.width) * effectiveHeight);
      if (!result.height) result.assumptions.push("wall height assumed at 6 m for preliminary hall estimate");
    }

    if (isRoof && !isWall) {
      result.calculatedArea = result.roofArea;
    } else if (isWall && !isRoof && result.wallArea) {
      result.calculatedArea = result.wallArea;
    } else if (result.wallArea && result.roofArea && isHall) {
      result.totalArea = result.wallArea + result.roofArea;
      result.calculatedArea = result.totalArea;
    } else {
      result.calculatedArea = result.roofArea;
      result.assumptions.push("dimensions treated as roof/plan area with 15% reserve");
    }
  }

  if (!result.calculatedArea && result.explicitArea) {
    result.calculatedArea = Math.round(result.explicitArea);
  }

  if (result.length && result.width && !result.height && (isWall || isHall)) {
    result.missing.push("confirm wall height");
  }

  if (!result.thickness && (result.materialIntent === "sandwich panels")) result.missing.push("panel thickness");
  if (!hasPhone) result.missing.push("phone");

  return result;
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

async function callOpenAiAgent(messages, lang, accumulatedLead) {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL || "gpt-5.2";
  const lastMessage = messages[messages.length - 1]?.content || "";
  const managerContext = buildManagerContext(lastMessage);

  if (!apiKey) {
    return fallbackAiReply(lastMessage, lang);
  }

  const systemPrompt = [
    "You are TEHNOFASAD AI Manager, a senior sales manager and technical consultant for a Moldova construction-materials company.",
    "Primary goal: manage the conversation like a real sales manager: greet, qualify the need, ask the next useful question, collect buying details, create a clean CRM lead, and hand off to a human specialist.",
    "Reply in the user's language. Use Russian for Cyrillic/Russian messages and Romanian for Romanian messages.",
    "",
    "=== COMPANY ===",
    "TEHNOFASAD S.R.L.; phone +373 791 55 791; email info@tehnofasad.md; address mun. Balti, str. Lev Dovator 1; website tehnofasad.md.",
    "Working hours: Mon-Fri 08:00-17:00, Sat 09:00-14:00.",
    "",
    "=== FULL PRODUCT CATALOG ===",
    "1. Sandwich panels for WALLS — thickness 40/50/60/80/100 mm, mineral wool or PIR core, width 1000-1200 mm, length cut to order up to 12 m. For halls, warehouses, cold rooms, commercial buildings.",
    "2. Sandwich panels for ROOFS — thickness 40/50/60/80/100 mm, trapezoidal profile, slope min 7 degrees. For industrial and commercial roofing.",
    "3. Metal tile (tigla metalica) — 0.45-0.5 mm steel, polyester coating, various profiles (Monterrey, Cascade). For residential roofs.",
    "4. Modular metal tile (tigla metalica modulara) — individual sheets ~1.2x0.7 m, easier transport and handling, same profiles as classic.",
    "5. Bituminous shingles (tigla bituminoasa) — flexible roofing for complex geometries, mansards, residential.",
    "6. Profiled sheet (tabla profilata) — C8/C10/C18/C21/HC35/HC44 profiles, for roofs, fences, facades, technical enclosures.",
    "7. Drainage systems (sisteme pluviale) — gutters 125/150 mm, downpipes 87/100 mm, all fittings, metal or PVC.",
    "8. Roof accessories — ridge caps, wind bars, valley trays, snow guards, fasteners, sealing tapes, under-roof membranes.",
    "",
    "=== AREA CALCULATION RULES ===",
    "- Hall LxW: roof area = L*W*1.15 (15% reserve for overlaps/waste).",
    "- Hall LxWxH: wall area = 2*(L+W)*H; total = wall + roof.",
    "- If height not given for a hall, assume 6 m preliminary, but ASK to confirm.",
    "- House roof: use the 3D configurator on the website for accurate calculation (section '3D acoperis').",
    "- Fence: length in meters * fence height (usually 1.5-2.0 m).",
    "",
    "=== PRICING GUIDANCE ===",
    "- Do NOT invent exact prices, stock quantities, delivery cost, or deadlines.",
    "- When the calculator provides optional_price_range_mdl, share it as 'approximate material range' and note that the specialist will confirm by real stock.",
    "- For materials without calculator data, say 'the specialist will calculate based on current stock prices'.",
    "",
    "=== SALES FLOW ===",
    "- Qualify the client in 3-5 messages. Give useful value first (area calculation, product suggestion), then collect phone.",
    "- Keep answers 2-3 sentences unless the user asks for details.",
    "- Always end with one clear next step or one targeted question.",
    "- If data is missing, ask for the next 1-2 most important fields, not a long questionnaire.",
    "- Act like an account manager: summarize what is already known, then ask only what is missing.",
    "- When enough info exists except phone, ask for phone to create the CRM request.",
    "- If the user already gave phone + buying intent, confirm the request is accepted and a specialist will contact them.",
    "- Mention the 3D roof configurator when relevant (roof projects, area questions).",
    "",
    "=== JSON OUTPUT ===",
    "Return ONLY valid JSON, no markdown, no prose outside JSON.",
    "JSON shape: {\"answer\":\"string\",\"lead\":null or {\"name\":\"\",\"phone\":\"\",\"email\":\"\",\"material\":\"\",\"quantity\":\"\",\"thickness\":\"\",\"color\":\"\",\"location\":\"\",\"comment\":\"\",\"source\":\"ai-chat\"}}.",
    "Create lead only when phone is present and the user asks for price, order, stock check, delivery, callback, reservation or calculation.",
    "If there is no phone, lead must be null.",
  ].join("\n");

  const contextMessages = [];
  contextMessages.push({ role: "system", content: systemPrompt });
  if (managerContext.text) {
    contextMessages.push({ role: "system", content: managerContext.text });
  }
  if (accumulatedLead) {
    const parts = [];
    if (accumulatedLead.name) parts.push(`name=${accumulatedLead.name}`);
    if (accumulatedLead.phone) parts.push(`phone=${accumulatedLead.phone}`);
    if (accumulatedLead.material) parts.push(`material=${accumulatedLead.material}`);
    if (accumulatedLead.quantity) parts.push(`quantity=${accumulatedLead.quantity}`);
    if (accumulatedLead.thickness) parts.push(`thickness=${accumulatedLead.thickness}`);
    if (accumulatedLead.color) parts.push(`color=${accumulatedLead.color}`);
    if (accumulatedLead.location) parts.push(`location=${accumulatedLead.location}`);
    if (parts.length) {
      contextMessages.push({ role: "system", content: `Accumulated client data from this session: ${parts.join(" | ")}. Use this to avoid re-asking known fields.` });
    }
  }
  contextMessages.push(
    ...messages.slice(-10).map((message) => ({
      role: message.role === "assistant" ? "assistant" : "user",
      content: String(message.content || "").slice(0, 1200),
    }))
  );

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      input: contextMessages,
      max_output_tokens: 800,
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

  return {
    answer: String(parsed.answer).slice(0, 1200),
    lead: lead || null,
    crmData: buildAiCrmData(lead, managerContext),
  };
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
    const accumulatedLead = raw.accumulatedLead || null;

    if (!messages.length) {
      sendJson(response, 400, { ok: false, message: "Message is required" });
      return;
    }

    const aiResult = await callOpenAiAgent(messages, lang, accumulatedLead);
    const lastMessage = messages[messages.length - 1]?.content || "";
    aiResult.lead = aiResult.lead || extractLeadFromMessage(lastMessage);
    let leadCreated = false;

    if (aiResult.lead) {
      const phoneDigits = String(aiResult.lead.phone || "").replace(/\D/g, "");
      if (phoneDigits.length >= 8) {
        const crmData = aiResult.crmData || buildAiCrmData(aiResult.lead, buildManagerContext(lastMessage));
        const estimateLine = crmData?.estimate_mdl ? `\nEstimare AI: ${crmData.estimate_mdl}` : "";
        const areaLine = crmData?.area_m2 ? `\nSuprafata AI: ${crmData.area_m2} m2` : "";
        await saveLead({
          ...aiResult.lead,
          source: "ai-chat",
          comment: `${aiResult.lead.comment || `AI chat lead: ${String(lastMessage).slice(0, 450)}`}${areaLine}${estimateLine}`,
        });
        aiResult.crmData = crmData;
        leadCreated = true;
      }
    }

    sendJson(response, 200, { ok: true, answer: aiResult.answer, leadCreated, crmData: leadCreated ? aiResult.crmData : null });
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
