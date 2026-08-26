from fastapi import FastAPI, HTTPException, Request, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from app.services.kanoon import search_judgments
from app.services.ai import summarize_judgments, analyze_document
from app.services.document import extract_text
import re

limiter = Limiter(key_func=get_remote_address)
app = FastAPI(title="KORD", version="0.1.0")
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

def sanitize_query(query: str) -> str:
    if not query or len(query.strip()) == 0:
        raise HTTPException(status_code=400, detail="Query cannot be empty")
    if len(query) > 300:
        raise HTTPException(status_code=400, detail="Query too long. Max 300 characters")
    query = re.sub(r'[<>{}|\\/^`]', '', query)
    query = query.strip()
    return query

@app.get("/")
def root():
    return {"status": "KORD is live"}

@app.get("/search")
@limiter.limit("20/minute")
def search(request: Request, query: str, page: int = 0):
    query = sanitize_query(query)
    return search_judgments(query, page)

@app.get("/analyze")
@limiter.limit("10/minute")
def analyze(request: Request, query: str, page: int = 0):
    query = sanitize_query(query)
    search_results = search_judgments(query, page)
    if "error" in search_results:
        return search_results
    summary = summarize_judgments(query, search_results["results"])
    return {
        "query": query,
        "summary": summary,
        "results": search_results["results"]
    }

@app.post("/analyze-document")
@limiter.limit("5/minute")
async def analyze_document_endpoint(request: Request, file: UploadFile = File(...)):
    if not file.filename.endswith((".pdf", ".docx")):
        raise HTTPException(status_code=400, detail="Only PDF and DOCX files are supported")
    
    if file.size and file.size > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large. Max 10MB")
    
    file_bytes = await file.read()
    
    text = extract_text(file_bytes, file.filename)
    
    if not text or len(text.strip()) < 50:
        raise HTTPException(status_code=400, detail="Could not extract text from document")
    
    doc_analysis = analyze_document(text)
    
    search_results = search_judgments(doc_analysis["search_query"], 0)
    
    summary = summarize_judgments(doc_analysis["search_query"], search_results["results"])
    
    return {
        "document_summary": doc_analysis["summary"],
        "legal_issues": doc_analysis["legal_issues"],
        "relevant_sections": doc_analysis["relevant_sections"],
        "search_query_used": doc_analysis["search_query"],
        "ai_analysis": summary,
        "results": search_results["results"]
    }