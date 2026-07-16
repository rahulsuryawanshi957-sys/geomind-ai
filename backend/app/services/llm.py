"""
All calls to the generative model go through here. The system prompt is the single
most important piece of this app -- it's what turns a generic LLM wrapper into a
"never invent clause numbers, never fabricate equations" assistant.
"""
import json
from openai import OpenAI, AuthenticationError, APIError
from fastapi import HTTPException
from app.config import settings, logger

_client = OpenAI(api_key=settings.openai_api_key or "not-configured")

SYSTEM_PROMPT = """You are GeoMind AI, a professional geotechnical engineering assistant.

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
    if not settings.openai_api_key:
        logger.error("Chat/report generation called but OPENAI_API_KEY is not configured.")
        raise HTTPException(
            status_code=503,
            detail="OPENAI_API_KEY is not configured on the server. "
                   "Set it in Render -> your backend service -> Environment -> "
                   "Add Environment Variable (Key=OPENAI_API_KEY), then redeploy.",
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


def _call_chat(messages: list[dict], temperature: float) -> str:
    _require_api_key()
    logger.info(f"Calling {settings.chat_model} with {len(messages)} message(s)...")
    try:
        response = _client.chat.completions.create(
            model=settings.chat_model,
            messages=messages,
            temperature=temperature,
        )
    except AuthenticationError:
        logger.exception("OpenAI rejected the API key (authentication error).")
        raise HTTPException(
            status_code=503,
            detail="OpenAI rejected the configured API key. Double-check "
                   "OPENAI_API_KEY on Render is correct, active, and has billing enabled.",
        )
    except APIError as e:
        logger.exception("OpenAI API error during chat completion.")
        raise HTTPException(status_code=502, detail=f"OpenAI chat API error: {e}")

    logger.info("Chat completion received.")
    return response.choices[0].message.content


def answer_question(question: str, chunks: list[dict], engineering_mode: bool = True, history: list[dict] | None = None) -> str:
    context_block = build_context_block(chunks)
    mode_note = "Engineering Mode is ON." if engineering_mode else "Engineering Mode is OFF (still never fabricate clauses/equations)."

    messages = [{"role": "system", "content": SYSTEM_PROMPT}]
    for h in (history or [])[-6:]:
        messages.append({"role": h["role"], "content": h["content"]})

    messages.append({
        "role": "user",
        "content": f"{mode_note}\n\nRETRIEVED CONTEXT:\n{context_block}\n\nUSER QUESTION:\n{question}",
    })

    return _call_chat(messages, temperature=0.1)


def generate_report_section(section_type: str, project_inputs: dict, chunks: list[dict]) -> str:
    context_block = build_context_block(chunks)
    prompt = f"""Draft a professional geotechnical report section of type "{section_type}".

Project inputs (JSON): {json.dumps(project_inputs)}

RETRIEVED CONTEXT (use for any code/standard references; do not invent clause numbers):
{context_block}

Write in formal engineering report language. Include a References subsection listing
book/code, page, and clause for anything cited. If a needed input is missing, insert a
clearly marked placeholder like [ENTER VALUE] rather than guessing."""

    return _call_chat(
        [{"role": "system", "content": SYSTEM_PROMPT}, {"role": "user", "content": prompt}],
        temperature=0.2,
    )
