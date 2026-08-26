import os
import json
import anthropic
from pathlib import Path
from dotenv import load_dotenv

env_path = Path(__file__).resolve().parents[2] / ".env"
load_dotenv(dotenv_path=env_path)

client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))

def summarize_judgments(query: str, judgments: list):
    judgments_text = ""
    for i, j in enumerate(judgments):
        judgments_text += f"""
Case {i+1}: {j['title']}
Court: {j['court']}
Date: {j['date']}
Citation: {j['citation']}
Snippet: {j['headline']}
---
"""

    prompt = f"""You are a legal research assistant for Indian advocates.

The advocate is researching: "{query}"

Here are {len(judgments)} relevant judgments from India Kanoon:

{judgments_text}

For each case provide:
1. One line holding — what the court actually decided
2. Key ratio — the legal principle established
3. Relevance — why this matters for the query

Be concise. Use plain English. Format each case clearly."""

    message = client.messages.create(
        model="claude-haiku-4-5",
        max_tokens=1024,
        messages=[{"role": "user", "content": prompt}]
    )

    return message.content[0].text


def analyze_document(document_text: str) -> dict:
    prompt = f"""You are a legal research assistant for Indian advocates.

A document has been uploaded. Analyze it and extract legal context.

Document content:
{document_text[:3000]}

Respond in this exact JSON format with no extra text, no markdown, no backticks:
{{
    "summary": "brief summary of the document",
    "legal_issues": ["issue 1", "issue 2"],
    "relevant_sections": ["section 1", "section 2"],
    "search_query": "relevant indian case law search query"
}}"""

    message = client.messages.create(
        model="claude-haiku-4-5",
        max_tokens=1024,
        messages=[{"role": "user", "content": prompt}]
    )

    response_text = message.content[0].text.strip()
    
    # Strip markdown code blocks if present
    if response_text.startswith("```"):
        response_text = response_text.split("```")[1]
        if response_text.startswith("json"):
            response_text = response_text[4:]
    
    try:
        return json.loads(response_text)
    except json.JSONDecodeError:
        return {
            "summary": "Document analyzed but could not extract structured data.",
            "legal_issues": ["Unable to identify specific legal issues"],
            "relevant_sections": [],
            "search_query": document_text[:100]
        }