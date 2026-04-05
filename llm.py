from dotenv import load_dotenv
load_dotenv()
from groq import Groq
import os

client = Groq(api_key=os.environ.get("GROQ_API_KEY"))

def classify_email(subject, body):
    prompt = f"""You are an email classifier. Classify this email into exactly one category.
Reply with only one word: SCHEDULE, UPDATE, or OTHER.

Subject: {subject}
Body: {body[:500]}

Category:"""

    response = client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[{"role": "user", "content": prompt}],
        max_tokens=10
    )
    return response.choices[0].message.content.strip().upper()

if __name__ == '__main__':
    # Test it
    result = classify_email(
        "Meeting request",
        "Hi, can we meet tomorrow at 3pm to discuss the project?"
    )
    print(f"Classification: {result}")