from django.contrib.auth.models import User
from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

from .models import Profile, DeviceToken


def _user_profile(user):
    try:
        return user.profile
    except Profile.DoesNotExist:
        return None


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=8)
    password_confirm = serializers.CharField(write_only=True)

    class Meta:
        model = User
        fields = ("username", "email", "password", "password_confirm")

    def validate_email(self, value):
        if User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError("Email already registered.")
        return value.lower()

    def validate(self, attrs):
        if attrs["password"] != attrs["password_confirm"]:
            raise serializers.ValidationError({"password_confirm": "Passwords do not match."})
        validate_password(attrs["password"])
        return attrs

    def create(self, validated_data):
        validated_data.pop("password_confirm")
        return User.objects.create_user(
            username=validated_data["username"],
            email=validated_data["email"],
            password=validated_data["password"],
        )


class EmailTokenObtainPairSerializer(TokenObtainPairSerializer):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields["email"] = serializers.EmailField(write_only=True)
        self.fields["password"] = serializers.CharField(write_only=True)
        self.fields.pop(self.username_field, None)

    def validate(self, attrs):
        email = attrs.get("email", "").lower()
        password = attrs.get("password")

        try:
            user = User.objects.get(email__iexact=email)
        except User.DoesNotExist:
            raise serializers.ValidationError("Invalid email or password.") from None

        if not user.check_password(password):
            raise serializers.ValidationError("Invalid email or password.")

        refresh = self.get_token(user)
        return {
            "refresh": str(refresh),
            "access": str(refresh.access_token),
        }


class UserSerializer(serializers.ModelSerializer):
    is_online = serializers.SerializerMethodField()
    presence_status = serializers.SerializerMethodField()
    status_message = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ("id", "username", "email", "is_online", "presence_status", "status_message")

    def get_is_online(self, obj):
        profile = _user_profile(obj)
        return profile.is_online if profile else False

    def get_presence_status(self, obj):
        profile = _user_profile(obj)
        return profile.presence_status if profile else "online"

    def get_status_message(self, obj):
        profile = _user_profile(obj)
        return profile.status_message if profile else ""


class StatusUpdateSerializer(serializers.Serializer):
    presence_status = serializers.ChoiceField(
        choices=["online", "away", "busy", "ooo"],
        required=False,
    )
    status_message = serializers.CharField(max_length=120, required=False, allow_blank=True)


class ProfileSerializer(serializers.ModelSerializer):
    username = serializers.CharField(source="user.username", read_only=True)
    email = serializers.EmailField(source="user.email", read_only=True)

    class Meta:
        model = Profile
        fields = ("username", "email", "display_name", "avatar_color", "is_online", "last_seen")


class DeviceTokenSerializer(serializers.Serializer):
    token = serializers.CharField(max_length=512)
    platform = serializers.ChoiceField(
        choices=DeviceToken.PLATFORM_CHOICES,
        default=DeviceToken.ANDROID,
    )
