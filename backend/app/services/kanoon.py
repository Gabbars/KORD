import requests
import os
from dotenv import load_dotenv
from pathlib import Path

# Explicitly point to the .env file
env_path = Path(__file__).resolve().parents[2] / ".env"
load_dotenv(dotenv_path=env_path)

KANOON_API_KEY = os.getenv("KANOON_API_KEY")
BASE_URL = "https://api.indiankanoon.org"

def search_judgments(query: str, page: int = 0):
    response = requests.post(
        f"{BASE_URL}/search/",
        headers={"Authorization": f"Token {KANOON_API_KEY}"},
        data={"formInput": query, "pagenum": page}
    )
    
    if response.status_code != 200:
        return {"error": "India Kanoon API failed", "status": response.status_code}
    
    data = response.json()
    docs = data.get("docs", [])
    
    results = []
    for doc in docs:
        results.append({
            "tid": doc.get("tid"),
            "title": doc.get("title"),
            "court": doc.get("docsource"),
            "date": doc.get("publishdate"),
            "citation": doc.get("citation"),
            "headline": doc.get("headline"),
        })
    
    return {"total": len(results), "results": results}