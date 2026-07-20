from django.contrib import admin

from .models import DeviceToken, Profile


@admin.register(Profile)
class ProfileAdmin(admin.ModelAdmin):
    list_display = ("user", "display_name", "is_online", "last_seen", "created_at")
    search_fields = ("user__username", "user__email", "display_name")


@admin.register(DeviceToken)
class DeviceTokenAdmin(admin.ModelAdmin):
    list_display = ("user", "platform", "token", "updated_at")
    search_fields = ("user__username", "token")
