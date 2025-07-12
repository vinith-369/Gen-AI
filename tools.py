from langchain_core.tools import tool
from datetime import datetime
from serpapi.google_search import GoogleSearch
from selenium.webdriver.support import expected_conditions as EC
import json
from langchain_core.tools import tool


# Constants and Configuration
Gemini_API_KEY = "AIzaSyDaM0twsGt6Rv5M2pY4ze4lZlKc7IQWuiQ"
SERPAPI_API_KEY ="14ac1ec6347d01ae4929d4bd869667ca444690946cb21a18d9abe23172a2cfae"


@tool
def DateAndTime() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")

@tool
def add(x: float, y: float) -> float:
    return x + y

@tool
def subtract(x: float, y: float) -> float:
    return x - y

@tool
def multiply(x: float, y: float) -> float:
    return x * y

@tool
def exponentiate(x: float, y: float) -> float:
    return x ** y

@tool
def final_answer(answer: str, tools_used: list[str]) -> str:
    return {"answer": answer, "tools_used": tools_used}

@tool
def WebSearch(query: str) -> str:
    try:
        results = GoogleSearch({"q": query, "api_key": SERPAPI_API_KEY, "engine": "google", "num": 5}).get_dict()
        if "organic_results" not in results or not results["organic_results"]:
            return json.dumps({"status": "error", "message": "No search results found."})

        processed_results = []
        for idx, res in enumerate(results.get("organic_results", [])[:2]):
            url = res.get('link', '')
            title = res.get('title', '')
            snippet = res.get("snippet", "")
            scraped_content = scrape_page_enhanced(url)
            image_analysis = analyze_page_with_gemini(url, query)
            processed_results.append({
                "source_number": idx + 1,
                "title": title,
                "url": url,
                "search_snippet": snippet,
                "full_page_content": scraped_content,
                "visual_analysis": image_analysis
            })
        return json.dumps(processed_results, indent=2)
    except Exception as e:
        return json.dumps({"status": "error", "message": f"Web search failed: {str(e)}"})
