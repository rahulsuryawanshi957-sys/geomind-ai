from fastapi import APIRouter
from app.schemas import SearchRequest
from app.rag.retrieval import retrieve
from app.config import logger

router = APIRouter(prefix="/api/search", tags=["search"])


@router.post("")
def search(req: SearchRequest):
    logger.info(f"[search] query={req.query!r} category_filter={req.category_filter}")
    results = retrieve(req.query, top_k=req.top_k, category=req.category_filter)
    logger.info(f"[search] {len(results)} result(s) returned.")
    return {"query": req.query, "count": len(results), "results": results}
