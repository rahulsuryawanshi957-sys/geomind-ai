"""
Where uploaded PDF files actually live.

- SUPABASE_URL + SUPABASE_SERVICE_KEY set -> Supabase Storage (bucket
  "documents"). Persists forever, survives Render restarts/redeploys.
- Otherwise -> local disk under settings.uploads_dir. Fine for local dev, but
  WIPED on every Render free-tier restart/redeploy (no persistent disk on
  that plan) -- same limitation the old Chroma-only setup had.

Callers never construct or parse the returned reference string themselves --
treat it as opaque, pass it to get_local_copy() / delete_file() later.
"""
import tempfile
from pathlib import Path
import httpx
from app.config import settings, logger

BUCKET = "documents"
_PREFIX = f"supabase://{BUCKET}/"


def _configured() -> bool:
    return bool(settings.supabase_url and settings.supabase_service_key)


def _headers(content_type: str | None = None) -> dict:
    h = {"Authorization": f"Bearer {settings.supabase_service_key}", "apikey": settings.supabase_service_key}
    if content_type:
        h["Content-Type"] = content_type
    return h


def save_upload(document_id: str, file_obj) -> str:
    """Saves the uploaded file (a file-like object opened for reading bytes).
    Returns an opaque reference to store in Document.file_path."""
    data = file_obj.read()
    if _configured():
        object_path = f"{document_id}.pdf"
        url = f"{settings.supabase_url}/storage/v1/object/{BUCKET}/{object_path}"
        try:
            resp = httpx.post(url, headers=_headers("application/pdf"), content=data, timeout=60)
        except Exception:
            logger.exception(f"[storage] Supabase upload request failed for document_id={document_id}")
            raise RuntimeError("Could not reach Supabase Storage. Check SUPABASE_URL is correct and the project is not paused.")
        if resp.status_code not in (200, 201):
            logger.error(f"[storage] Supabase upload failed ({resp.status_code}): {resp.text}")
            raise RuntimeError(
                f"Supabase Storage upload failed ({resp.status_code}): {resp.text}. "
                f"Common cause: the 'documents' bucket doesn't exist yet -- create it in "
                f"Supabase Dashboard -> Storage -> New bucket -> name it exactly 'documents'."
            )
        logger.info(f"[storage] Saved document_id={document_id} to Supabase Storage.")
        return f"{_PREFIX}{object_path}"
    else:
        dest_path = settings.uploads_dir / f"{document_id}.pdf"
        with open(dest_path, "wb") as f:
            f.write(data)
        logger.warning(f"[storage] Saved document_id={document_id} to LOCAL disk ({dest_path}) -- "
                        f"will be lost on next restart/redeploy since Supabase Storage isn't configured.")
        return str(dest_path)


def get_local_copy(file_path_ref: str) -> str:
    """Returns a real local filesystem path for the given stored file --
    downloads from Supabase Storage to a temp file first if the reference
    points there. The caller should delete the returned path when done with
    it IF it's a temp file (check with is_temp_copy())."""
    if file_path_ref.startswith(_PREFIX):
        object_path = file_path_ref[len(_PREFIX):]
        url = f"{settings.supabase_url}/storage/v1/object/{BUCKET}/{object_path}"
        resp = httpx.get(url, headers=_headers(), timeout=60)
        if resp.status_code != 200:
            raise RuntimeError(f"Supabase Storage download failed ({resp.status_code}): {resp.text}")
        tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".pdf")
        tmp.write(resp.content)
        tmp.close()
        return tmp.name
    return file_path_ref  # already a real local path, nothing to download


def is_temp_copy(file_path_ref: str) -> bool:
    """True if file_path_ref was stored via Supabase (so get_local_copy()
    returns a temp file the caller should clean up after use)."""
    return file_path_ref.startswith(_PREFIX)


def delete_temp_copy(local_path: str):
    """Deletes a temp file previously returned by get_local_copy() -- NOT for
    the opaque Document.file_path reference itself, use delete_file() for that."""
    try:
        Path(local_path).unlink(missing_ok=True)
    except Exception:
        logger.exception(f"[storage] Failed to clean up temp file {local_path} (non-fatal)")


def delete_file(file_path_ref: str):
    if file_path_ref.startswith(_PREFIX):
        object_path = file_path_ref[len(_PREFIX):]
        url = f"{settings.supabase_url}/storage/v1/object/{BUCKET}/{object_path}"
        try:
            httpx.delete(url, headers=_headers(), timeout=30)
        except Exception:
            logger.exception(f"[storage] Failed to delete {file_path_ref} from Supabase Storage (non-fatal)")
    else:
        try:
            Path(file_path_ref).unlink(missing_ok=True)
        except Exception:
            logger.exception(f"[storage] Failed to delete local file {file_path_ref} (non-fatal)")
