from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand

User = get_user_model()

DEMO_PASSWORD = "DemoPass123!"

DEMO_USERS = [
    {"username": "alice", "email": "alice@demo.com"},
    {"username": "bob", "email": "bob@demo.com"},
    {"username": "charlie", "email": "charlie@demo.com"},
]


class Command(BaseCommand):
    help = "Create demo user accounts for testing (idempotent)."

    def handle(self, *args, **options):
        created_count = 0

        for entry in DEMO_USERS:
            user, created = User.objects.get_or_create(
                email=entry["email"],
                defaults={"username": entry["username"]},
            )
            if created:
                user.set_password(DEMO_PASSWORD)
                user.save()
                created_count += 1
                self.stdout.write(self.style.SUCCESS(f"Created {entry['username']} ({entry['email']})"))
            else:
                if user.username != entry["username"]:
                    user.username = entry["username"]
                    user.save(update_fields=["username"])
                self.stdout.write(f"Already exists: {entry['username']} ({entry['email']})")

        self.stdout.write("")
        self.stdout.write(self.style.SUCCESS("Demo accounts ready:"))
        for entry in DEMO_USERS:
            self.stdout.write(f"  {entry['email']} / {DEMO_PASSWORD}")
        self.stdout.write("")
        self.stdout.write(f"Created {created_count} new account(s).")
