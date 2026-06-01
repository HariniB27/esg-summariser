import { useState, useRef, useCallback } from "react";
import * as pdfjsLib from 'pdfjs-dist';
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

// ─── Constants ───────────────────────────────────────────────────────────────
const STEPS = [
  { id: 1, label: "Report Input" },
  { id: 2, label: "Document Extraction" },
  { id: 3, label: "ESG Summarisation" },
  { id: 4, label: "Metrics Extraction" },
  { id: 5, label: "Final Output" },
];

const ESG_SYSTEM_PROMPT = `You are a senior ESG reporting analyst specialising in sustainability disclosures, ESG frameworks (GRI, SASB, TCFD, CSRD, SDGs, UN Global Compact), and corporate reporting standards.

Your task: analyse the provided corporate report text and produce a rigorous, structured ESG disclosure summary in JSON format.

CRITICAL RULES:
- Do NOT invent data. Only report what is explicitly stated in the text.
- If a metric or disclosure is absent, write exactly: "Not disclosed in the provided report."
- Be critical of vague, qualitative ESG claims with no measurable backing.
- Do not over-score reports lacking quantitative KPIs or third-party assurance.
- Separate confirmed disclosures from aspirational statements.
- Flag greenwashing signals where present.

Return ONLY valid JSON (no markdown fences, no preamble) matching this exact schema:

{
  "companyDetails": {
    "name": "string",
    "reportType": "string",
    "reportingYear": "string",
    "reportingFrameworks": ["string"],
    "assuranceStatus": "string",
    "headquartersCountry": "string",
    "industry": "string",
    "reportSummary": "string (2-3 sentences)"
  },
  "executiveSummary": "string (3-5 sentences, critical assessment)",
  "environmental": {
    "climateStrategy": "string",
    "emissionsScope1": "string",
    "emissionsScope2": "string",
    "emissionsScope3": "string",
    "netZeroTarget": "string",
    "energyConsumption": "string",
    "renewableEnergy": "string",
    "waterConsumption": "string",
    "wasteGenerated": "string",
    "biodiversity": "string",
    "greenCertifications": "string",
    "keyStrengths": ["string"],
    "weaknesses": ["string"]
  },
  "social": {
    "totalEmployees": "string",
    "genderDiversity": "string",
    "leadershipDiversity": "string",
    "payEquity": "string",
    "employeeTurnover": "string",
    "trainingHours": "string",
    "healthSafetyLTIR": "string",
    "humanRights": "string",
    "communityInvestment": "string",
    "supplyChainESG": "string",
    "keyStrengths": ["string"],
    "weaknesses": ["string"]
  },
  "governance": {
    "boardSize": "string",
    "boardIndependence": "string",
    "boardDiversity": "string",
    "esgOversight": "string",
    "executivePayESGLink": "string",
    "antiCorruptionPolicy": "string",
    "whistleblowerPolicy": "string",
    "taxTransparency": "string",
    "riskManagement": "string",
    "lobbyingDisclosure": "string",
    "keyStrengths": ["string"],
    "weaknesses": ["string"]
  },
  "kpiTable": [
    {
      "esgArea": "string (Environmental/Social/Governance)",
      "metric": "string",
      "valueDisclosed": "string",
      "unit": "string",
      "reportingYear": "string",
      "sourceSection": "string",
      "comment": "string"
    }
  ],
  "missingDisclosures": ["string"],
  "scoringBreakdown": {
    "environmental": { "score": number, "maxScore": 25, "rationale": "string" },
    "social": { "score": number, "maxScore": 20, "rationale": "string" },
    "governance": { "score": number, "maxScore": 20, "rationale": "string" },
    "metricsAndTargets": { "score": number, "maxScore": 15, "rationale": "string" },
    "transparencyAndBalance": { "score": number, "maxScore": 10, "rationale": "string" },
    "comparabilityAndStructure": { "score": number, "maxScore": 10, "rationale": "string" },
    "totalScore": number,
    "grade": "string (A/B/C/D/F with descriptor)",
    "overallRationale": "string"
  },
  "recommendations": ["string"],
  "pickaxeSummary": "string (plain text, structured for Pickaxe AI tool, 400-600 words)"
}`;


const GROQ_API_KEY = process.env.REACT_APP_GROQ_API_KEY;

async function callClaudeAPI(reportText) {
  const truncated = reportText.slice(0, 24000); // Groq context window is smaller than Claude
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      max_tokens: 4000,
      temperature: 0.1,
      messages: [
        {
          role: "system",
          content: ESG_SYSTEM_PROMPT,
        },
        {
          role: "user",
          content: `Analyse the following corporate report and return the ESG summary JSON:\n\n${truncated}`,
        },
      ],
    }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Groq API error ${response.status}`);
  }
  const data = await response.json();
  const raw = data.choices?.[0]?.message?.content || "";
  try {
    return JSON.parse(raw);
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw new Error("Could not parse AI response as JSON. Try again or shorten the report.");
  }
}

// ─── Utilities ────────────────────────────────────────────────────────────────
function scoreColor(score, max) {
  const pct = score / max;
  if (pct >= 0.75) return "#059669";
  if (pct >= 0.5) return "#d97706";
  return "#dc2626";
}

function ScoreBar({ score, max, label }) {
  const pct = Math.round((score / max) * 100);
  const color = scoreColor(score, max);
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
        <span style={{ color: "var(--color-text-secondary)" }}>{label}</span>
        <span style={{ fontWeight: 500, color }}>
          {score}/{max}
        </span>
      </div>
      <div style={{ height: 6, background: "var(--color-background-secondary)", borderRadius: 4, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 4, transition: "width 0.8s ease" }} />
      </div>
    </div>
  );
}

function SectionCard({ icon, title, color, children }) {
  return (
    <div style={{
      background: "var(--color-background-primary)",
      border: "0.5px solid var(--color-border-tertiary)",
      borderRadius: 12,
      padding: "1.25rem",
      marginBottom: "1rem",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: "1rem" }}>
        <div style={{
          width: 36, height: 36, borderRadius: 8,
          background: `${color}18`, display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 18, color,
        }}>
          <i className={`ti ti-${icon}`} aria-hidden="true" />
        </div>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 500 }}>{title}</h3>
      </div>
      {children}
    </div>
  );
}

function DisclosureRow({ label, value }) {
  const missing = !value || value.toLowerCase().includes("not disclosed");
  return (
    <div style={{
      display: "flex", gap: 8, padding: "6px 0",
      borderBottom: "0.5px solid var(--color-border-tertiary)",
      alignItems: "flex-start",
    }}>
      <span style={{ minWidth: 180, fontSize: 13, color: "var(--color-text-secondary)", flexShrink: 0 }}>{label}</span>
      <span style={{
        fontSize: 13,
        color: missing ? "var(--color-text-tertiary)" : "var(--color-text-primary)",
        fontStyle: missing ? "italic" : "normal",
      }}>
        {value || "Not disclosed in the provided report."}
      </span>
    </div>
  );
}

function TagList({ items, color }) {
  if (!items?.length) return null;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
      {items.map((item, i) => (
        <span key={i} style={{
          fontSize: 12, padding: "3px 10px", borderRadius: 20,
          background: `${color}15`, color,
          border: `0.5px solid ${color}40`,
        }}>{item}</span>
      ))}
    </div>
  );
}

// ─── KPI Table ────────────────────────────────────────────────────────────────
function KPITable({ rows }) {
  if (!rows?.length) return <p style={{ fontSize: 13, color: "var(--color-text-tertiary)", fontStyle: "italic" }}>No KPIs extracted.</p>;
  const areaColors = { Environmental: "#059669", Social: "#2563eb", Governance: "#7c3aed" };
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, tableLayout: "fixed" }}>
        <colgroup>
          <col style={{ width: "12%" }} />
          <col style={{ width: "20%" }} />
          <col style={{ width: "16%" }} />
          <col style={{ width: "8%" }} />
          <col style={{ width: "10%" }} />
          <col style={{ width: "14%" }} />
          <col style={{ width: "20%" }} />
        </colgroup>
        <thead>
          <tr style={{ background: "var(--color-background-secondary)" }}>
            {["ESG Area", "Metric / Disclosure", "Value", "Unit", "Year", "Source Section", "Comment"].map(h => (
              <th key={h} style={{
                padding: "8px 10px", textAlign: "left", fontWeight: 500, fontSize: 11,
                color: "var(--color-text-secondary)", borderBottom: "0.5px solid var(--color-border-tertiary)",
              }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} style={{ borderBottom: "0.5px solid var(--color-border-tertiary)" }}>
              <td style={{ padding: "7px 10px" }}>
                <span style={{
                  fontSize: 11, padding: "2px 8px", borderRadius: 10,
                  background: `${areaColors[row.esgArea] || "#888"}15`,
                  color: areaColors[row.esgArea] || "#888",
                  fontWeight: 500,
                }}>{row.esgArea}</span>
              </td>
              {[row.metric, row.valueDisclosed, row.unit, row.reportingYear, row.sourceSection, row.comment].map((v, j) => (
                <td key={j} style={{
                  padding: "7px 10px",
                  color: (!v || v.toLowerCase().includes("not disclosed"))
                    ? "var(--color-text-tertiary)" : "var(--color-text-primary)",
                  fontStyle: (!v || v.toLowerCase().includes("not disclosed")) ? "italic" : "normal",
                  wordBreak: "break-word",
                }}>{v || "—"}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Progress Stepper ─────────────────────────────────────────────────────────
function Stepper({ currentStep }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 0, marginBottom: "2rem", flexWrap: "wrap" }}>
      {STEPS.map((step, idx) => {
        const done = currentStep > step.id;
        const active = currentStep === step.id;
        return (
          <div key={step.id} style={{ display: "flex", alignItems: "center" }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
              <div style={{
                width: 32, height: 32, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 13, fontWeight: 500,
                background: done ? "#059669" : active ? "#1d4ed8" : "var(--color-background-secondary)",
                color: (done || active) ? "#fff" : "var(--color-text-tertiary)",
                border: active ? "2px solid #1d4ed8" : "0.5px solid var(--color-border-tertiary)",
                transition: "all 0.3s",
              }}>
                {done ? <i className="ti ti-check" style={{ fontSize: 14 }} aria-hidden="true" /> : step.id}
              </div>
              <span style={{
                fontSize: 10, color: active ? "#1d4ed8" : "var(--color-text-tertiary)",
                fontWeight: active ? 500 : 400, maxWidth: 80, textAlign: "center",
              }}>{step.label}</span>
            </div>
            {idx < STEPS.length - 1 && (
              <div style={{
                width: 32, height: 1, background: done ? "#059669" : "var(--color-border-tertiary)",
                margin: "0 4px", marginBottom: 20, transition: "background 0.3s",
              }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function ESGApp() {
  const [inputMode, setInputMode] = useState(null); // "url" | "file" | "text"
  const [urlInput, setUrlInput] = useState("");
  const [textInput, setTextInput] = useState("");
  const [fileName, setFileName] = useState("");
  const [fileText, setFileText] = useState("");
  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");
  const fileRef = useRef();
  const resultRef = useRef();

  // ── File reader ──
  const handleFileUpload = useCallback(async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) { setError("File exceeds 20MB limit."); return; }
    setFileName(file.name);
    setError("");

    // Handle PDF files
    if (file.type === "application/pdf" || file.name.endsWith(".pdf")) {
      try {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        let fullText = "";
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const content = await page.getTextContent();
          const pageText = content.items.map(item => item.str).join(" ");
          fullText += `\n${pageText}`;
        }
        if (!fullText.trim()) {
          setError("Could not extract text from this PDF. It may be a scanned image-based PDF.");
          return;
        }
        setFileText(fullText);
      } catch (err) {
        setError("Failed to read PDF: " + err.message);
      }
      return;
    }

    // Handle plain text files
    const reader = new FileReader();
    reader.onload = (evt) => setFileText(evt.target.result);
    reader.onerror = () => setError("Failed to read file.");
    reader.readAsText(file);
  }, []);

  // ── Main process ──
  const handleProcess = useCallback(async () => {
    setError("");
    setResult(null);

    let reportText = "";

    if (inputMode === "url") {
      if (!urlInput.trim()) { setError("Please enter a URL."); return; }
      setLoading(true);
      setCurrentStep(2);
      setLoadingMsg("Fetching report from URL…");
      try {
        const res = await fetch("/api/fetch-report", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: urlInput.trim() }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || `Server error ${res.status}`);
        reportText = json.text;
      } catch (err) {
        setError(`Failed to fetch report: ${err.message}`);
        setLoading(false);
        setCurrentStep(1);
        return;
      }
    } else if (inputMode === "file") {
      if (!fileText) { setError("Please upload a file first."); return; }
      reportText = fileText;
    } else if (inputMode === "text") {
      if (!textInput.trim()) { setError("Please paste some report text."); return; }
      if (textInput.trim().length < 200) { setError("Report text appears too short. Please paste more content."); return; }
      reportText = textInput;
    } else {
      setError("Please select an input method first.");
      return;
    }

    setLoading(true);
    setCurrentStep(2);
    setLoadingMsg("Extracting document content…");
    await new Promise(r => setTimeout(r, 600));

    setCurrentStep(3);
    setLoadingMsg("Identifying ESG sections and running AI summarisation…");
    await new Promise(r => setTimeout(r, 400));

    setCurrentStep(4);
    setLoadingMsg("Extracting KPIs, metrics, and scoring disclosures…");

    try {
      const data = await callClaudeAPI(reportText);
      setCurrentStep(5);
      setLoadingMsg("Generating final output…");
      await new Promise(r => setTimeout(r, 300));
      setResult(data);
      setTimeout(() => resultRef.current?.scrollIntoView({ behavior: "smooth" }), 200);
    } catch (err) {
      setError(`Analysis failed: ${err.message}`);
      setCurrentStep(1);
    } finally {
      setLoading(false);
      setLoadingMsg("");
    }
  }, [inputMode, urlInput, textInput, fileText]);

  const handleCopy = () => {
    if (!result?.pickaxeSummary) return;
    navigator.clipboard.writeText(result.pickaxeSummary);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const totalScore = result?.scoringBreakdown?.totalScore ?? 0;
  const gradeColor = totalScore >= 75 ? "#059669" : totalScore >= 50 ? "#d97706" : "#dc2626";

  // ── Render ──
  return (
    <div style={{ fontFamily: "var(--font-sans)", maxWidth: 900, margin: "0 auto", padding: "1.5rem 1rem" }}>
      <h2 className="sr-only">ESG Reporting Summariser — AI-powered ESG disclosure analysis tool</h2>

      {/* Header */}
      <div style={{ marginBottom: "2rem", textAlign: "center" }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 10, background: "#052e1618",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 20, color: "#059669",
          }}>
            <i className="ti ti-leaf" aria-hidden="true" />
          </div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 500 }}>ESG Reporting Summariser</h1>
        </div>
        <p style={{ margin: 0, fontSize: 14, color: "var(--color-text-secondary)" }}>
          Upload or paste a corporate report. Get a structured ESG disclosure summary, KPI table, and quality score.
        </p>
      </div>

      {/* Stepper */}
      <Stepper currentStep={currentStep} />

      {/* Input Section */}
      {!result && (
        <div>
          {/* Input mode selector */}
          {!inputMode && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: "1.5rem" }}>
              {[
                { key: "url", icon: "link", label: "Paste Report URL", desc: "Enter a public report link" },
                { key: "file", icon: "upload", label: "Upload Report", desc: "PDF, TXT, or DOCX (text)" },
                { key: "text", icon: "file-text", label: "Paste Report Text", desc: "Copy and paste report content" },
              ].map(opt => (
                <button key={opt.key} onClick={() => { setInputMode(opt.key); setError(""); }}
                  style={{
                    background: "var(--color-background-primary)",
                    border: "0.5px solid var(--color-border-secondary)",
                    borderRadius: 12, padding: "1.25rem 1rem", cursor: "pointer",
                    textAlign: "center", transition: "border-color 0.2s",
                  }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = "#059669"}
                  onMouseLeave={e => e.currentTarget.style.borderColor = ""}
                >
                  <i className={`ti ti-${opt.icon}`} style={{ fontSize: 24, color: "#059669", display: "block", marginBottom: 8 }} aria-hidden="true" />
                  <div style={{ fontWeight: 500, fontSize: 14, marginBottom: 4 }}>{opt.label}</div>
                  <div style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>{opt.desc}</div>
                </button>
              ))}
            </div>
          )}

          {/* URL input */}
          {inputMode === "url" && (
            <div style={{ background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: 12, padding: "1.25rem" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <div style={{ fontWeight: 500, fontSize: 14 }}>
                  <i className="ti ti-link" style={{ marginRight: 6, color: "#059669" }} aria-hidden="true" />
                  Report URL
                </div>
                <button onClick={() => setInputMode(null)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: "var(--color-text-secondary)" }}>
                  <i className="ti ti-x" aria-hidden="true" />
                </button>
              </div>
              <input type="url" value={urlInput} onChange={e => setUrlInput(e.target.value)}
                placeholder="https://company.com/sustainability-report-2024.pdf"
                style={{ width: "100%", boxSizing: "border-box", marginBottom: 12 }} />
              <p style={{ margin: "0 0 12px", fontSize: 12, color: "var(--color-text-tertiary)" }}>
                Note: URL fetching requires a backend proxy for production use. For demo, paste the report text directly.
              </p>
              <button onClick={handleProcess} disabled={loading}
                style={{ background: "#059669", color: "#fff", border: "none", borderRadius: 8, padding: "8px 20px", cursor: "pointer", fontSize: 14, fontWeight: 500 }}>
                Analyse Report
              </button>
            </div>
          )}

          {/* File upload */}
          {inputMode === "file" && (
            <div style={{ background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: 12, padding: "1.25rem" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <div style={{ fontWeight: 500, fontSize: 14 }}>
                  <i className="ti ti-upload" style={{ marginRight: 6, color: "#059669" }} aria-hidden="true" />
                  Upload Report File
                </div>
                <button onClick={() => setInputMode(null)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: "var(--color-text-secondary)" }}>
                  <i className="ti ti-x" aria-hidden="true" />
                </button>
              </div>
              <div
                onClick={() => fileRef.current?.click()}
                style={{
                  border: "1px dashed var(--color-border-secondary)", borderRadius: 8, padding: "2rem",
                  textAlign: "center", cursor: "pointer", marginBottom: 12,
                  background: "var(--color-background-secondary)",
                }}
              >
                <i className="ti ti-file-upload" style={{ fontSize: 28, color: "#059669", display: "block", marginBottom: 8 }} aria-hidden="true" />
                <div style={{ fontSize: 14, marginBottom: 4 }}>{fileName || "Click to upload or drag file here"}</div>
                <div style={{ fontSize: 12, color: "var(--color-text-tertiary)" }}>PDF or TXT — max 20MB. Scanned/image PDFs are not supported.</div>
                <input ref={fileRef} type="file" accept=".pdf,.txt,.md" onChange={handleFileUpload} style={{ display: "none" }} />
              </div>
              {fileText && (
                <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginBottom: 12 }}>
                  ✓ Loaded {fileText.length.toLocaleString()} characters from {fileName}
                </div>
              )}
              <button onClick={handleProcess} disabled={loading || !fileText}
                style={{ background: "#059669", color: "#fff", border: "none", borderRadius: 8, padding: "8px 20px", cursor: "pointer", fontSize: 14, fontWeight: 500, opacity: !fileText ? 0.5 : 1 }}>
                Analyse Report
              </button>
            </div>
          )}

          {/* Text paste */}
          {inputMode === "text" && (
            <div style={{ background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: 12, padding: "1.25rem" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <div style={{ fontWeight: 500, fontSize: 14 }}>
                  <i className="ti ti-file-text" style={{ marginRight: 6, color: "#059669" }} aria-hidden="true" />
                  Paste Report Text
                </div>
                <button onClick={() => setInputMode(null)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: "var(--color-text-secondary)" }}>
                  <i className="ti ti-x" aria-hidden="true" />
                </button>
              </div>
              <textarea value={textInput} onChange={e => setTextInput(e.target.value)}
                placeholder="Paste your annual report, sustainability report, ESG report, or integrated report text here…"
                style={{ width: "100%", boxSizing: "border-box", minHeight: 200, resize: "vertical", fontFamily: "var(--font-sans)", fontSize: 13 }} />
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
                <span style={{ fontSize: 12, color: "var(--color-text-tertiary)" }}>
                  {textInput.length.toLocaleString()} characters
                </span>
                <button onClick={handleProcess} disabled={loading}
                  style={{ background: "#059669", color: "#fff", border: "none", borderRadius: 8, padding: "8px 20px", cursor: "pointer", fontSize: 14, fontWeight: 500 }}>
                  Analyse Report
                </button>
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div style={{
              marginTop: 12, padding: "10px 14px", borderRadius: 8,
              background: "var(--color-background-danger)", border: "0.5px solid var(--color-border-danger)",
              color: "var(--color-text-danger)", fontSize: 13,
              display: "flex", alignItems: "center", gap: 8,
            }}>
              <i className="ti ti-alert-circle" aria-hidden="true" />
              {error}
            </div>
          )}

          {/* Loading */}
          {loading && (
            <div style={{
              marginTop: 16, padding: "1.25rem", borderRadius: 12,
              background: "var(--color-background-secondary)",
              border: "0.5px solid var(--color-border-tertiary)",
              textAlign: "center",
            }}>
              <div style={{ display: "flex", justifyContent: "center", marginBottom: 10 }}>
                <div style={{
                  width: 28, height: 28, borderRadius: "50%",
                  border: "2px solid var(--color-border-secondary)",
                  borderTopColor: "#059669",
                  animation: "spin 0.8s linear infinite",
                }} />
              </div>
              <div style={{ fontSize: 14, fontWeight: 500 }}>{loadingMsg}</div>
              <div style={{ fontSize: 12, color: "var(--color-text-tertiary)", marginTop: 4 }}>
                AI is reading and analysing the report…
              </div>
            </div>
          )}
        </div>
      )}

      {/* Results */}
      {result && (
        <div ref={resultRef}>
          {/* Results header + reset */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 500 }}>ESG Analysis Complete</h2>
              <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--color-text-secondary)" }}>
                {result.companyDetails?.name || "Company"} — {result.companyDetails?.reportType || "ESG Report"}
              </p>
            </div>
            <button onClick={() => { setResult(null); setCurrentStep(1); setInputMode(null); setTextInput(""); setFileText(""); setFileName(""); setUrlInput(""); }}
              style={{ background: "none", border: "0.5px solid var(--color-border-secondary)", borderRadius: 8, padding: "6px 14px", cursor: "pointer", fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
              <i className="ti ti-refresh" aria-hidden="true" />
              New Report
            </button>
          </div>

          {/* Score summary cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10, marginBottom: "1.5rem" }}>
            {[
              { label: "Total Score", value: `${totalScore}/100`, color: gradeColor },
              { label: "Grade", value: result.scoringBreakdown?.grade?.split(" ")[0] || "—", color: gradeColor },
              { label: "KPIs Found", value: result.kpiTable?.length ?? 0, color: "#2563eb" },
              { label: "Gaps Found", value: result.missingDisclosures?.length ?? 0, color: "#dc2626" },
            ].map(c => (
              <div key={c.label} style={{
                background: "var(--color-background-secondary)", borderRadius: 8, padding: "0.875rem",
                textAlign: "center",
              }}>
                <div style={{ fontSize: 11, color: "var(--color-text-secondary)", marginBottom: 4 }}>{c.label}</div>
                <div style={{ fontSize: 22, fontWeight: 500, color: c.color }}>{c.value}</div>
              </div>
            ))}
          </div>

          {/* Tab nav */}
          <div style={{ display: "flex", gap: 4, marginBottom: "1.25rem", flexWrap: "wrap" }}>
            {[
              ["overview", "ti-layout-dashboard", "Overview"],
              ["env", "ti-leaf", "Environmental"],
              ["social", "ti-users", "Social"],
              ["gov", "ti-building", "Governance"],
              ["kpi", "ti-table", "KPI Table"],
              ["score", "ti-chart-bar", "Scoring"],
              ["pickaxe", "ti-copy", "Pickaxe"],
            ].map(([id, icon, label]) => (
              <button key={id} onClick={() => setActiveTab(id)}
                style={{
                  padding: "6px 14px", borderRadius: 8, fontSize: 13, cursor: "pointer", fontWeight: 500,
                  background: activeTab === id ? "#059669" : "var(--color-background-secondary)",
                  color: activeTab === id ? "#fff" : "var(--color-text-secondary)",
                  border: activeTab === id ? "none" : "0.5px solid var(--color-border-tertiary)",
                  display: "flex", alignItems: "center", gap: 6,
                }}>
                <i className={`ti ${icon}`} style={{ fontSize: 14 }} aria-hidden="true" />
                {label}
              </button>
            ))}
          </div>

          {/* ── Overview tab ── */}
          {activeTab === "overview" && (
            <div>
              <SectionCard icon="building-community" title="Company & Report Details" color="#2563eb">
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 24px" }}>
                  {[
                    ["Company", result.companyDetails?.name],
                    ["Report Type", result.companyDetails?.reportType],
                    ["Reporting Year", result.companyDetails?.reportingYear],
                    ["Industry", result.companyDetails?.industry],
                    ["Headquarters", result.companyDetails?.headquartersCountry],
                    ["Assurance Status", result.companyDetails?.assuranceStatus],
                  ].map(([l, v]) => <DisclosureRow key={l} label={l} value={v} />)}
                </div>
                {result.companyDetails?.reportingFrameworks?.length > 0 && (
                  <div style={{ marginTop: 8 }}>
                    <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginBottom: 4 }}>Reporting Frameworks</div>
                    <TagList items={result.companyDetails.reportingFrameworks} color="#2563eb" />
                  </div>
                )}
              </SectionCard>

              <SectionCard icon="file-description" title="Executive ESG Summary" color="#059669">
                <p style={{ margin: 0, fontSize: 14, lineHeight: 1.7, color: "var(--color-text-primary)" }}>
                  {result.executiveSummary}
                </p>
              </SectionCard>

              {result.missingDisclosures?.length > 0 && (
                <SectionCard icon="alert-triangle" title="Missing or Weak Disclosures" color="#dc2626">
                  <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.8 }}>
                    {result.missingDisclosures.map((d, i) => (
                      <li key={i} style={{ color: "var(--color-text-primary)" }}>{d}</li>
                    ))}
                  </ul>
                </SectionCard>
              )}

              {result.recommendations?.length > 0 && (
                <SectionCard icon="bulb" title="Recommendations for Improvement" color="#d97706">
                  <ol style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.8 }}>
                    {result.recommendations.map((r, i) => (
                      <li key={i} style={{ color: "var(--color-text-primary)", marginBottom: 4 }}>{r}</li>
                    ))}
                  </ol>
                </SectionCard>
              )}
            </div>
          )}

          {/* ── Environmental tab ── */}
          {activeTab === "env" && (
            <SectionCard icon="leaf" title="Environmental Disclosures" color="#059669">
              {[
                ["Climate Strategy", result.environmental?.climateStrategy],
                ["Scope 1 Emissions", result.environmental?.emissionsScope1],
                ["Scope 2 Emissions", result.environmental?.emissionsScope2],
                ["Scope 3 Emissions", result.environmental?.emissionsScope3],
                ["Net Zero / Reduction Target", result.environmental?.netZeroTarget],
                ["Energy Consumption", result.environmental?.energyConsumption],
                ["Renewable Energy", result.environmental?.renewableEnergy],
                ["Water Consumption", result.environmental?.waterConsumption],
                ["Waste Generated", result.environmental?.wasteGenerated],
                ["Biodiversity", result.environmental?.biodiversity],
                ["Green Certifications", result.environmental?.greenCertifications],
              ].map(([l, v]) => <DisclosureRow key={l} label={l} value={v} />)}
              <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                {result.environmental?.keyStrengths?.length > 0 && (
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 500, color: "#059669", marginBottom: 6 }}>Key Strengths</div>
                    <TagList items={result.environmental.keyStrengths} color="#059669" />
                  </div>
                )}
                {result.environmental?.weaknesses?.length > 0 && (
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 500, color: "#dc2626", marginBottom: 6 }}>Weaknesses</div>
                    <TagList items={result.environmental.weaknesses} color="#dc2626" />
                  </div>
                )}
              </div>
            </SectionCard>
          )}

          {/* ── Social tab ── */}
          {activeTab === "social" && (
            <SectionCard icon="users" title="Social Disclosures" color="#2563eb">
              {[
                ["Total Employees", result.social?.totalEmployees],
                ["Gender Diversity", result.social?.genderDiversity],
                ["Leadership Diversity", result.social?.leadershipDiversity],
                ["Pay Equity", result.social?.payEquity],
                ["Employee Turnover", result.social?.employeeTurnover],
                ["Training Hours per Employee", result.social?.trainingHours],
                ["Health & Safety (LTIR)", result.social?.healthSafetyLTIR],
                ["Human Rights Policy", result.social?.humanRights],
                ["Community Investment", result.social?.communityInvestment],
                ["Supply Chain ESG", result.social?.supplyChainESG],
              ].map(([l, v]) => <DisclosureRow key={l} label={l} value={v} />)}
              <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                {result.social?.keyStrengths?.length > 0 && (
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 500, color: "#059669", marginBottom: 6 }}>Key Strengths</div>
                    <TagList items={result.social.keyStrengths} color="#059669" />
                  </div>
                )}
                {result.social?.weaknesses?.length > 0 && (
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 500, color: "#dc2626", marginBottom: 6 }}>Weaknesses</div>
                    <TagList items={result.social.weaknesses} color="#dc2626" />
                  </div>
                )}
              </div>
            </SectionCard>
          )}

          {/* ── Governance tab ── */}
          {activeTab === "gov" && (
            <SectionCard icon="building" title="Governance Disclosures" color="#7c3aed">
              {[
                ["Board Size", result.governance?.boardSize],
                ["Board Independence", result.governance?.boardIndependence],
                ["Board Diversity", result.governance?.boardDiversity],
                ["ESG Board Oversight", result.governance?.esgOversight],
                ["Executive Pay Linked to ESG", result.governance?.executivePayESGLink],
                ["Anti-Corruption Policy", result.governance?.antiCorruptionPolicy],
                ["Whistleblower Policy", result.governance?.whistleblowerPolicy],
                ["Tax Transparency", result.governance?.taxTransparency],
                ["Risk Management", result.governance?.riskManagement],
                ["Lobbying Disclosure", result.governance?.lobbyingDisclosure],
              ].map(([l, v]) => <DisclosureRow key={l} label={l} value={v} />)}
              <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                {result.governance?.keyStrengths?.length > 0 && (
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 500, color: "#059669", marginBottom: 6 }}>Key Strengths</div>
                    <TagList items={result.governance.keyStrengths} color="#059669" />
                  </div>
                )}
                {result.governance?.weaknesses?.length > 0 && (
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 500, color: "#dc2626", marginBottom: 6 }}>Weaknesses</div>
                    <TagList items={result.governance.weaknesses} color="#dc2626" />
                  </div>
                )}
              </div>
            </SectionCard>
          )}

          {/* ── KPI Table tab ── */}
          {activeTab === "kpi" && (
            <SectionCard icon="table" title="ESG KPI Table" color="#2563eb">
              <KPITable rows={result.kpiTable} />
            </SectionCard>
          )}

          {/* ── Scoring tab ── */}
          {activeTab === "score" && result.scoringBreakdown && (
            <div>
              <SectionCard icon="chart-bar" title="ESG Reporting Quality Score" color={gradeColor}>
                <div style={{ display: "flex", alignItems: "center", gap: 24, marginBottom: "1.25rem", flexWrap: "wrap" }}>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 48, fontWeight: 500, color: gradeColor, lineHeight: 1 }}>{totalScore}</div>
                    <div style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>out of 100</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 22, fontWeight: 500, color: gradeColor }}>{result.scoringBreakdown.grade}</div>
                    <p style={{ margin: "6px 0 0", fontSize: 13, color: "var(--color-text-secondary)", maxWidth: 400 }}>
                      {result.scoringBreakdown.overallRationale}
                    </p>
                  </div>
                </div>
                {[
                  ["Environmental Disclosure", result.scoringBreakdown.environmental],
                  ["Social Disclosure", result.scoringBreakdown.social],
                  ["Governance Disclosure", result.scoringBreakdown.governance],
                  ["Metrics & Targets", result.scoringBreakdown.metricsAndTargets],
                  ["Transparency & Balance", result.scoringBreakdown.transparencyAndBalance],
                  ["Comparability & Structure", result.scoringBreakdown.comparabilityAndStructure],
                ].map(([label, data]) => data && (
                  <div key={label} style={{ marginBottom: 14 }}>
                    <ScoreBar label={label} score={data.score} max={data.maxScore} />
                    <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginTop: 2, paddingLeft: 2 }}>
                      {data.rationale}
                    </div>
                  </div>
                ))}
              </SectionCard>
            </div>
          )}

          {/* ── Pickaxe tab ── */}
          {activeTab === "pickaxe" && (
            <SectionCard icon="copy" title="Pickaxe-Ready Summary" color="#059669">
              <p style={{ fontSize: 13, color: "var(--color-text-secondary)", marginBottom: 12 }}>
                Copy this structured summary and paste it directly into your Pickaxe AI tool as the knowledge source or context input.
              </p>
              <div style={{
                background: "var(--color-background-secondary)",
                border: "0.5px solid var(--color-border-tertiary)",
                borderRadius: 8, padding: "1rem",
                fontSize: 13, lineHeight: 1.8, whiteSpace: "pre-wrap",
                fontFamily: "var(--font-mono)",
                maxHeight: 400, overflowY: "auto",
                marginBottom: 12,
              }}>
                {result.pickaxeSummary}
              </div>
              <button onClick={handleCopy}
                style={{
                  background: copied ? "#059669" : "var(--color-background-primary)",
                  color: copied ? "#fff" : "var(--color-text-primary)",
                  border: "0.5px solid var(--color-border-secondary)",
                  borderRadius: 8, padding: "8px 18px", cursor: "pointer", fontSize: 13, fontWeight: 500,
                  display: "flex", alignItems: "center", gap: 8, transition: "all 0.2s",
                }}>
                <i className={`ti ti-${copied ? "check" : "copy"}`} aria-hidden="true" />
                {copied ? "Copied to clipboard!" : "Copy for Pickaxe"}
              </button>
            </SectionCard>
          )}
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
