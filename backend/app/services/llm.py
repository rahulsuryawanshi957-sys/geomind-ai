"""
All calls to the generative model go through here. The system prompt is the single
most important piece of this app -- it's what turns a generic LLM wrapper into a
"never invent clause numbers, never fabricate equations" assistant.
"""
import json
import time
from google import genai
from google.genai import types
from fastapi import HTTPException
from app.config import settings, logger

_client = genai.Client(api_key=settings.gemini_api_key or "not-configured")

MAX_RETRIES = 3
RETRY_DELAY_SECONDS = 2

SYSTEM_PROMPT = """You are RaahiGeo AI, a professional geotechnical engineering assistant.

HARD RULES (never break these):
1. Base your answer primarily on the RETRIEVED CONTEXT provided below, not on general
   knowledge. The retrieved context comes from the user's own uploaded engineering books
   and IS/IRC codes.
2. If the retrieved context does not contain enough information to answer, say so
   explicitly: "I could not find this in your uploaded documents." Do NOT fill the gap
   with unverified general knowledge presented as fact. You may offer general engineering
   background ONLY if you clearly label it as "General knowledge (not from your documents)".
3. NEVER invent a clause number, page number, or IS/IRC code number. Only cite numbers that
   appear in the retrieved context. If a clause number isn't in the context, say the clause
   number could not be confirmed from the uploaded material.
4. NEVER fabricate or guess at an engineering equation or coefficient. Only state formulas
   that appear in the retrieved context, or clearly mark textbook-standard formulas you're
   recalling as "General knowledge, not sourced from your documents".
5. When Engineering Mode is ON: never guess numeric engineering inputs, always ask for
   missing inputs, always state units explicitly, always show the equation used, always
   state assumptions, and flag anything that looks like an unsafe or non-standard input.
6. Structure every answer with two clearly separated parts:
   - "Retrieved from your documents" (verbatim-adjacent summary + citations)
   - "Explanation" (your synthesis, clearly marked as such)
7. End every substantive answer with a Reference block:
   Source: <book/code name>
   Page: <page number or "not available">
   Clause: <clause number or "not available">
   Confidence: <High/Medium/Low based on how directly the context supports the answer>

Be concise, precise, and use correct engineering terminology and SI units unless the
source document uses another unit system, in which case state both.
"""


def _require_api_key():
    if not settings.gemini_api_key:
        logger.error("Chat/report generation called but GEMINI_API_KEY is not configured.")
        raise HTTPException(
            status_code=503,
            detail="GEMINI_API_KEY is not configured on the server. Get a free key at "
                   "https://aistudio.google.com/apikey, then set it in Render -> your "
                   "backend service -> Environment -> Add Environment Variable "
                   "(Key=GEMINI_API_KEY), then redeploy.",
        )


def build_context_block(chunks: list[dict]) -> str:
    if not chunks:
        return "NO RELEVANT CONTEXT FOUND IN UPLOADED DOCUMENTS."
    parts = []
    for i, c in enumerate(chunks, 1):
        loc = f"{c['filename']}"
        if c.get("page_number"):
            loc += f", page {c['page_number']}"
        if c.get("clause_number"):
            loc += f", clause {c['clause_number']}"
        parts.append(f"[Source {i} — {loc}]\n{c['text']}")
    return "\n\n---\n\n".join(parts)


def _call_chat(history: list[dict], latest_user_message: str, temperature: float) -> str:
    """
    Gemini's API shape differs from OpenAI's: the system prompt is a separate
    config field (not a message in the list), and prior-turn roles are "user"
    / "model" (not "user" / "assistant").
    """
    _require_api_key()

    contents = []
    for h in history[-6:]:
        role = "model" if h["role"] == "assistant" else "user"
        contents.append(types.Content(role=role, parts=[types.Part.from_text(text=h["content"])]))
    contents.append(types.Content(role="user", parts=[types.Part.from_text(text=latest_user_message)]))

    logger.info(f"Calling {settings.chat_model} with {len(contents)} content turn(s)...")

    for attempt in range(1, MAX_RETRIES + 1):
        try:
            response = _client.models.generate_content(
                model=settings.chat_model,
                contents=contents,
                config=types.GenerateContentConfig(
                    system_instruction=SYSTEM_PROMPT,
                    temperature=temperature,
                ),
            )
            logger.info("Chat completion received.")
            return response.text
        except Exception as e:
            msg = str(e)
            is_overloaded = "UNAVAILABLE" in msg or "503" in msg or "RESOURCE_EXHAUSTED" in msg or "429" in msg
            if is_overloaded and attempt < MAX_RETRIES:
                logger.warning(f"Gemini chat overloaded (attempt {attempt}/{MAX_RETRIES}), retrying in {RETRY_DELAY_SECONDS}s...")
                time.sleep(RETRY_DELAY_SECONDS)
                continue

            logger.exception("Gemini chat completion call failed.")
            if "API key" in msg or "API_KEY" in msg or "401" in msg or "403" in msg or "PERMISSION_DENIED" in msg:
                raise HTTPException(
                    status_code=503,
                    detail="Gemini rejected the configured API key. Double-check "
                           "GEMINI_API_KEY on Render is correct and active "
                           "(https://aistudio.google.com/apikey).",
                )
            if "RESOURCE_EXHAUSTED" in msg or "429" in msg:
                raise HTTPException(
                    status_code=429,
                    detail="Gemini's free-tier rate limit was hit. Wait a bit and try again.",
                )
            if is_overloaded:
                raise HTTPException(
                    status_code=503,
                    detail="Gemini's servers are temporarily overloaded (this is on Google's "
                           "side, not a bug here) even after retrying. Please try again shortly.",
                )
            raise HTTPException(status_code=502, detail=f"Gemini chat API error: {e}")


def answer_question(question: str, chunks: list[dict], engineering_mode: bool = True, history: list[dict] | None = None) -> str:
    context_block = build_context_block(chunks)
    mode_note = "Engineering Mode is ON." if engineering_mode else "Engineering Mode is OFF (still never fabricate clauses/equations)."

    user_message = f"{mode_note}\n\nRETRIEVED CONTEXT:\n{context_block}\n\nUSER QUESTION:\n{question}"
    return _call_chat(history or [], user_message, temperature=0.1)


def generate_report_section(section_type: str, project_inputs: dict, chunks: list[dict]) -> str:
    context_block = build_context_block(chunks)
    prompt = f"""Draft a professional geotechnical report section of type "{section_type}".

Project inputs (JSON): {json.dumps(project_inputs)}

RETRIEVED CONTEXT (use for any code/standard references; do not invent clause numbers):
{context_block}

Write in formal engineering report language. Include a References subsection listing
book/code, page, and clause for anything cited. If a needed input is missing, insert a
clearly marked placeholder like [ENTER VALUE] rather than guessing."""

    return _call_chat([], prompt, temperature=0.2)
