"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const API_ANALYZE = "http://localhost:8000/analyze";
const API_ANALYZE_DOCUMENT = "http://localhost:8000/analyze-document";
const MAX_BYTES = 10 * 1024 * 1024;

const NOISE_SVG = encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="180" height="180">
    <filter id="n">
      <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="4" stitchTiles="stitch"/>
    </filter>
    <rect width="100%" height="100%" filter="url(#n)" opacity="0.45"/>
  </svg>`
);

function getString(value) {
  if (value == null) return "";
  return String(value);
}

function escapeHtml(input) {
  return getString(input)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function replaceBenchStrengthIndicators(text) {
  return getString(text)
    .replaceAll("⬛⬛⬛⬛⬛", "⚖️⚖️⚖️⚖️⚖️")
    .replaceAll("⬛⬛⬛", "⚖️⚖️⚖️")
    .replaceAll("⬛⬛", "⚖️⚖️")
    .replaceAll("⬛", "⚖️");
}

function renderBasicMarkdownToHtml(markdown) {
  const lines = getString(markdown).split("\n");
  const html = lines
    .map((rawLine) => {
      const line = rawLine.trimEnd();
      const trimmed = line.trim();

      if (!trimmed) return `<div class="h-3"></div>`;

      if (/^-{3,}$/.test(trimmed)) {
        return `<hr class="my-5 border-[#1E1E22]" />`;
      }

      const headerMatch = /^(#{1,3})\s+(.*)$/.exec(trimmed);
      if (headerMatch) {
        const level = headerMatch[1].length;
        const text = escapeHtml(headerMatch[2]);
        const withBold = text.replaceAll(
          /\*\*(.+?)\*\*/g,
          "<strong class=\"text-white\">$1</strong>"
        );
        const className =
          level === 1
            ? "text-base font-semibold text-white mt-2"
            : level === 2
              ? "text-sm font-semibold text-white mt-2"
              : "text-sm font-semibold text-white mt-2";
        return `<div class="${className} mb-2">${withBold}</div>`;
      }

      const labelMatch =
        /^(?:\*\*)?(Holding|Key Ratio|Relevance)(?:\*\*)?:\s*(.*)$/i.exec(
          trimmed
        );
      if (labelMatch) {
        const label = escapeHtml(labelMatch[1]);
        const rest = escapeHtml(labelMatch[2] ?? "").replaceAll(
          /\*\*(.+?)\*\*/g,
          "<strong class=\"text-white\">$1</strong>"
        );
        return `<div class="text-sm leading-6"><span class="font-semibold text-[#A0A0A0]">${label}:</span> <span class="text-[#A0A0A0]">${rest}</span></div>`;
      }

      const safe = escapeHtml(line).replaceAll(
        /\*\*(.+?)\*\*/g,
        "<strong class=\"text-white\">$1</strong>"
      );
      return `<div class="text-sm leading-6 text-[#A0A0A0]">${safe}</div>`;
    })
    .join("");

  return html;
}

function normalizeResults(payload) {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.results)) return payload.results;
  if (Array.isArray(payload.data)) return payload.data;
  return [];
}

function normalizeJudgment(raw, index) {
  const caseTitle =
    raw.case_title || raw.caseTitle || raw.title || raw.case_name || raw.name;
  const tid = raw.tid || raw.TID || raw.doc_tid || raw.document_tid;
  const court = raw.court || raw.court_name || raw.courtName || raw.bench;
  const date = raw.date || raw.decision_date || raw.decisionDate || raw.year;
  const citation = raw.citation || raw.cite || raw.neutral_citation;
  const headline =
    raw.headline ||
    raw.snippet ||
    raw.summary ||
    raw.headnote ||
    raw.headnotes ||
    raw.text_snippet;

  return {
    id: raw.id || raw.doc_id || raw.document_id || raw.url || `${index}`,
    tid: getString(tid) || "",
    caseTitle: getString(caseTitle) || "Untitled case",
    court: getString(court) || "Court not specified",
    date: getString(date) || "Date not specified",
    citation: getString(citation) || "Citation not specified",
    headline: getString(headline) || "",
  };
}

function asStringArray(value) {
  if (!Array.isArray(value)) return [];
  return value.map((v) => getString(v).trim()).filter(Boolean);
}

export default function Home() {
  const [tab, setTab] = useState("search");
  const [query, setQuery] = useState("");
  const [file, setFile] = useState(null);
  const [dragOver, setDragOver] = useState(false);

  const [summaryMarkdown, setSummaryMarkdown] = useState("");
  const [documentSummary, setDocumentSummary] = useState("");
  const [legalIssues, setLegalIssues] = useState([]);
  const [relevantSections, setRelevantSections] = useState([]);
  const [results, setResults] = useState([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [hasSubmitted, setHasSubmitted] = useState(false);

  const abortRef = useRef(null);
  const fileInputRef = useRef(null);

  const trimmedQuery = useMemo(() => query.trim(), [query]);

  useEffect(() => {
    return () => {
      if (abortRef.current) abortRef.current.abort();
    };
  }, []);

  const resetResults = useCallback(() => {
    setSummaryMarkdown("");
    setDocumentSummary("");
    setLegalIssues([]);
    setRelevantSections([]);
    setResults([]);
  }, []);

  async function runTextAnalyze() {
    const q = trimmedQuery;
    setHasSubmitted(true);
    setError("");
    resetResults();

    if (!q) {
      setError("Enter a search query.");
      return;
    }

    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    try {
      const url = `${API_ANALYZE}?query=${encodeURIComponent(q)}`;
      const res = await fetch(url, { signal: controller.signal });
      const payload = await res.json().catch(() => ({}));

      if (!res.ok) {
        const detail = payload?.detail;
        const detailMsg = Array.isArray(detail)
          ? detail.map((d) => getString(d?.msg ?? d)).filter(Boolean).join(" ")
          : typeof detail === "string"
            ? detail
            : "";
        throw new Error(detailMsg || `Request failed (${res.status})`);
      }

      if (payload?.error) {
        throw new Error(
          getString(payload.error) || "Research service unavailable."
        );
      }

      setSummaryMarkdown(getString(payload?.summary));
      const normalized = normalizeResults(payload).map(normalizeJudgment);
      setResults(normalized);
    } catch (e) {
      if (e?.name === "AbortError") return;
      resetResults();
      setError(e?.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  async function runDocumentAnalyze(selectedFile) {
    setHasSubmitted(true);
    setError("");
    resetResults();

    if (!selectedFile) {
      setError("Choose a PDF or DOCX file.");
      return;
    }

    if (selectedFile.size > MAX_BYTES) {
      setError("File too large. Maximum size is 10MB.");
      return;
    }

    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const formData = new FormData();
    formData.append("file", selectedFile);

    setLoading(true);
    try {
      const res = await fetch(API_ANALYZE_DOCUMENT, {
        method: "POST",
        body: formData,
        signal: controller.signal,
      });
      const payload = await res.json().catch(() => ({}));

      if (!res.ok) {
        const detail = payload?.detail;
        const detailMsg = Array.isArray(detail)
          ? detail.map((d) => getString(d?.msg ?? d)).filter(Boolean).join(" ")
          : typeof detail === "string"
            ? detail
            : "";
        throw new Error(detailMsg || `Upload failed (${res.status})`);
      }

      setDocumentSummary(getString(payload?.document_summary));
      setLegalIssues(asStringArray(payload?.legal_issues));
      setRelevantSections(asStringArray(payload?.relevant_sections));
      setSummaryMarkdown(
        getString(payload?.ai_analysis ?? payload?.summary ?? "")
      );
      const normalized = normalizeResults(payload).map(normalizeJudgment);
      setResults(normalized);
    } catch (e) {
      if (e?.name === "AbortError") return;
      resetResults();
      setError(e?.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  function onDropFiles(e) {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer?.files?.[0];
    if (f) setFile(f);
  }

  const showAnalysisBlock =
    Boolean(summaryMarkdown) ||
    Boolean(documentSummary) ||
    legalIssues.length > 0 ||
    relevantSections.length > 0;

  return (
    <div
      className="relative min-h-screen bg-[#0A0A0B] text-[#A0A0A0] antialiased"
      style={{
        fontFamily:
          'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
      }}
    >
      <div
        className="pointer-events-none fixed inset-0 z-0 opacity-[0.04]"
        style={{
          backgroundImage: `url("data:image/svg+xml,${NOISE_SVG}")`,
          backgroundRepeat: "repeat",
        }}
        aria-hidden
      />

      <header className="relative z-10 border-b border-[#1E1E22]">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
          <Link
            href="/"
            className="text-[15px] font-extralight tracking-[0.28em] text-white transition hover:text-white/90 focus-visible:outline-none focus-visible:shadow-[0_0_30px_rgba(46,91,255,0.15)]"
          >
            KORD
          </Link>
          <p className="max-w-[min(420px,46vw)] text-right text-[10px] font-medium uppercase leading-snug tracking-[0.22em] text-[#A0A0A0]">
            The Architecture of Ultimate Efficiency
          </p>
        </div>
      </header>

      <main className="relative z-10">
        <section className="mx-auto flex min-h-[calc(100dvh-3.5rem)] max-w-4xl flex-col justify-center px-6 py-16">
          <div className="text-center">
            <h1 className="text-balance text-[clamp(2rem,6vw,3.25rem)] font-semibold tracking-[-0.02em] text-white">
              ELIMINATE INEFFICIENCY.
            </h1>
            <p className="mx-auto mt-5 max-w-xl text-pretty text-sm leading-relaxed text-[#A0A0A0] sm:text-base">
              Supreme Court precedent mapping. Hallucination-free citations.
            </p>
          </div>

          <div className="mx-auto mt-12 flex w-full max-w-2xl gap-3">
            <button
              type="button"
              onClick={() => {
                setTab("search");
                setError("");
              }}
              className={`min-h-[44px] flex-1 rounded-[4px] border px-4 text-[11px] font-semibold uppercase tracking-[0.2em] transition focus-visible:outline-none focus-visible:shadow-[0_0_30px_rgba(46,91,255,0.15)] ${
                tab === "search"
                  ? "border-[#2E5BFF] bg-[#2E5BFF] text-white"
                  : "border-[#2E5BFF] bg-transparent text-[#A0A0A0] hover:text-white"
              }`}
            >
              Text search
            </button>
            <button
              type="button"
              onClick={() => {
                setTab("upload");
                setError("");
              }}
              className={`min-h-[44px] flex-1 rounded-[4px] border px-4 text-[11px] font-semibold uppercase tracking-[0.2em] transition focus-visible:outline-none focus-visible:shadow-[0_0_30px_rgba(46,91,255,0.15)] ${
                tab === "upload"
                  ? "border-[#2E5BFF] bg-[#2E5BFF] text-white"
                  : "border-[#2E5BFF] bg-transparent text-[#A0A0A0] hover:text-white"
              }`}
            >
              Upload document
            </button>
          </div>

          <div className="mx-auto mt-10 w-full max-w-2xl">
            {tab === "search" ? (
              <form
                className="flex flex-col gap-3 sm:flex-row sm:items-stretch"
                onSubmit={(e) => {
                  e.preventDefault();
                  runTextAnalyze();
                }}
              >
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Describe your legal issue or enter case keywords..."
                  className="min-h-[48px] flex-1 rounded-[4px] border border-[#2E2E35] bg-[#111113] px-4 text-sm text-white outline-none transition placeholder:text-[#707070] focus:border-[#2E2E35] focus:shadow-[0_0_30px_rgba(46,91,255,0.15)]"
                  disabled={loading}
                />
                <button
                  type="submit"
                  disabled={loading}
                  className="min-h-[48px] rounded-[4px] border border-[#2E5BFF] bg-[#2E5BFF] px-6 text-[11px] font-semibold uppercase tracking-[0.2em] text-white transition hover:shadow-[0_0_30px_rgba(46,91,255,0.15)] focus-visible:outline-none focus-visible:shadow-[0_0_30px_rgba(46,91,255,0.15)] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Search
                </button>
              </form>
            ) : (
              <div className="space-y-4">
                <div
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      fileInputRef.current?.click();
                    }
                  }}
                  onDragEnter={(e) => {
                    e.preventDefault();
                    setDragOver(true);
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOver(true);
                  }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={onDropFiles}
                  onClick={() => fileInputRef.current?.click()}
                  className={`cursor-pointer rounded-[4px] border border-dashed bg-[#111113] px-6 py-16 text-center transition focus-visible:outline-none focus-visible:shadow-[0_0_30px_rgba(46,91,255,0.15)] ${
                    dragOver
                      ? "border-[#2E5BFF] shadow-[0_0_30px_rgba(46,91,255,0.15)]"
                      : "border-[#1E1E22]"
                  }`}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) setFile(f);
                    }}
                  />
                  <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[#A0A0A0]">
                    Drop your document here
                  </p>
                  <p className="mt-3 text-xs text-[#707070]">
                    Supported: PDF, DOCX — Max 10MB
                  </p>
                  {file ? (
                    <p className="mt-5 text-sm font-medium text-[#2E5BFF]">
                      {file.name}
                    </p>
                  ) : null}
                </div>

                <button
                  type="button"
                  disabled={loading || !file}
                  onClick={() => runDocumentAnalyze(file)}
                  className="h-12 w-full rounded-[4px] border border-[#2E5BFF] bg-[#2E5BFF] text-[11px] font-semibold uppercase tracking-[0.24em] text-white transition hover:shadow-[0_0_30px_rgba(46,91,255,0.15)] focus-visible:outline-none focus-visible:shadow-[0_0_30px_rgba(46,91,255,0.15)] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Analyze document
                </button>
              </div>
            )}

            {error ? (
              <div className="mt-4 rounded-[4px] border border-[#1E1E22] bg-[#111113] px-4 py-3 text-sm text-[#A0A0A0]">
                {error}
              </div>
            ) : null}
          </div>
        </section>

        {hasSubmitted ? (
          <section className="mx-auto max-w-4xl px-6 pb-24 pt-4">
            <div className="mb-8 flex items-center gap-4">
              <span className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[#2E5BFF]">
                AI analysis
              </span>
              <span className="h-px flex-1 bg-[#2E5BFF]/60" />
            </div>

            {loading ? (
              <div className="space-y-4">
                <LoadingBlock />
                <LoadingBlock />
                <LoadingBlock />
              </div>
            ) : (
              <>
                {showAnalysisBlock ? (
                  <div className="rounded-[4px] border border-[#1E1E22] bg-[#111113] p-6">
                    {documentSummary ? (
                      <p className="text-sm leading-relaxed text-white">
                        {documentSummary}
                      </p>
                    ) : null}
                    {documentSummary && summaryMarkdown ? (
                      <div className="my-6 h-px bg-[#1E1E22]" />
                    ) : null}
                    {summaryMarkdown ? (
                      <div
                        className="max-w-none text-sm leading-relaxed"
                        dangerouslySetInnerHTML={{
                          __html: renderBasicMarkdownToHtml(
                            replaceBenchStrengthIndicators(summaryMarkdown)
                          ),
                        }}
                      />
                    ) : null}
                  </div>
                ) : null}

                {(legalIssues.length > 0 || relevantSections.length > 0) && (
                  <div className="mt-8 space-y-6">
                    {legalIssues.length > 0 ? (
                      <div>
                        <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.22em] text-[#707070]">
                          Legal issues
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {legalIssues.map((issue) => (
                            <span
                              key={issue}
                              className="rounded-[4px] border border-[#1E1E22] bg-[#1E1E22] px-3 py-1.5 text-xs text-white"
                            >
                              {issue}
                            </span>
                          ))}
                        </div>
                      </div>
                    ) : null}
                    {relevantSections.length > 0 ? (
                      <div>
                        <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.22em] text-[#707070]">
                          Relevant sections
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {relevantSections.map((s) => (
                            <span
                              key={s}
                              className="rounded-[4px] border border-[#1E1E22] bg-[#1E1E22] px-3 py-1.5 text-xs text-white"
                            >
                              {s}
                            </span>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                )}

                <div className="mt-10 space-y-3">
                  {results.length === 0 && !loading && !showAnalysisBlock ? (
                    <div className="rounded-[4px] border border-[#1E1E22] bg-[#111113] px-6 py-12 text-center">
                      <p className="text-sm text-white">No judgments found</p>
                      <p className="mt-2 text-sm text-[#707070]">
                        Refine your query or try alternate keywords.
                      </p>
                    </div>
                  ) : null}

                  {results.map((result) => (
                    <a
                      key={result.id}
                      href={
                        result.tid
                          ? `https://indiankanoon.org/doc/${result.tid}/`
                          : "#"
                      }
                      target="_blank"
                      rel="noreferrer"
                      className={`group block rounded-[4px] border border-[#1E1E22] bg-[#111113] p-5 transition hover:border-[#1E1E22] hover:shadow-[0_0_30px_rgba(46,91,255,0.15)] focus-visible:outline-none focus-visible:shadow-[0_0_30px_rgba(46,91,255,0.15)] ${
                        result.tid
                          ? "border-l-2 border-l-transparent hover:border-l-[#2E5BFF]"
                          : "pointer-events-none opacity-60"
                      }`}
                    >
                      <div className="text-base font-medium text-white">
                        {result.caseTitle}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-[#A0A0A0]">
                        <span>{result.court}</span>
                        <span>{result.date}</span>
                        {result.citation ? (
                          <span className="text-[#707070]">
                            {result.citation}
                          </span>
                        ) : null}
                      </div>
                      {result.headline ? (
                        <p className="mt-3 text-sm leading-relaxed text-[#707070]">
                          {result.headline}
                        </p>
                      ) : null}
                    </a>
                  ))}
                </div>
              </>
            )}
          </section>
        ) : null}
      </main>

      <footer className="relative z-10 border-t border-[#1E1E22]">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-6 py-8 text-sm sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[#A0A0A0]">KORD — Built for Bharat&apos;s Courts</p>
          <a
            href="mailto:singhyash282001@gmail.com"
            className="text-[#A0A0A0] transition hover:text-white focus-visible:outline-none focus-visible:shadow-[0_0_30px_rgba(46,91,255,0.15)]"
          >
            singhyash282001@gmail.com
          </a>
        </div>
      </footer>
    </div>
  );
}

function LoadingBlock() {
  return (
    <div className="kord-loading-pulse rounded-[4px] border border-[#1E1E22] bg-[#111113] p-5">
      <div className="h-4 w-2/3 bg-[#1E1E22]" />
      <div className="mt-4 h-3 w-1/2 bg-[#1E1E22]" />
      <div className="mt-3 h-3 w-full bg-[#1E1E22]" />
    </div>
  );
}
