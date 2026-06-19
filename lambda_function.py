import json
import boto3
import time
import logging
import re
import urllib.request
import urllib.parse
from datetime import datetime
from decimal import Decimal
from boto3.dynamodb.conditions import Key

logger = logging.getLogger()
logger.setLevel(logging.INFO)

dynamodb   = boto3.resource("dynamodb", region_name="us-east-1")
chat_table = dynamodb.Table("KatimChatHistory")
bedrock    = boto3.client("bedrock-runtime", region_name="us-east-1")

BEDROCK_MODEL    = "us.anthropic.claude-haiku-4-5-20251001-v1:0"
PACKAGE_API_BASE = "http://api-spring-ec2.duckdns.org/api/public/packages/list"  

def load_history(session_id, limit=8):
    try:
        r = chat_table.query(
            KeyConditionExpression=Key("session_id").eq(session_id),
            ScanIndexForward=False,
            Limit=limit
        )
        return list(reversed(r.get("Items", [])))
    except Exception as e:
        logger.error(f"History load error: {e}")
        return []

def save_message(session_id, role, content):
    try:
        chat_table.put_item(Item={
            "session_id": session_id,
            "timestamp":  str(int(time.time() * 1000)),
            "role":       role,
            "content":    content,
            "expireAt":   int(time.time()) + (24 * 3600)  # expire after 1 day
        })
    except Exception as e:
        logger.error(f"Save message error: {e}")

# ── JSON extraction ───────────────────────────────────────────────────────────
def extract_json(text):
    if "```json" in text:
        text = text.split("```json")[1].split("```")[0]
    elif "```" in text:
        text = text.split("```")[1]
    text = text.strip()
    try:
        return json.loads(text)
    except:
        match = re.search(r'\{(?:[^{}]|(?:\{[^{}]*\}))*\}', text, re.DOTALL)
        if match:
            return json.loads(match.group(0))
        raise ValueError("No JSON found")

# ── Package search ────────────────────────────────────────────────────────────
def execute_package_search(params):
    try:
        destination = params.get("destination", "")
        budget      = params.get("budget")

        query = urllib.parse.urlencode({
            "page": 0,
            "size": 20
        })

        url = f"{PACKAGE_API_BASE}/api/public/packages/list?{query}"
        logger.info(f"Calling package API: {url}")

        req = urllib.request.Request(
            url=url,
            method="GET",
            headers={"Accept": "application/json"}
        )

        with urllib.request.urlopen(req, timeout=10) as res:
            data = json.loads(res.read())

        if isinstance(data, list):
            packages = data
        elif isinstance(data, dict):
            packages = data.get("data") or []
        else:
            packages = []

        logger.info(f"API returned {len(packages)} packages")

        # Filter by destination if provided (match against title and description)
        if destination:
            dest_lower = destination.lower()
            filtered = [
                p for p in packages
                if dest_lower in str(p.get("title", "")).lower()
                or dest_lower in str(p.get("description", "")).lower()
            ]
            if filtered:
                packages = filtered

        # Filter by budget if provided
        if budget:
            try:
                max_budget = float(str(budget).replace("$", "").replace(",", ""))
                budget_filtered = [
                    p for p in packages
                    if float(p.get("startingPrice") or 0) <= max_budget
                ]
                if budget_filtered:
                    packages = budget_filtered
            except:
                pass

        # Normalize to clean format
        normalized = []
        for p in packages[:5]:
            raw_desc   = p.get("description") or ""
            clean_desc = re.sub(r'<[^>]+>', '', raw_desc).strip()

            normalized.append({
                "id":          str(p.get("id") or ""),
                "name":        p.get("title", "Travel Package"),
                "description": clean_desc[:200],
                "price":       float(p.get("startingPrice") or 0),
                "duration":    p.get("numberOfDays") or 0,
                "image":       p.get("cardImage") or None,
                "featured":    p.get("featured", False),
                "operator":    p.get("tourOperatorName") or None
            })

        logger.info(f"Returning {len(normalized)} normalized packages")
        return normalized

    except Exception as e:
        logger.error(f"Package search error: {e}")
        return []

# ── System prompt ─────────────────────────────────────────────────────────────
def build_system_prompt(current_date):
    return f"""You are Katim AI, the official travel advisor for Katim Travels — a premium travel company based in East Africa.

TODAY: {current_date}

---

WHO YOU ARE:
You are warm, knowledgeable, and genuinely passionate about travel. You have deep knowledge of destinations across Africa, the Middle East, Europe, and Asia. You make customers feel like they are talking to a trusted friend who happens to know everything about travel — not a bot reading from a script.

---

YOUR CAPABILITIES:
1. Understand what the customer is looking for
2. Search and present travel packages that match their intent
3. Answer destination questions with genuine insight and enthusiasm
4. Hand off flights, car hire, and bookings warmly to the WhatsApp team

---

YOUR CONVERSATION STYLE:
- Talk like a warm, confident human — not a system
- Ask ONE question at a time — never fire multiple questions at once
- Be concise — no bullet point walls, no robotic lists
- Show genuine excitement about destinations
  Example: "Oh Zanzibar in August — you picked a magical time, the weather is perfect and the reefs are stunning"
- If the customer seems unsure, guide them gently with a suggestion
  Example: "If you are open to ideas, a lot of our customers with a similar budget absolutely love the Maldives in that period"
- Never say "I cannot help with that" — always find a warm way to redirect

---

PACKAGE SEARCH RULES:
When the customer asks to see packages, available trips, or what you have — search immediately.
Do NOT keep asking for more details before searching.

Set ready_to_search to true when ANY of these happen:
- Customer asks "what packages do you have" or "show me packages" or "what is available" → search immediately with no filters
- Customer mentions a destination → search for that destination
- Customer gives a budget → search with that budget
- Customer asks to see options → search immediately

NEVER block a search by asking for more information when the customer clearly wants to see options.
Let the results do the talking — show them first, refine after.

When presenting packages introduce them naturally:
"Here is what we have right now — I think a couple of these could be a great fit..."
Then let the package cards speak for themselves. Do not repeat all the package details in your message.

---

WHATSAPP HANDOFF RULES:
When a customer asks about flights, car hire, visa assistance, or wants to confirm a booking:
1. Do NOT say you cannot help
2. Say something warm like:
   "For flights I will connect you with our team on WhatsApp — they get you the best deals personally."
3. Set whatsapp_handoff to true
4. In handoff_summary write a clear brief for the team:
   Example: "Customer is looking for flights from Addis to Dubai for 2 adults, late August, budget around $800 total."

---

THINGS YOU NEVER DO:
- Never say "As an AI" or "I am a language model"
- Never give robotic bullet point responses for conversational questions
- Never ask more than one question at a time
- Never make up package prices or availability
- Never ignore what the customer told you earlier in the conversation
- Never keep asking questions when the customer wants to see results

---

RESPOND ONLY WITH VALID JSON — no text outside the JSON:
{{
  "conversation_state": "greeting|gathering|searching|results|handoff|clarifying",
  "assistant_message": "Your warm natural reply — sound like a trusted travel advisor, not a bot",
  "understood_intent": "search_packages|destination_info|whatsapp_handoff|general_chat",
  "understood_parameters": {{
    "destination": null,
    "budget": null,
    "travel_dates": null,
    "duration_days": null,
    "travelers": null,
    "travel_style": null
  }},
  "ready_to_search": false,
  "search_parameters": null,
  "whatsapp_handoff": false,
  "handoff_summary": null
}}"""

# ── Main conversation ─────────────────────────────────────────────────────────
def manage_conversation(session_id, user_message):
    history      = load_history(session_id)
    current_date = datetime.utcnow().date().isoformat()

    save_message(session_id, "user", user_message)

    messages = []
    for msg in history[-6:]:
        if msg.get("role") in ("user", "assistant") and msg.get("content"):
            messages.append({
                "role":    msg["role"],
                "content": [{"text": msg["content"]}]
            })
    messages.append({"role": "user", "content": [{"text": user_message}]})

    system_prompt = build_system_prompt(current_date)

    try:
        response = bedrock.converse(
            modelId=BEDROCK_MODEL,
            messages=messages,
            system=[{"text": system_prompt}],
            inferenceConfig={"temperature": 0.4, "maxTokens": 800}
        )
        raw = response["output"]["message"]["content"][0]["text"]
        ai  = extract_json(raw)
    except Exception as e:
        logger.error(f"Bedrock error: {e}")
        ai = {
            "assistant_message": "Sorry, I had a moment there! Could you try again?",
            "understood_intent": "general_chat",
            "ready_to_search":   False,
            "whatsapp_handoff":  False
        }

    assistant_message = ai.get("assistant_message", "")
    save_message(session_id, "assistant", assistant_message)

    # WhatsApp handoff
    if ai.get("whatsapp_handoff"):
        return {
            "type":             "whatsapp_handoff",
            "message":          assistant_message,
            "handoff_summary":  ai.get("handoff_summary", "")
        }

    # Force search if customer is clearly asking for packages
    browse_triggers = [
        "what packages", "show me packages", "what is available",
        "what do you have", "available packages", "all packages",
        "see packages", "list packages", "show packages",
        "what trips", "available trips", "show trips"
    ]
    user_lower   = user_message.lower()
    force_search = any(t in user_lower for t in browse_triggers)

    if (ai.get("ready_to_search") or force_search) and not ai.get("whatsapp_handoff"):
        search_params = ai.get("search_parameters") or {}
        packages      = execute_package_search(search_params)

        return {
            "type":     "results",
            "message":  assistant_message,
            "packages": packages,
            "params":   search_params
        }

    return {
        "type":               "chat",
        "message":            assistant_message,
        "conversation_state": ai.get("conversation_state", "gathering")
    }

# ── Decimal encoder ───────────────────────────────────────────────────────────
class DecimalEncoder(json.JSONEncoder):
    def default(self, obj):
        return float(obj) if isinstance(obj, Decimal) else super().default(obj)

# ── Lambda handler ────────────────────────────────────────────────────────────
def lambda_handler(event, context):
    headers = {
        "Content-Type":                "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type,Authorization"
    }

    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": headers, "body": ""}

    body = event
    if "body" in event and isinstance(event["body"], str):
        body = json.loads(event["body"])

    session_id   = body.get("sessionId", f"session_{int(time.time())}")
    user_message = body.get("message", "").strip()

    if not user_message:
        return {"statusCode": 400, "headers": headers,
                "body": json.dumps({"error": "message required"})}

    result = manage_conversation(session_id, user_message)
    return {"statusCode": 200, "headers": headers,
            "body": json.dumps(result, cls=DecimalEncoder)}