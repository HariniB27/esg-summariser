const axios = require('axios');
const { extractText } = require('unpdf');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { url } = req.body;
  if (!url || !url.startsWith('http')) return res.status(400).json({ error: 'Invalid URL provided.' });
  try {
    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 30000,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ESGSummariser/1.0)' },
      maxContentLength: 20 * 1024 * 1024,
    });
    const contentType = response.headers['content-type'] || '';
    const buffer = Buffer.from(response.data);
    if (contentType.includes('pdf') || url.toLowerCase().endsWith('.pdf')) {
      const { text } = await extractText(new Uint8Array(buffer), { mergePages: true });
      if (!text || !text.trim()) return res.status(422).json({ error: 'Could not extract text from this PDF. It may be a scanned image-based PDF.' });
      return res.status(200).json({ text, type: 'pdf' });
    }
    if (contentType.includes('html') || contentType.includes('text')) {
      const text = buffer.toString('utf-8').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
      return res.status(200).json({ text, type: 'html' });
    }
    return res.status(415).json({ error: 'Unsupported file type. Only PDF and HTML reports are supported.' });
  } catch (err) {
    if (err.code === 'ECONNABORTED') return res.status(408).json({ error: 'Request timed out.' });
    if (err.response?.status === 403) return res.status(403).json({ error: 'Access denied. This website blocks automated downloads.' });
    if (err.response?.status === 404) return res.status(404).json({ error: 'Report not found at this URL.' });
    return res.status(500).json({ error: `Failed to fetch report: ${err.message}` });
  }
};
