import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { pusherServer } from '@/lib/pusher'
import { pusherTransKey } from '@/lib/utils'
import { Message, messageValidator } from '@/lib/validation/message'
import { User } from '@/types/db'
import { CommandRedis } from '@/utils/redis'
import { nanoid } from 'nanoid'
import { getServerSession } from 'next-auth'

export async function POST(req: Request) {
  try {
    const { text, chatId } = await req.json()
    const session = await getServerSession(authOptions)
    if (!session) {
      return new Response('not Auth', { status: 401 })
    }
    const [chatId1, chatId2] = chatId.split('--')
    if (session.user.id !== chatId1 && session.user.id !== chatId2) {
      return new Response('not Auth', { status: 402 })
    }
    const friendId = session.user.id === chatId1 ? chatId2 : chatId1
    const friendList = (await CommandRedis(
      'smembers',
      `user:${session.user.id}:friend`
    )) as string[]
    const isfriend = friendList.includes(friendId)
    if (!isfriend) {
      return new Response('not Auth', { status: 401 })
    }
    const Sender = (await CommandRedis(
      'get',
      `user:${session.user.id}`
    )) as string
    const dataSender = JSON.parse(Sender) as User

    const timeStamp = Date.now()
    const messageData: Message = {
      id: nanoid(),
      message: text,
      senderId: session.user.id,
      timeStamp,
    }
    const message = messageValidator.parse(messageData)
    await pusherServer.trigger(
      pusherTransKey(`chat:${chatId}`),
      'incoming-message',
      message
    )
    await pusherServer.trigger(
      pusherTransKey(`user:${friendId}:chats`),
      'chat_notification',
      {
        ...message,
        senderImg: dataSender.image,
        senderName: dataSender.name,
      }
    )
    await db.zadd(`chat:${chatId}:message`, {
      score: timeStamp,
      member: JSON.stringify(message),
    })
    return new Response('ok')
  } catch (error) {
    if (error instanceof Error) {
      return new Response(error.message, { status: 500 })
    }
    return new Response('internal server error ', { status: 500 })
  }
}
