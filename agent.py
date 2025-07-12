from langchain.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_google_genai import ChatGoogleGenerativeAI
import google.generativeai as genai
from langchain_core.messages import ToolMessage, HumanMessage, AIMessage
from langchain_core.runnables import RunnableSerializable
from langchain_core.tools import tool
from datetime import datetime
import requests
import json
import time
from PIL import Image
import io
from bs4 import BeautifulSoup
import base64
import selenium
from serpapi.google_search import GoogleSearch
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
import re



Gemini_API_KEY = "AIzaSyDaM0twsGt6Rv5M2pY4ze4lZlKc7IQWuiQ"
SERPAPI_API_KEY ="14ac1ec6347d01ae4929d4bd869667ca444690946cb21a18d9abe23172a2cfae"
NEWS_API_KEY ="d38c1bc951a94d1baf1ba87e7adda74c"

# Configure Gemini API
genai.configure(api_key=Gemini_API_KEY)
model = genai.GenerativeModel('gemini-2.5-flash')

prompt_template = ChatPromptTemplate.from_messages([
    ("system", (
        "You're a helpful assistant named s.Ai powered by google gemini. Use tools if needed to answer a user's question accurately. If you don't need a tool and already know the answer, just respond directly to the user. When you do use a tool, wait for its output in the 'scratchpad' below and then provide your answer without using more tools."
    )),
    MessagesPlaceholder(variable_name="chat_history"),
    ("human", "{input}"),
    MessagesPlaceholder(variable_name="agent_scratchpad")
])

llm = ChatGoogleGenerativeAI(
    temperature=0.7,
    api_key=Gemini_API_KEY,  
    model="gemini-2.5-flash"
)


# Tools

@tool
def add(x: float, y: float) -> float:
    """Add 'x' with 'y'."""
    return x + y

@tool
def subtract(x: float, y: float) -> float:
    """Subtract 'y' from 'x'."""
    return x - y

@tool
def multiply(x: float, y: float) -> float:
    """Multiply 'x' with 'y'."""
    return x * y

@tool
def exponentiate(x: float, y: float) -> float:
    """Raise 'x' to the power of 'y'."""
    return x ** y

@tool
def final_answer(answer: str, tools_used: list[str]) -> str:
    """Use this tool to provide a final answer to the user.if you have the answer just use this tool"""
    return {
        "answer": answer,
        "tools_used": tools_used
    }

@tool
def fetch_news(topic: str) -> str:
    """
    Fetches the latest news headlines for a given topic using NewsAPI.
    Example usage: fetch_news("AI technology")
    """
    try:
        url = (
            f"https://newsapi.org/v2/everything?"
            f"q={topic}&"
            f"sortBy=publishedAt&"
            f"language=en&"
            f"pageSize=5&"
            f"apiKey={NEWS_API_KEY}"
        )
        response = requests.get(url)
        if response.status_code != 200:
            return f"Failed to fetch news. Status code: {response.status_code}"

        articles = response.json().get("articles", [])
        if not articles:
            return "No news articles found for this topic."

        news_summary = ""
        for idx, article in enumerate(articles, 1):
            news_summary += (
                f"{idx}. {article.get('title', 'No Title')} - {article.get('source', {}).get('name', 'Unknown Source')}\n"
                f"   {article.get('url', '')}\n\n"
            )
        return news_summary.strip()

    except Exception as e:
        return f"Error occurred while fetching news: {e}"


@tool
def DateAndTime() -> str:
    """If you want to get the current date and time use this tool."""
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")

@tool
def WebSearch(query: str) -> str:
    """Use this tool to get any information from the web, including real-time events like weather, sports, or news."""
    try:
        results = GoogleSearch({
            "q": query,
            "api_key": SERPAPI_API_KEY,  # Replace with your key
            "engine": "google",
            "num": 5
        }).get_dict()

        if "organic_results" not in results or not results["organic_results"]:
            return json.dumps({"status": "error", "message": "No search results found."})

        processed_results = []
        processed_count = 0

        for res in results.get("organic_results", []):
            if processed_count >= 2:
                break

            url = res.get('link', '')
            title = res.get('title', '')
            snippet = res.get("snippet", "")

            if not url or not title:
                continue

            # Custom scraping and image analysis
            scraped_content = scrape_page_enhanced(url)  # Assume this returns a string
            image_analysis = analyze_page_with_gemini(url, query)  # Also assume returns string

            result = {
                "source_number": processed_count + 1,
                "title": title,
                "url": url,
                "search_snippet": snippet,
                "full_page_content": scraped_content,
                "visual_analysis": image_analysis
            }

            processed_results.append(result)
            processed_count += 1

        if not processed_results:
            return json.dumps({"status": "error", "message": "No accessible content found."})

        return json.dumps(processed_results, indent=2)
    except Exception as e:
        return json.dumps({"status": "error", "message": f"Web search failed: {str(e)}"})

    except Exception as e:
        return f"Enhanced search failed: {str(e)}"

def setup_chrome_driver():
    """Setup Chrome driver with optimal settings for scraping."""
    chrome_options = Options()
    chrome_options.add_argument("--headless")
    chrome_options.add_argument("--no-sandbox")
    chrome_options.add_argument("--disable-dev-shm-usage")
    chrome_options.add_argument("--disable-gpu")
    chrome_options.add_argument("--window-size=1920,1080")
    chrome_options.add_argument("--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
    chrome_options.add_argument("--disable-blink-features=AutomationControlled")
    chrome_options.add_experimental_option("excludeSwitches", ["enable-automation"])
    chrome_options.add_experimental_option('useAutomationExtension', False)
    
    driver = webdriver.Chrome(options=chrome_options)
    driver.execute_script("Object.defineProperty(navigator, 'webdriver', {get: () => undefined})")
    return driver

def scrape_page_enhanced(url):
    """Enhanced web scraping using Selenium for JavaScript-heavy sites."""
    driver = None
    try:
        driver = setup_chrome_driver()
        driver.get(url)
        
        # Wait for page to load
        time.sleep(3)
        
        # Wait for dynamic content
        try:
            WebDriverWait(driver, 10).until(
                EC.presence_of_element_located((By.TAG_NAME, "body"))
            )
        except:
            pass
        
        # Scroll to load more content
        driver.execute_script("window.scrollTo(0, document.body.scrollHeight/2);")
        time.sleep(2)
        driver.execute_script("window.scrollTo(0, document.body.scrollHeight);")
        time.sleep(2)
        
        # Get page source after JavaScript execution
        html = driver.page_source
        soup = BeautifulSoup(html, 'html.parser')
        
        # Remove unwanted elements
        for element in soup(['script', 'style', 'nav', 'header', 'footer', 'aside', 
                           'advertisement', 'ads', '.ad', '.advertisement', '.popup']):
            element.decompose()
        
        # Extract main content with multiple strategies
        content_text = extract_main_content(soup)
        
        # Clean and format text
        content_text = clean_text(content_text)
        
        # Limit to reasonable size but keep more content than before
        if len(content_text) > 3000:
            content_text = content_text[:3000] + "..."
        
        return content_text if content_text else "Content could not be extracted from this page."
        
    except Exception as e:
        # Fallback to requests-based scraping
        return scrape_page_fallback(url)
    finally:
        if driver:
            driver.quit()

def extract_main_content(soup):
    """Extract main content using multiple strategies."""
    content_text = ""
    
    # Strategy 1: Look for specific content containers
    main_selectors = [
        'main', 'article', '[role="main"]', '.main-content', '.content',
        '.post-content', '.entry-content', '#content', '.article-body',
        '.chapter-content', '.manga-content', '.story-content',
        '.page-content', '.primary-content', '.main-article'
    ]
    
    for selector in main_selectors:
        main_content = soup.select_one(selector)
        if main_content:
            content_text = main_content.get_text(separator=' ', strip=True)
            if len(content_text) > 200:  # Ensure we got substantial content
                break
    
    # Strategy 2: Get all paragraphs and divs with substantial text
    if not content_text or len(content_text) < 200:
        text_elements = soup.find_all(['p', 'div', 'span', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'])
        text_blocks = []
        for element in text_elements:
            text = element.get_text(strip=True)
            if len(text) > 20:  # Only include substantial text blocks
                text_blocks.append(text)
        content_text = ' '.join(text_blocks)
    
    # Strategy 3: Get all visible text as last resort
    if not content_text or len(content_text) < 100:
        content_text = soup.get_text(separator=' ', strip=True)
    
    return content_text

def clean_text(text):
    """Clean and format extracted text."""
    if not text:
        return ""
    
    # Remove excessive whitespace
    text = re.sub(r'\s+', ' ', text)
    
    # Remove common unwanted phrases
    unwanted_phrases = [
        'We\'re sorry but',
        'JavaScript enabled',
        'Enable JavaScript',
        'This website requires JavaScript',
        'Please enable cookies',
        'Accept cookies'
    ]
    
    for phrase in unwanted_phrases:
        text = text.replace(phrase, '')
    
    # Split into sentences and clean
    sentences = text.split('.')
    clean_sentences = []
    
    for sentence in sentences:
        sentence = sentence.strip()
        if len(sentence) > 10 and not sentence.lower().startswith('advertisement'):
            clean_sentences.append(sentence)
    
    return '. '.join(clean_sentences)

def scrape_page_fallback(url):
    """Fallback scraping method using requests."""
    try:
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
            'Accept-Encoding': 'gzip, deflate',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
        }
        
        response = requests.get(url, timeout=10, headers=headers, allow_redirects=True)
        response.raise_for_status()
        
        soup = BeautifulSoup(response.text, 'html.parser')
        content_text = extract_main_content(soup)
        content_text = clean_text(content_text)
        
        if len(content_text) > 2000:
            content_text = content_text[:2000] + "..."
        
        return content_text if content_text else "Content could not be extracted from this page."
        
    except Exception as e:
        return f"Failed to access page: {str(e)}"

def analyze_page_with_gemini(url, original_query):
    """Take screenshot of page and analyze with Gemini 2.0 Flash."""
    driver = None
    try:
        driver = setup_chrome_driver()
        driver.get(url)
        time.sleep(3)
        
        # Take screenshot
        screenshot = driver.get_screenshot_as_png()
        
        # Convert to PIL Image
        image = Image.open(io.BytesIO(screenshot))
        
        # Analyze with Gemini
        prompt = f"""
        Analyze this webpage screenshot in the context of this search query: "{original_query}"
        
        Please provide:
        1. What key information is visible on this page?
        2. Are there any specific numbers, dates, or details relevant to the query?
        3. What is the main content or purpose of this page?
        4. Any visual elements that might contain important information (charts, tables, highlighted text)?
        
        Focus on extracting factual information that directly answers or relates to the search query.
        """
        
        response = model.generate_content([prompt, image])
        return response.text
        
    except Exception as e:
        return f"Visual analysis failed: {str(e)}"
    finally:
        if driver:
            driver.quit()

            
tools = [final_answer, add, multiply, exponentiate, subtract, WebSearch, DateAndTime, fetch_news]
name2tool = {tool.name: tool.func for tool in tools}

class StreamingAgentExecutor:
    def __init__(self, max_iterations: int = 5):
        self.chat_history = []
        self.max_iterations = max_iterations
        self.agent: RunnableSerializable = (
            {
                "input": lambda x: x["input"],
                "chat_history": lambda x: x["chat_history"],
                "agent_scratchpad": lambda x: x.get("agent_scratchpad", [])
            }
            | prompt_template
            | llm.bind_tools(tools, tool_choice="auto")
        )
    
    def stream_invoke(self, input_text: str):
        """Generator that yields reasoning steps and final response"""
        count = 0
        agent_scratchpad = []
        
        yield {
            "type": "thinking_start",
            "message": "Analyzing your request..."
        }
        
        while count < self.max_iterations:
            try:
                tool_call = self.agent.invoke({
                    "input": input_text,
                    "chat_history": self.chat_history,
                    "agent_scratchpad": agent_scratchpad
                })
                
                # Check if there are tool calls
                if not tool_call.tool_calls:
                    # Direct response without tools
                    yield {
                        "type": "response_chunk",
                        "content": tool_call.content
                    }
                    
                    self.chat_history.extend([
                        HumanMessage(content=input_text),
                        AIMessage(content=tool_call.content)
                    ])
                    break
                
                agent_scratchpad.append(tool_call)
                tool_name = tool_call.tool_calls[0]["name"]
                tool_call_id = tool_call.tool_calls[0]["id"]
                tool_args = tool_call.tool_calls[0]["args"]
                
                # Yield tool usage info
                yield {
                    "type": "tool_use",
                    "tool_name": tool_name,
                    "tool_args": tool_args,
                    "step": count + 1
                }
                
                # Execute tool
                tool_output = name2tool[tool_name](**tool_args)
                
                # Yield tool output
                yield {
                    "type": "tool_output",
                    "tool_name": tool_name,
                    "output": tool_output,
                    "step": count + 1
                }
                
                tool_message = ToolMessage(
                    content=f"{tool_output}",
                    tool_call_id=tool_call_id,
                )
                agent_scratchpad.append(tool_message)
                count += 1
                
                if tool_name == "final_answer":
                    final_response = tool_output["answer"]
                    
                    # Stream the response character by character
                    for char in final_response:
                        yield {
                            "type": "response_chunk",
                            "content": char
                        }
                        time.sleep(0.02)  # Simulate typing
                    
                    self.chat_history.extend([
                        HumanMessage(content=input_text),
                        AIMessage(content=final_response)
                    ])
                    break
                    
            except Exception as e:
                yield {
                    "type": "error",
                    "message": f"Error: {str(e)}"
                }
                break
        
        yield {
            "type": "thinking_end"
        }