from rest_framework.generics import ListCreateAPIView
from .models import Message
from .serializers import MessageSerializer

class MessageList(ListCreateAPIView):
    queryset = Message.objects.all()
    serializer_class = MessageSerializer