from langchain_google_genai import ChatGoogleGenerativeAI
from langchain.agents import initialize_agent
import datetime
from langchain_core.tools import tool

Gemini_API_KEY = "AIzaSyDaM0twsGt6Rv5M2pY4ze4lZlKc7IQWuiQ"

llm = ChatGoogleGenerativeAI(model="gemini-2.5-flash", api_key=Gemini_API_KEY)

@tool
def DateAndTime(input: str) -> str:
    """Returns the current date and time, ignores input."""
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


@tool
def get_system_time(format: str = "%Y-%m-%d %H:%M:%S"):
    """ Returns the current date and time in the specified format """

    current_time = datetime.datetime.now()
    formatted_time = current_time.strftime(format)
    return formatted_time


tools = [DateAndTime, get_system_time]

agent = initialize_agent(llm=llm, agent="zero-shot-react-description", tools=tools, verbose=True)

result = agent.invoke("may 16 2005 how many day from that day to today")
print(result)
