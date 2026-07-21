from django.urls import path

from apps.chat.enterprise_views import AzureSSOView, GoogleSSOView

from .views import DeviceTokenView, LoginView, LogoutView, MeView, RefreshView, RegisterView, StatusView

urlpatterns = [
    path("register/", RegisterView.as_view(), name="auth-register"),
    path("login/", LoginView.as_view(), name="auth-login"),
    path("sso/google/", GoogleSSOView.as_view(), name="auth-sso-google"),
    path("sso/azure/", AzureSSOView.as_view(), name="auth-sso-azure"),
    path("refresh/", RefreshView.as_view(), name="auth-refresh"),    path("logout/", LogoutView.as_view(), name="auth-logout"),
    path("me/", MeView.as_view(), name="auth-me"),
    path("status/", StatusView.as_view(), name="auth-status"),
    path("device-token/", DeviceTokenView.as_view(), name="auth-device-token"),
]

