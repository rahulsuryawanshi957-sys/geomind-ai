"""
Single shared login for the whole app -- one username/password Raahi uses to
keep the site private, changeable from Settings once logged in. Not a
multi-user system; see AppCredential/AuthSession in models.py.

Password hashing uses only the Python standard library (hashlib.pbkdf2_hmac)
-- no new dependency (bcrypt/passlib) needed for a single-credential app.
Sessions are opaque random tokens stored server-side (not JWTs) so they can
be trivially revoked (e.g. on password change, every existing session is
deleted, logging out any other open session immediately).
"""
import datetime
import hashlib
import hmac
import os
import secrets

from sqlalchemy.orm import Session

from app.models import AppCredential, AuthSession

SESSION_LIFETIME_DAYS = 30
PBKDF2_ITERATIONS = 260_000

# First-run default -- only used to seed the AppCredential row if none exists
# yet (fresh database). Override via env vars so the real default isn't
# whatever happens to be committed in this file. CHANGE THIS IMMEDIATELY
# after first login, from Settings -- this default is not a secret.
DEFAULT_USERNAME = os.environ.get("INITIAL_ADMIN_USERNAME", "raahi")
DEFAULT_PASSWORD = os.environ.get("INITIAL_ADMIN_PASSWORD", "raahigeo2026")


def _hash_password(password: str, salt: str | None = None) -> tuple[str, str]:
    salt = salt or secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), PBKDF2_ITERATIONS)
    return digest.hex(), salt


def verify_password(password: str, salt: str, expected_hash: str) -> bool:
    computed, _ = _hash_password(password, salt)
    return hmac.compare_digest(computed, expected_hash)


def ensure_default_credential(db: Session) -> None:
    """Called once at startup. Seeds the single credential row if the table is empty --
    safe to call every startup, it's a no-op once a credential exists."""
    if db.query(AppCredential).first() is not None:
        return
    password_hash, salt = _hash_password(DEFAULT_PASSWORD)
    db.add(AppCredential(id=1, username=DEFAULT_USERNAME, password_hash=password_hash, password_salt=salt))
    db.commit()


def authenticate(db: Session, username: str, password: str) -> bool:
    cred = db.query(AppCredential).first()
    if cred is None:
        return False
    # Constant-time-ish: still verify password hash even on username mismatch,
    # so response timing doesn't reveal whether the username was right.
    username_ok = hmac.compare_digest(username.strip(), cred.username)
    password_ok = verify_password(password, cred.password_salt, cred.password_hash)
    return username_ok and password_ok


def create_session(db: Session) -> str:
    token = secrets.token_urlsafe(32)
    expires_at = datetime.datetime.utcnow() + datetime.timedelta(days=SESSION_LIFETIME_DAYS)
    db.add(AuthSession(token=token, expires_at=expires_at))
    db.commit()
    return token


def validate_session(db: Session, token: str | None) -> bool:
    if not token:
        return False
    session = db.query(AuthSession).filter(AuthSession.token == token).first()
    if session is None:
        return False
    if session.expires_at < datetime.datetime.utcnow():
        db.delete(session)
        db.commit()
        return False
    return True


def revoke_session(db: Session, token: str) -> None:
    db.query(AuthSession).filter(AuthSession.token == token).delete()
    db.commit()


def revoke_all_sessions(db: Session) -> None:
    """Called on password change -- logs out every other open session immediately."""
    db.query(AuthSession).delete()
    db.commit()


def change_credentials(db: Session, new_username: str, new_password: str) -> None:
    cred = db.query(AppCredential).first()
    password_hash, salt = _hash_password(new_password)
    cred.username = new_username.strip()
    cred.password_hash = password_hash
    cred.password_salt = salt
    db.commit()
    revoke_all_sessions(db)
