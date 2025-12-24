import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import jwt from 'jsonwebtoken';
import axios from 'axios';
import ChatTopic from '@/models/ChatTopic';
import User from '@/models/User';
import Message from '@/models/Message';
import { initDatabase } from '@/lib/initDb';

const JWT_SECRET = process.env.JWT_SECRET || 'yasna-secret-key-change-in-production';
const N8N_WEBHOOK_URL = 'https://n8n.konstantinluksha.ru/webhook/26e44a79-465d-4644-a367-3db29217edf6';

async function getUserId(request: NextRequest) {
  const cookieStore = await cookies();
  const token = cookieStore.get('auth_token')?.value;
  if (!token) return null;

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: number };
    return decoded.userId;
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    await initDatabase();

    const userId = await getUserId(request);

    if (!userId) {
      return NextResponse.json(
        { error: 'Не авторизован' },
        { status: 401 }
      );
    }

    const { message, topicId } = await request.json();

    if (!message) {
      return NextResponse.json(
        { error: 'Сообщение обязательно' },
        { status: 400 }
      );
    }

    let topic: ChatTopic | null = null;

    if (topicId) {
      topic = await ChatTopic.findOne({
        where: { id: topicId, userId },
      });
    }

    if (!topic) {
      const title = message.length > 50 ? message.substring(0, 50) + '...' : message;
      topic = await ChatTopic.create({
        userId,
        title,
      });
    }

    // Сохраняем сообщение пользователя в БД
    await Message.create({
      topicId: topic.id,
      role: 'user',
      content: message,
    });

    // Получаем телефон пользователя
    const user = await User.findByPk(userId);
    const userPhone = user?.phone || '';

    let response = 'Извините, сервис временно недоступен.';

    try {
      const payload = {
        message,
        userId,
        topicId: topic.id,
        phone: userPhone,
      };

      console.log('Sending to webhook:', N8N_WEBHOOK_URL);
      console.log('Payload:', JSON.stringify(payload, null, 2));

      // Пробуем POST запрос
      let webhookResponse;
      try {
        webhookResponse = await axios.post(
          N8N_WEBHOOK_URL,
          payload,
          {
            timeout: 60000,
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'application/json',
            },
            validateStatus: (status) => status < 500, // Принимаем все статусы кроме 5xx
          }
        );
      } catch (postError: any) {
        // Если POST вернул 404, пробуем GET с query параметрами
        if (postError.response?.status === 404) {
          console.log('POST failed with 404, trying GET with query params');
          const queryParams = new URLSearchParams({
            message: payload.message,
            userId: payload.userId.toString(),
            topicId: payload.topicId.toString(),
            phone: payload.phone,
          });
          
          webhookResponse = await axios.get(
            `${N8N_WEBHOOK_URL}?${queryParams.toString()}`,
            {
              timeout: 60000,
              headers: {
                'Accept': 'application/json',
              },
              validateStatus: (status) => status < 500,
            }
          );
        } else {
          throw postError;
        }
      }

      console.log('Webhook response status:', webhookResponse.status);
      console.log('Webhook response data:', JSON.stringify(webhookResponse.data, null, 2));

      // Обрабатываем различные форматы ответа от n8n
      if (webhookResponse.data) {
        // Если ответ - строка
        if (typeof webhookResponse.data === 'string') {
          response = webhookResponse.data;
        }
        // Если ответ - объект
        else if (typeof webhookResponse.data === 'object') {
          // Проверяем различные возможные поля ответа
          response = 
            webhookResponse.data.response || 
            webhookResponse.data.message || 
            webhookResponse.data.text ||
            webhookResponse.data.output ||
            webhookResponse.data.data?.response ||
            webhookResponse.data.data?.message ||
            (Array.isArray(webhookResponse.data) && webhookResponse.data[0]?.response) ||
            (Array.isArray(webhookResponse.data) && webhookResponse.data[0]?.message) ||
            JSON.stringify(webhookResponse.data);
        }
      }

      // Если статус не 200, но есть данные, все равно используем их
      if (webhookResponse.status !== 200 && !response) {
        response = `Получен статус ${webhookResponse.status}, но ответ пустой`;
      }
    } catch (webhookError: any) {
      console.error('N8N webhook error:', webhookError.message);
      console.error('Error details:', {
        code: webhookError.code,
        response: webhookError.response?.data,
        status: webhookError.response?.status,
        statusText: webhookError.response?.statusText,
        url: webhookError.config?.url,
      });

      if (webhookError.response) {
        const status = webhookError.response.status;
        const statusText = webhookError.response.statusText;
        const errorData = webhookError.response.data;
        
        console.error('Webhook response error:', {
          status,
          statusText,
          data: errorData,
        });

        // Если получили 404, возможно webhook не настроен или URL неверный
        if (status === 404) {
          response = 'Webhook не найден. Проверьте настройки n8n.';
        } else {
          response = `Ошибка: ${status} - ${statusText}`;
        }
      } else if (webhookError.request) {
        console.error('No response received:', webhookError.request);
        response = 'Сервис не отвечает. Проверьте доступность webhook.';
      } else {
        console.error('Request setup error:', webhookError.message);
        response = `Ошибка при отправке запроса: ${webhookError.message}`;
      }
    }

    // Сохраняем ответ ассистента в БД
    await Message.create({
      topicId: topic.id,
      role: 'assistant',
      content: response,
    });

    // Обновляем время обновления топика
    await topic.update({ updatedAt: new Date() });

    return NextResponse.json({
      response,
      topicId: topic.id,
    });
  } catch (error: any) {
    console.error('Send message error:', error);
    return NextResponse.json(
      { error: 'Произошла ошибка при отправке сообщения' },
      { status: 500 }
    );
  }
}

