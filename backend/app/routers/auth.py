from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy.orm import Session
import hmac

from app.config import settings
from app.database import get_db
from app.models import AppCredential
from app.schemas import LoginRequest, ChangeCredentialsRequest
from app import auth as auth_service

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _extract_token(authorization: str | None) -> str | None:
    if not authorization or not authorization.startswith("Bearer "):
        return None
    return authorization[len("Bearer "):].strip()


def require_auth(authorization: str | None = Header(default=None), db: Session = Depends(get_db)) -> None:
    """FastAPI dependency -- import and add to any router that isn't already
    covered by the app-wide auth middleware in main.py (which covers
    everything under /api/ except /api/auth/login, /api/auth/register-check,
    and /api/health). Kept here too in case a specific endpoint needs it
    directly."""
    token = _extract_token(authorization)
    if not auth_service.validate_session(db, token):
        raise HTTPException(401, "Not authenticated.")


@router.post("/login")
def login(req: LoginRequest, db: Session = Depends(get_db)):
    if not auth_service.authenticate(db, req.username, req.password):
        raise HTTPException(401, "Incorrect username or password.")
    token = auth_service.create_session(db)
    return {"token": token}


@router.post("/logout")
def logout(authorization: str | None = Header(default=None), db: Session = Depends(get_db)):
    token = _extract_token(authorization)
    if token:
        auth_service.revoke_session(db, token)
    return {"ok": True}


@router.get("/me")
def me(authorization: str | None = Header(default=None), db: Session = Depends(get_db)):
    token = _extract_token(authorization)
    if not auth_service.validate_session(db, token):
        raise HTTPException(401, "Not authenticated.")
    cred = db.query(AppCredential).first()
    return {"username": cred.username if cred else None}


@router.post("/change-credentials")
def change_credentials(
    req: ChangeCredentialsRequest,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
):
    token = _extract_token(authorization)
    if not auth_service.validate_session(db, token):
        raise HTTPException(401, "Not authenticated.")
    if not hmac.compare_digest(req.owner_pin.strip(), settings.owner_pin):
        raise HTTPException(403, "Owner PIN is incorrect. This PIN is set in Render's Environment tab (OWNER_PIN) -- only you should know it.")
    cred = db.query(AppCredential).first()
    if not cred or not auth_service.verify_password(req.current_password, cred.password_salt, cred.password_hash):
        raise HTTPException(400, "Current password is incorrect.")
    if not req.new_username.strip() or not req.new_password:
        raise HTTPException(400, "New username and password can't be empty.")
    if len(req.new_password) < 6:
        raise HTTPException(400, "New password must be at least 6 characters.")
    auth_service.change_credentials(db, req.new_username, req.new_password)
    # Every session (including this one) was just revoked by change_credentials
    # -- issue a fresh one so the user making the change isn't immediately
    # logged out themselves.
    new_token = auth_service.create_session(db)
    return {"ok": True, "token": new_token}
