from .models import AuditLog


def log_audit(*, actor, action: str, target_type: str = "", target_id: int | None = None, metadata: dict | None = None):
    AuditLog.objects.create(
        actor=actor,
        action=action,
        target_type=target_type,
        target_id=target_id,
        metadata=metadata or {},
    )
