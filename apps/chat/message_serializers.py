from rest_framework import serializers


class MessageEditSerializer(serializers.Serializer):
    body = serializers.CharField(max_length=4000, allow_blank=False, trim_whitespace=True)

    def validate_body(self, value):
        cleaned = value.strip()
        if not cleaned:
            raise serializers.ValidationError("Message cannot be empty.")
        return cleaned
