import { useState, useRef, useCallback } from "react";

// ─── Constants ────────────────────────────────────────────────────────────────
const STEPS = [
  { id: 1, label: "Report Input" },
  { id: 2, label: "Extraction" },
  { id: 3, label: "AI Analysis" },
  { id: 4, label: "Metrics" },
  { id: 5, label: "Output" },
];

const C = {
  env: "#059669",
  social: "#2563eb",
  gov: "#7c3aed",
  warn: "#d97706",
  danger: "#dc2626",
};

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

async function callGroqAPI(reportText) {
  const truncated = reportText.slice(0, 24000);
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      max_tokens: 4000,
      temperature: 0.1,
      messages: [
        { role: "system", content: ESG_SYSTEM_PROMPT },
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

// ─── Helpers ──────────────────────────────────────────────────────────────────
function scoreColor(score, max) {
  const p = score / max;
  if (p >= 0.75) return C.env;
  if (p >= 0.5) return C.warn;
  return C.danger;
}

function CircleScore({ score, max = 100, size = 120 }) {
  const color = scoreColor(score, max);
  const cx = size / 2;
  const cy = size / 2;
  const r = (size - 16) / 2;
  const circ = 2 * Math.PI * r;
  const fill = circ * (score / max);
  return (
    <svg width={size} height={size}>
      {/* Arc rings — rotated so arc starts from top */}
      <g transform={`rotate(-90, ${cx}, ${cy})`}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--color-border-secondary)" strokeWidth={8} />
        <circle
          cx={cx} cy={cy} r={r} fill="none"
          stroke={color} strokeWidth={8}
          strokeDasharray={`${fill} ${circ - fill}`}
          strokeLinecap="round"
          style={{ transition: "stroke-dasharray 1s ease" }}
        />
      </g>
      {/* Score number — centered, normal orientation */}
      <text
        x={cx} y={cy - size * 0.06}
        textAnchor="middle" dominantBaseline="middle"
        fill={color}
        fontSize={size * 0.24}
        fontWeight="700"
        fontFamily="inherit"
      >
        {score}
      </text>
      {/* "/ max" label */}
      <text
        x={cx} y={cy + size * 0.19}
        textAnchor="middle" dominantBaseline="middle"
        fill="var(--color-text-tertiary)"
        fontSize={size * 0.11}
        fontFamily="inherit"
      >
        / {max}
      </text>
    </svg>
  );
}

function ScoreBar({ score, max, label, color: overrideColor }) {
  const pct = Math.round((score / max) * 100);
  const color = overrideColor || scoreColor(score, max);
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 5 }}>
        <span style={{ color: "var(--color-text-secondary)" }}>{label}</span>
        <span style={{ fontWeight: 600, color }}>{score}<span style={{ color: "var(--color-text-tertiary)", fontWeight: 400 }}>/{max}</span></span>
      </div>
      <div style={{ height: 7, background: "var(--color-background-secondary)", borderRadius: 99, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 99, transition: "width 1s ease" }} />
      </div>
    </div>
  );
}

function Card({ children, style }) {
  return (
    <div style={{
      background: "var(--color-background-primary)",
      border: "1px solid var(--color-border-tertiary)",
      borderRadius: 16,
      padding: "1.5rem",
      marginBottom: "1rem",
      boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
      ...style,
    }}>
      {children}
    </div>
  );
}

function SectionCard({ icon, title, color, children, accent }) {
  return (
    <Card style={{ borderTop: accent ? `3px solid ${color}` : undefined }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: "1.1rem" }}>
        <div style={{
          width: 38, height: 38, borderRadius: 10,
          background: `${color}18`, display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 18, color, flexShrink: 0,
        }}>
          <i className={`ti ti-${icon}`} aria-hidden="true" />
        </div>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: "var(--color-text-primary)" }}>{title}</h3>
      </div>
      {children}
    </Card>
  );
}

function DisclosureRow({ label, value }) {
  const missing = !value || value.toLowerCase().includes("not disclosed");
  return (
    <div style={{
      display: "flex", gap: 12, padding: "7px 0",
      borderBottom: "1px solid var(--color-border-tertiary)",
      alignItems: "flex-start",
    }}>
      <span style={{ minWidth: 190, fontSize: 12.5, color: "var(--color-text-secondary)", flexShrink: 0, paddingTop: 1 }}>{label}</span>
      <span style={{
        fontSize: 13,
        color: missing ? "var(--color-text-tertiary)" : "var(--color-text-primary)",
        fontStyle: missing ? "italic" : "normal",
        lineHeight: 1.5,
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
          fontSize: 11.5, padding: "3px 11px", borderRadius: 99,
          background: `${color}12`, color,
          border: `1px solid ${color}35`,
          fontWeight: 500,
        }}>{item}</span>
      ))}
    </div>
  );
}

// ─── KPI Table ────────────────────────────────────────────────────────────────
function KPITable({ rows }) {
  if (!rows?.length) return (
    <p style={{ fontSize: 13, color: "var(--color-text-tertiary)", fontStyle: "italic", padding: "1rem 0" }}>
      No KPIs were extracted from this report.
    </p>
  );
  const areaColors = { Environmental: C.env, Social: C.social, Governance: C.gov };
  return (
    <div style={{ overflowX: "auto", borderRadius: 10, border: "1px solid var(--color-border-tertiary)" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, tableLayout: "fixed" }}>
        <colgroup>
          <col style={{ width: "12%" }} />
          <col style={{ width: "20%" }} />
          <col style={{ width: "16%" }} />
          <col style={{ width: "8%" }} />
          <col style={{ width: "9%" }} />
          <col style={{ width: "15%" }} />
          <col style={{ width: "20%" }} />
        </colgroup>
        <thead>
          <tr style={{ background: "var(--color-background-secondary)" }}>
            {["ESG Area", "Metric / Disclosure", "Value", "Unit", "Year", "Source Section", "Comment"].map((h) => (
              <th key={h} style={{
                padding: "10px 12px", textAlign: "left", fontWeight: 600, fontSize: 11,
                color: "var(--color-text-secondary)", borderBottom: "1px solid var(--color-border-tertiary)",
                letterSpacing: "0.04em", textTransform: "uppercase",
              }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const isEven = i % 2 === 0;
            return (
              <tr key={i} style={{
                background: isEven ? "var(--color-background-primary)" : "var(--color-background-secondary)",
                borderBottom: "1px solid var(--color-border-tertiary)",
              }}>
                <td style={{ padding: "8px 12px" }}>
                  <span style={{
                    fontSize: 11, padding: "2px 9px", borderRadius: 99,
                    background: `${areaColors[row.esgArea] || "#888"}15`,
                    color: areaColors[row.esgArea] || "#888",
                    fontWeight: 600, whiteSpace: "nowrap",
                  }}>{row.esgArea}</span>
                </td>
                {[row.metric, row.valueDisclosed, row.unit, row.reportingYear, row.sourceSection, row.comment].map((v, j) => (
                  <td key={j} style={{
                    padding: "8px 12px",
                    color: (!v || v.toLowerCase().includes("not disclosed"))
                      ? "var(--color-text-tertiary)" : "var(--color-text-primary)",
                    fontStyle: (!v || v.toLowerCase().includes("not disclosed")) ? "italic" : "normal",
                    wordBreak: "break-word", lineHeight: 1.4,
                  }}>{v || "—"}</td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Stepper ──────────────────────────────────────────────────────────────────
function Stepper({ currentStep }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "2.5rem" }}>
      {STEPS.map((step, idx) => {
        const done = currentStep > step.id;
        const active = currentStep === step.id;
        return (
          <div key={step.id} style={{ display: "flex", alignItems: "center" }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
              <div style={{
                width: 36, height: 36, borderRadius: "50%",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 13, fontWeight: 600,
                background: done ? C.env : active ? "#1d4ed8" : "var(--color-background-secondary)",
                color: (done || active) ? "#fff" : "var(--color-text-tertiary)",
                border: active ? `2px solid #1d4ed8` : done ? `2px solid ${C.env}` : "1px solid var(--color-border-secondary)",
                boxShadow: active ? "0 0 0 4px #1d4ed820" : done ? `0 0 0 4px ${C.env}15` : "none",
                transition: "all 0.35s ease",
              }}>
                {done
                  ? <i className="ti ti-check" style={{ fontSize: 15 }} aria-hidden="true" />
                  : step.id}
              </div>
              <span style={{
                fontSize: 10.5, fontWeight: active ? 600 : 400,
                color: active ? "#1d4ed8" : done ? C.env : "var(--color-text-tertiary)",
                maxWidth: 70, textAlign: "center", lineHeight: 1.3,
              }}>{step.label}</span>
            </div>
            {idx < STEPS.length - 1 && (
              <div style={{
                width: 40, height: 2, borderRadius: 99,
                background: done ? C.env : "var(--color-border-secondary)",
                margin: "0 6px", marginBottom: 22,
                transition: "background 0.35s ease",
              }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Loading Overlay ──────────────────────────────────────────────────────────
function LoadingOverlay({ msg }) {
  const steps = [
    "Fetching and reading the document…",
    "Identifying ESG sections and disclosures…",
    "Running AI analysis and summarisation…",
    "Extracting KPIs, metrics, and scores…",
    "Finalising output…",
  ];
  return (
    <div style={{
      marginTop: 24,
      padding: "2rem",
      borderRadius: 16,
      background: "var(--color-background-secondary)",
      border: "1px solid var(--color-border-tertiary)",
      textAlign: "center",
      boxShadow: "0 2px 12px rgba(0,0,0,0.08)",
    }}>
      <div style={{ display: "flex", justifyContent: "center", marginBottom: 20 }}>
        <div style={{ position: "relative", width: 56, height: 56 }}>
          <svg width="56" height="56" style={{ position: "absolute", top: 0, left: 0 }}>
            <circle cx="28" cy="28" r="22" fill="none" stroke="var(--color-border-secondary)" strokeWidth="4" />
            <circle
              cx="28" cy="28" r="22" fill="none"
              stroke={C.env} strokeWidth="4"
              strokeDasharray="138"
              strokeLinecap="round"
              style={{ animation: "dash 1.4s ease-in-out infinite, rotate 2s linear infinite", transformOrigin: "28px 28px" }}
            />
          </svg>
          <div style={{
            position: "absolute", top: "50%", left: "50%",
            transform: "translate(-50%,-50%)",
            fontSize: 18, color: C.env,
          }}>
            <i className="ti ti-leaf" aria-hidden="true" />
          </div>
        </div>
      </div>
      <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6, color: "var(--color-text-primary)" }}>{msg}</div>
      <div style={{ fontSize: 12.5, color: "var(--color-text-tertiary)", marginBottom: 20 }}>
        AI is analysing ESG disclosures across all frameworks…
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: 340, margin: "0 auto", textAlign: "left" }}>
        {steps.map((s, i) => {
          const stepNum = i + 2;
          const done = msg !== steps[i] && steps.indexOf(msg) > i;
          const active = msg === s || (msg.includes("Fetching") && i === 0);
          return (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{
                width: 20, height: 20, borderRadius: "50%", flexShrink: 0,
                background: done ? C.env : active ? "#1d4ed8" : "var(--color-border-secondary)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 10,
                color: (done || active) ? "#fff" : "var(--color-text-tertiary)",
                transition: "all 0.3s",
              }}>
                {done ? <i className="ti ti-check" aria-hidden="true" /> : stepNum - 1}
              </div>
              <span style={{
                fontSize: 12,
                color: active ? "var(--color-text-primary)" : done ? C.env : "var(--color-text-tertiary)",
                fontWeight: active ? 500 : 400,
              }}>{s}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function ESGApp() {
  const [inputMode, setInputMode] = useState(null);
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

  const handleFileUpload = useCallback((e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) { setError("File exceeds 20MB limit."); return; }
    setFileName(file.name);
    setError("");
    const reader = new FileReader();
    reader.onload = (evt) => {
      setFileText(evt.target.result); // store as base64 data URL
    };
    reader.onerror = () => setError("Failed to read file.");
    reader.readAsDataURL(file); // read as base64
  }, []);

  const handleProcess = useCallback(async () => {
    setError("");
    setResult(null);
    let reportText = "";

    if (inputMode === "url") {
      if (!urlInput.trim()) { setError("Please enter a valid URL before proceeding."); return; }
      setLoading(true);
      setCurrentStep(2);
      setLoadingMsg("Fetching and reading the document…");
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
        setError(`Could not fetch the report: ${err.message}`);
        setLoading(false);
        setCurrentStep(1);
        return;
      }
    } else if (inputMode === "file") {
      if (!fileText) { setError("Please upload a file first."); return; }
      setLoading(true);
      setCurrentStep(2);
      setLoadingMsg("Extracting text from document...");
      try {
        const response = await fetch("/api/fetch-report", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fileData: fileText, fileName: fileName }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Failed to extract text.");
        reportText = data.text;
      } catch (err) {
        setError(`Could not read PDF: ${err.message}`);
        setLoading(false);
        setCurrentStep(1);
        return;
      }
    } else if (inputMode === "text") {
      if (!textInput.trim()) { setError("Please paste some report text before proceeding."); return; }
      if (textInput.trim().length < 200) { setError("The text is too short. Please paste more of the report content for accurate analysis."); return; }
      reportText = textInput;
    } else {
      setError("Please select an input method to get started.");
      return;
    }

    setLoading(true);
    setCurrentStep(2);
    setLoadingMsg("Fetching and reading the document…");
    await new Promise((r) => setTimeout(r, 600));

    setCurrentStep(3);
    setLoadingMsg("Identifying ESG sections and disclosures…");
    await new Promise((r) => setTimeout(r, 400));

    setCurrentStep(4);
    setLoadingMsg("Extracting KPIs, metrics, and scores…");

    try {
      const data = await callGroqAPI(reportText);
      setCurrentStep(5);
      setLoadingMsg("Finalising output…");
      await new Promise((r) => setTimeout(r, 300));
      setResult(data);
      setTimeout(() => resultRef.current?.scrollIntoView({ behavior: "smooth" }), 200);
    } catch (err) {
      setError(`Analysis failed: ${err.message}`);
      setCurrentStep(1);
    } finally {
      setLoading(false);
      setLoadingMsg("");
    }
  }, [inputMode, urlInput, textInput, fileText, fileName]);

  const handleCopy = () => {
    if (!result?.pickaxeSummary) return;
    navigator.clipboard.writeText(result.pickaxeSummary);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const totalScore = result?.scoringBreakdown?.totalScore ?? 0;
  const gradeColor = scoreColor(totalScore, 100);

  return (
    <div style={{ fontFamily: "var(--font-sans)", maxWidth: 940, margin: "0 auto", padding: "2rem 1.25rem" }}>
      <h2 className="sr-only">ESG Reporting Summariser — AI-powered ESG disclosure analysis</h2>

      {/* ── Hero ── */}
      <div style={{ textAlign: "center", marginBottom: "2.5rem" }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 4, marginBottom: 16,
          background: `${C.env}12`, border: `1px solid ${C.env}30`, borderRadius: 99,
          padding: "4px 14px", fontSize: 12, fontWeight: 600, color: C.env, letterSpacing: "0.04em" }}>
          <i className="ti ti-leaf" style={{ fontSize: 13 }} aria-hidden="true" />
          AI-POWERED ESG ANALYSIS
        </div>
        <h1 style={{ margin: "0 0 12px", fontSize: 32, fontWeight: 700, letterSpacing: "-0.02em", lineHeight: 1.2 }}>
          ESG Reporting Summariser
        </h1>
        <p style={{ margin: "0 auto 20px", maxWidth: 520, fontSize: 15, color: "var(--color-text-secondary)", lineHeight: 1.6 }}>
          Upload a corporate sustainability report and get a structured ESG disclosure summary,
          KPI table, and quality score — powered by Groq AI.
        </p>
        <div style={{ display: "flex", justifyContent: "center", gap: 24, flexWrap: "wrap" }}>
          {[
            { icon: "leaf", label: "Environmental", color: C.env },
            { icon: "users", label: "Social", color: C.social },
            { icon: "building", label: "Governance", color: C.gov },
          ].map(({ icon, label, color }) => (
            <div key={label} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--color-text-secondary)" }}>
              <i className={`ti ti-${icon}`} style={{ color, fontSize: 15 }} aria-hidden="true" />
              {label}
            </div>
          ))}
        </div>
      </div>

      {/* ── Stepper ── */}
      <Stepper currentStep={currentStep} />

      {/* ── Input Section ── */}
      {!result && (
        <div>
          {!inputMode && (
            <div style={{ marginBottom: "1.5rem" }}>
              <p style={{ textAlign: "center", fontSize: 13, color: "var(--color-text-secondary)", marginBottom: 16 }}>
                Choose how to provide the report
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
                {[
                  {
                    key: "url",
                    icon: "link",
                    label: "Report URL",
                    desc: "Paste a public link to a PDF or HTML report",
                    color: C.social,
                  },
                  {
                    key: "file",
                    icon: "file-upload",
                    label: "Upload File",
                    desc: "Upload a PDF or TXT file from your device",
                    color: C.env,
                  },
                  {
                    key: "text",
                    icon: "clipboard-text",
                    label: "Paste Text",
                    desc: "Copy and paste the report content directly",
                    color: C.gov,
                  },
                ].map((opt) => (
                  <InputCard key={opt.key} opt={opt} onClick={() => { setInputMode(opt.key); setError(""); }} />
                ))}
              </div>
            </div>
          )}

          {/* URL Input */}
          {inputMode === "url" && (
            <Card>
              <InputHeader icon="link" title="Report URL" color={C.social} onBack={() => setInputMode(null)} />
              <input
                type="url"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleProcess()}
                placeholder="https://company.com/sustainability-report-2024.pdf"
                style={{ width: "100%", boxSizing: "border-box", marginBottom: 16,
                  padding: "10px 14px", borderRadius: 10, fontSize: 13,
                  border: "1px solid var(--color-border-secondary)",
                  background: "var(--color-background-secondary)",
                  color: "var(--color-text-primary)",
                  outline: "none",
                }}
              />
              <AnalyseButton onClick={handleProcess} disabled={loading} />
            </Card>
          )}

          {/* File Upload */}
          {inputMode === "file" && (
            <Card>
              <InputHeader icon="file-upload" title="Upload Report File" color={C.env} onBack={() => setInputMode(null)} />
              <div
                onClick={() => fileRef.current?.click()}
                style={{
                  border: `2px dashed ${fileText ? C.env : "var(--color-border-secondary)"}`,
                  borderRadius: 12, padding: "2.5rem 1.5rem",
                  textAlign: "center", cursor: "pointer", marginBottom: 16,
                  background: fileText ? `${C.env}06` : "var(--color-background-secondary)",
                  transition: "all 0.2s",
                }}
              >
                <i className={`ti ti-${fileText ? "circle-check" : "file-upload"}`}
                  style={{ fontSize: 32, color: fileText ? C.env : "var(--color-text-tertiary)", display: "block", marginBottom: 10 }}
                  aria-hidden="true" />
                <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 4 }}>
                  {fileName || "Click to upload or drag file here"}
                </div>
                {fileText
                  ? <div style={{ fontSize: 12, color: C.env }}>Ready — text will be extracted on the server</div>
                  : <div style={{ fontSize: 12, color: "var(--color-text-tertiary)" }}>PDF or TXT — max 20 MB</div>
                }
                <input ref={fileRef} type="file" accept=".pdf,.txt,.md" onChange={handleFileUpload} style={{ display: "none" }} />
              </div>
              <AnalyseButton onClick={handleProcess} disabled={loading || !fileText} />
            </Card>
          )}

          {/* Text Paste */}
          {inputMode === "text" && (
            <Card>
              <InputHeader icon="clipboard-text" title="Paste Report Text" color={C.gov} onBack={() => setInputMode(null)} />
              <textarea
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                placeholder="Paste your annual report, sustainability report, ESG report, or integrated report text here…"
                style={{
                  width: "100%", boxSizing: "border-box", minHeight: 220, resize: "vertical",
                  fontFamily: "var(--font-sans)", fontSize: 13, marginBottom: 12,
                  padding: "12px 14px", borderRadius: 10,
                  border: "1px solid var(--color-border-secondary)",
                  background: "var(--color-background-secondary)",
                  color: "var(--color-text-primary)",
                  outline: "none", lineHeight: 1.6,
                }}
              />
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 12, color: textInput.length > 200 ? C.env : "var(--color-text-tertiary)" }}>
                  {textInput.length.toLocaleString()} characters{textInput.length < 200 && textInput.length > 0 ? " — need at least 200" : ""}
                </span>
                <AnalyseButton onClick={handleProcess} disabled={loading} />
              </div>
            </Card>
          )}

          {/* Error */}
          {error && <ErrorBanner message={error} />}

          {/* Loading */}
          {loading && <LoadingOverlay msg={loadingMsg} />}
        </div>
      )}

      {/* ── Results ── */}
      {result && (
        <div ref={resultRef}>
          {/* Results header */}
          <div style={{
            display: "flex", justifyContent: "space-between", alignItems: "flex-start",
            marginBottom: "1.75rem", gap: 12,
          }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: C.env }} />
                <span style={{ fontSize: 12, color: C.env, fontWeight: 600, letterSpacing: "0.05em" }}>ANALYSIS COMPLETE</span>
              </div>
              <h2 style={{ margin: "0 0 4px", fontSize: 22, fontWeight: 700 }}>
                {result.companyDetails?.name || "ESG Analysis"}
              </h2>
              <p style={{ margin: 0, fontSize: 13, color: "var(--color-text-secondary)" }}>
                {result.companyDetails?.reportType || "ESG Report"}
                {result.companyDetails?.reportingYear ? ` · ${result.companyDetails.reportingYear}` : ""}
                {result.companyDetails?.industry ? ` · ${result.companyDetails.industry}` : ""}
              </p>
            </div>
            <button
              onClick={() => { setResult(null); setCurrentStep(1); setInputMode(null); setTextInput(""); setFileText(""); setFileName(""); setUrlInput(""); }}
              style={{
                background: "none", border: "1px solid var(--color-border-secondary)",
                borderRadius: 10, padding: "7px 16px", cursor: "pointer", fontSize: 13,
                display: "flex", alignItems: "center", gap: 7, color: "var(--color-text-secondary)",
                fontWeight: 500, whiteSpace: "nowrap", flexShrink: 0,
              }}
            >
              <i className="ti ti-refresh" aria-hidden="true" />
              New Report
            </button>
          </div>

          {/* Score summary */}
          <div style={{ display: "grid", gridTemplateColumns: "auto 1fr 1fr 1fr", gap: 14, marginBottom: "1.75rem", alignItems: "stretch" }}>
            {/* Circle score */}
            <div style={{
              background: "var(--color-background-primary)",
              border: "1px solid var(--color-border-tertiary)",
              borderRadius: 16, padding: "1.25rem 1.5rem",
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
              gap: 8, boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
            }}>
              <CircleScore score={totalScore} max={100} size={110} />
              <div style={{ fontSize: 12, fontWeight: 600, color: gradeColor, textAlign: "center" }}>
                {result.scoringBreakdown?.grade?.split(" ").slice(0, 2).join(" ") || "—"}
              </div>
            </div>
            {/* Stat cards */}
            {[
              { label: "KPIs Extracted", value: result.kpiTable?.length ?? 0, color: C.social, icon: "table" },
              { label: "Disclosure Gaps", value: result.missingDisclosures?.length ?? 0, color: C.danger, icon: "alert-triangle" },
              { label: "Frameworks Found", value: result.companyDetails?.reportingFrameworks?.length ?? 0, color: C.gov, icon: "certificate" },
            ].map((c) => (
              <div key={c.label} style={{
                background: "var(--color-background-primary)",
                border: "1px solid var(--color-border-tertiary)",
                borderRadius: 16, padding: "1.25rem",
                display: "flex", flexDirection: "column", justifyContent: "space-between",
                boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: `${c.color}12`, display: "flex", alignItems: "center", justifyContent: "center", color: c.color, fontSize: 15 }}>
                    <i className={`ti ti-${c.icon}`} aria-hidden="true" />
                  </div>
                  <span style={{ fontSize: 12, color: "var(--color-text-secondary)", fontWeight: 500 }}>{c.label}</span>
                </div>
                <div style={{ fontSize: 32, fontWeight: 700, color: c.color, lineHeight: 1 }}>{c.value}</div>
              </div>
            ))}
          </div>

          {/* Tab nav */}
          <div style={{
            display: "flex", gap: 4, marginBottom: "1.25rem", flexWrap: "wrap",
            borderBottom: "1px solid var(--color-border-tertiary)", paddingBottom: 0,
          }}>
            {[
              ["overview", "ti-layout-dashboard", "Overview", null],
              ["env", "ti-leaf", "Environmental", C.env],
              ["social", "ti-users", "Social", C.social],
              ["gov", "ti-building", "Governance", C.gov],
              ["kpi", "ti-table", "KPI Table", null],
              ["score", "ti-chart-bar", "Scoring", null],
              ["pickaxe", "ti-copy", "Pickaxe", null],
            ].map(([id, icon, label, color]) => {
              const isActive = activeTab === id;
              const ac = color || "#1d4ed8";
              return (
                <button
                  key={id}
                  onClick={() => setActiveTab(id)}
                  style={{
                    padding: "8px 16px", borderRadius: "8px 8px 0 0",
                    fontSize: 13, cursor: "pointer", fontWeight: 500,
                    background: isActive ? "var(--color-background-primary)" : "transparent",
                    color: isActive ? ac : "var(--color-text-secondary)",
                    border: isActive ? `1px solid var(--color-border-tertiary)` : "1px solid transparent",
                    borderBottom: isActive ? "1px solid var(--color-background-primary)" : "1px solid transparent",
                    marginBottom: isActive ? -1 : 0,
                    display: "flex", alignItems: "center", gap: 6,
                    transition: "color 0.2s",
                  }}
                >
                  <i className={`ti ${icon}`} style={{ fontSize: 14 }} aria-hidden="true" />
                  {label}
                </button>
              );
            })}
          </div>

          {/* ── Overview ── */}
          {activeTab === "overview" && (
            <div>
              <SectionCard icon="building-community" title="Company & Report Details" color={C.social} accent>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 32px" }}>
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
                  <div style={{ marginTop: 12 }}>
                    <div style={{ fontSize: 11.5, color: "var(--color-text-secondary)", marginBottom: 6, fontWeight: 500 }}>FRAMEWORKS</div>
                    <TagList items={result.companyDetails.reportingFrameworks} color={C.social} />
                  </div>
                )}
              </SectionCard>

              <SectionCard icon="file-description" title="Executive ESG Summary" color={C.env} accent>
                <p style={{ margin: 0, fontSize: 14, lineHeight: 1.8, color: "var(--color-text-primary)" }}>
                  {result.executiveSummary}
                </p>
              </SectionCard>

              {result.missingDisclosures?.length > 0 && (
                <SectionCard icon="alert-triangle" title="Missing or Weak Disclosures" color={C.danger} accent>
                  <ul style={{ margin: 0, paddingLeft: 20, fontSize: 13, lineHeight: 1.9 }}>
                    {result.missingDisclosures.map((d, i) => (
                      <li key={i} style={{ color: "var(--color-text-primary)", marginBottom: 2 }}>{d}</li>
                    ))}
                  </ul>
                </SectionCard>
              )}

              {result.recommendations?.length > 0 && (
                <SectionCard icon="bulb" title="Recommendations for Improvement" color={C.warn} accent>
                  <ol style={{ margin: 0, paddingLeft: 20, fontSize: 13, lineHeight: 1.9 }}>
                    {result.recommendations.map((r, i) => (
                      <li key={i} style={{ color: "var(--color-text-primary)", marginBottom: 4 }}>{r}</li>
                    ))}
                  </ol>
                </SectionCard>
              )}
            </div>
          )}

          {/* ── Environmental ── */}
          {activeTab === "env" && (
            <SectionCard icon="leaf" title="Environmental Disclosures" color={C.env} accent>
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
              <StrengthsWeaknesses data={result.environmental} envColor={C.env} />
            </SectionCard>
          )}

          {/* ── Social ── */}
          {activeTab === "social" && (
            <SectionCard icon="users" title="Social Disclosures" color={C.social} accent>
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
              <StrengthsWeaknesses data={result.social} envColor={C.social} />
            </SectionCard>
          )}

          {/* ── Governance ── */}
          {activeTab === "gov" && (
            <SectionCard icon="building" title="Governance Disclosures" color={C.gov} accent>
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
              <StrengthsWeaknesses data={result.governance} envColor={C.gov} />
            </SectionCard>
          )}

          {/* ── KPI Table ── */}
          {activeTab === "kpi" && (
            <SectionCard icon="table" title="ESG KPI Table" color={C.social} accent>
              <p style={{ fontSize: 12.5, color: "var(--color-text-secondary)", marginBottom: 16, marginTop: -4 }}>
                All quantitative disclosures and metrics extracted from the report.
              </p>
              <KPITable rows={result.kpiTable} />
            </SectionCard>
          )}

          {/* ── Scoring ── */}
          {activeTab === "score" && result.scoringBreakdown && (
            <SectionCard icon="chart-bar" title="ESG Reporting Quality Score" color={gradeColor} accent>
              <div style={{ display: "flex", alignItems: "center", gap: 28, marginBottom: "1.75rem", flexWrap: "wrap" }}>
                <CircleScore score={totalScore} max={100} size={130} />
                <div>
                  <div style={{ fontSize: 28, fontWeight: 700, color: gradeColor, lineHeight: 1, marginBottom: 6 }}>
                    {result.scoringBreakdown.grade}
                  </div>
                  <p style={{ margin: 0, fontSize: 13, color: "var(--color-text-secondary)", maxWidth: 480, lineHeight: 1.6 }}>
                    {result.scoringBreakdown.overallRationale}
                  </p>
                </div>
              </div>
              <div style={{ borderTop: "1px solid var(--color-border-tertiary)", paddingTop: 16 }}>
                {[
                  ["Environmental Disclosure", result.scoringBreakdown.environmental, C.env],
                  ["Social Disclosure", result.scoringBreakdown.social, C.social],
                  ["Governance Disclosure", result.scoringBreakdown.governance, C.gov],
                  ["Metrics & Targets", result.scoringBreakdown.metricsAndTargets, C.warn],
                  ["Transparency & Balance", result.scoringBreakdown.transparencyAndBalance, "#0891b2"],
                  ["Comparability & Structure", result.scoringBreakdown.comparabilityAndStructure, "#7c3aed"],
                ].map(([label, data, color]) => data && (
                  <div key={label} style={{ marginBottom: 16 }}>
                    <ScoreBar label={label} score={data.score} max={data.maxScore} color={color} />
                    <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginTop: 3, paddingLeft: 2, lineHeight: 1.5 }}>
                      {data.rationale}
                    </div>
                  </div>
                ))}
              </div>
            </SectionCard>
          )}

          {/* ── Pickaxe ── */}
          {activeTab === "pickaxe" && (
            <SectionCard icon="copy" title="Pickaxe-Ready Summary" color={C.env} accent>
              <p style={{ fontSize: 13, color: "var(--color-text-secondary)", marginBottom: 14, marginTop: -4, lineHeight: 1.6 }}>
                Copy this structured summary and paste it directly into your Pickaxe AI tool as the knowledge source or context input.
              </p>
              <div style={{
                background: "var(--color-background-secondary)",
                border: "1px solid var(--color-border-tertiary)",
                borderRadius: 10, padding: "1.1rem",
                fontSize: 12.5, lineHeight: 1.8, whiteSpace: "pre-wrap",
                fontFamily: "var(--font-mono)",
                maxHeight: 420, overflowY: "auto",
                marginBottom: 14,
              }}>
                {result.pickaxeSummary}
              </div>
              <button
                onClick={handleCopy}
                style={{
                  background: copied ? C.env : "var(--color-background-primary)",
                  color: copied ? "#fff" : "var(--color-text-primary)",
                  border: `1px solid ${copied ? C.env : "var(--color-border-secondary)"}`,
                  borderRadius: 10, padding: "9px 20px", cursor: "pointer", fontSize: 13, fontWeight: 600,
                  display: "flex", alignItems: "center", gap: 8, transition: "all 0.2s",
                }}
              >
                <i className={`ti ti-${copied ? "check" : "copy"}`} aria-hidden="true" />
                {copied ? "Copied!" : "Copy for Pickaxe"}
              </button>
            </SectionCard>
          )}
        </div>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes rotate { to { transform: rotate(360deg); } }
        @keyframes dash {
          0% { stroke-dasharray: 1 138; stroke-dashoffset: 0; }
          50% { stroke-dasharray: 100 138; stroke-dashoffset: -35; }
          100% { stroke-dasharray: 100 138; stroke-dashoffset: -138; }
        }
      `}</style>
    </div>
  );
}

// ─── Small sub-components ─────────────────────────────────────────────────────
function InputCard({ opt, onClick }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: hovered ? `${opt.color}08` : "var(--color-background-primary)",
        border: `1px solid ${hovered ? opt.color : "var(--color-border-secondary)"}`,
        borderRadius: 14, padding: "1.5rem 1.25rem", cursor: "pointer",
        textAlign: "center", transition: "all 0.2s",
        boxShadow: hovered ? `0 4px 16px ${opt.color}18` : "0 1px 4px rgba(0,0,0,0.05)",
      }}
    >
      <div style={{
        width: 48, height: 48, borderRadius: 12, margin: "0 auto 12px",
        background: `${opt.color}15`,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 22, color: opt.color,
        transition: "transform 0.2s",
        transform: hovered ? "scale(1.08)" : "scale(1)",
      }}>
        <i className={`ti ti-${opt.icon}`} aria-hidden="true" />
      </div>
      <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 5, color: "var(--color-text-primary)" }}>{opt.label}</div>
      <div style={{ fontSize: 12.5, color: "var(--color-text-secondary)", lineHeight: 1.4 }}>{opt.desc}</div>
    </button>
  );
}

function InputHeader({ icon, title, color, onBack }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ width: 32, height: 32, borderRadius: 8, background: `${color}15`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, color }}>
          <i className={`ti ti-${icon}`} aria-hidden="true" />
        </div>
        <span style={{ fontWeight: 600, fontSize: 14 }}>{title}</span>
      </div>
      <button
        onClick={onBack}
        style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: "var(--color-text-secondary)", padding: 4, borderRadius: 6 }}
        title="Back"
      >
        <i className="ti ti-x" aria-hidden="true" />
      </button>
    </div>
  );
}

function AnalyseButton({ onClick, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        background: disabled ? "var(--color-border-secondary)" : C.env,
        color: disabled ? "var(--color-text-tertiary)" : "#fff",
        border: "none", borderRadius: 10, padding: "10px 24px",
        cursor: disabled ? "not-allowed" : "pointer",
        fontSize: 14, fontWeight: 600,
        display: "flex", alignItems: "center", gap: 8,
        transition: "all 0.2s",
        boxShadow: disabled ? "none" : `0 2px 8px ${C.env}40`,
      }}
    >
      <i className="ti ti-sparkles" aria-hidden="true" />
      Analyse Report
    </button>
  );
}

function ErrorBanner({ message }) {
  return (
    <div style={{
      marginTop: 14, padding: "12px 16px", borderRadius: 10,
      background: "#fef2f2", border: "1px solid #fecaca",
      color: C.danger, fontSize: 13, lineHeight: 1.5,
      display: "flex", alignItems: "flex-start", gap: 10,
    }}>
      <i className="ti ti-alert-circle" style={{ fontSize: 16, flexShrink: 0, marginTop: 1 }} aria-hidden="true" />
      <span>{message}</span>
    </div>
  );
}

function StrengthsWeaknesses({ data, envColor }) {
  if (!data?.keyStrengths?.length && !data?.weaknesses?.length) return null;
  return (
    <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, paddingTop: 16, borderTop: "1px solid var(--color-border-tertiary)" }}>
      {data.keyStrengths?.length > 0 && (
        <div>
          <div style={{ fontSize: 11.5, fontWeight: 600, color: C.env, marginBottom: 8, letterSpacing: "0.04em" }}>KEY STRENGTHS</div>
          <TagList items={data.keyStrengths} color={C.env} />
        </div>
      )}
      {data.weaknesses?.length > 0 && (
        <div>
          <div style={{ fontSize: 11.5, fontWeight: 600, color: C.danger, marginBottom: 8, letterSpacing: "0.04em" }}>WEAKNESSES</div>
          <TagList items={data.weaknesses} color={C.danger} />
        </div>
      )}
    </div>
  );
}
