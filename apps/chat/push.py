import json
import logging
import urllib.error
import urllib.request

from django.conf import settings

from apps.accounts.models import DeviceToken

logger = logging.getLogger(__name__)


def send_push_to_user(user_id: int, title: str, body: str, data: dict | None = None) -> None:
    server_key = getattr(settings, "FCM_SERVER_KEY", "")
    if not server_key:
        return

    tokens = list(DeviceToken.objects.filter(user_id=user_id).values_list("token", flat=True))
    if not tokens:
        return

    payload = {
        "registration_ids": tokens,
        "notification": {
            "title": title,
            "body": body,
            "sound": "default",
        },
        "data": data or {},
    }

    request = urllib.request.Request(
        "https://fcm.googleapis.com/fcm/send",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"key={server_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(request, timeout=10) as response:
            response.read()
    except urllib.error.URLError as error:
        logger.warning("FCM push failed for user %s: %s", user_id, error)
