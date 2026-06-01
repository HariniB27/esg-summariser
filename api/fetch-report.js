const axios = require("axios");
const pdfParse = require("pdf-parse");

const MAX_SIZE_BYTES = 20 * 1024 * 1024;
const TIMEOUT_MS = 30000;

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { url } = req.body || {};
  if (!url || typeof url !== "string") {
    return res.status(400).json({ error: "Missing or invalid url in request body" });
  }

  let response;
  try {
    response = await axios.get(url, {
      responseType: "arraybuffer",
      timeout: TIMEOUT_MS,
      maxContentLength: MAX_SIZE_BYTES,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; ESGSummariser/1.0)",
      },
      validateStatus: (status) => status < 500,
    });
  } catch (err) {
    if (err.code === "ECONNABORTED") {
      return res.status(504).json({ error: "Request timed out after 30 seconds" });
    }
    if (err.response?.status === 403) {
      return res.status(403).json({ error: "Access denied (403) — the report URL is not publicly accessible" });
    }
    if (err.response?.status === 404) {
      return res.status(404).json({ error: "Report not found (404) at the provided URL" });
    }
    return res.status(502).json({ error: `Failed to fetch URL: ${err.message}` });
  }

  if (response.status === 403) {
    return res.status(403).json({ error: "Access denied (403) — the report URL is not publicly accessible" });
  }
  if (response.status === 404) {
    return res.status(404).json({ error: "Report not found (404) at the provided URL" });
  }
  if (response.status >= 400) {
    return res.status(502).json({ error: `Remote server returned status ${response.status}` });
  }

  const contentType = (response.headers["content-type"] || "").toLowerCase();
  const buffer = Buffer.from(response.data);

  if (buffer.length > MAX_SIZE_BYTES) {
    return res.status(413).json({ error: "File exceeds 20MB limit" });
  }

  let text = "";

  if (contentType.includes("pdf") || url.toLowerCase().endsWith(".pdf")) {
    try {
      const pdfData = await pdfParse(buffer);
      const fullText = pdfData.text;
      if (!fullText || !fullText.trim()) {
        return res.status(422).json({
          error: "Could not extract text from this PDF — it may be a scanned/image-based document",
        });
      }
      text = fullText;
    } catch (err) {
      return res.status(422).json({ error: `PDF parsing failed: ${err.message}` });
    }
  } else if (contentType.includes("html") || contentType.includes("text")) {
    const raw = buffer.toString("utf-8");
    text = raw
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/\s{2,}/g, " ")
      .trim();
    if (!text) {
      return res.status(422).json({ error: "No readable text found on the page" });
    }
  } else {
    return res.status(415).json({
      error: `Unsupported content type: ${contentType}. Only PDF and HTML pages are supported.`,
    });
  }

  return res.status(200).json({ text });
};
