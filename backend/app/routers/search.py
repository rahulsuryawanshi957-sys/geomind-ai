from fastapi import APIRouter
from app.schemas import SearchRequest
from app.rag.retrieval import retrieve

router = APIRouter(prefix="/api/search", tags=["search"])


@router.post("")
def search(req: SearchRequest):
    results = retrieve(req.query, top_k=req.top_k, category=req.category_filter)
    return {"query": req.query, "count": len(results), "results": results}
