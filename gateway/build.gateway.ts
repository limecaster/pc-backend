import {
    WebSocketGateway,
    WebSocketServer,
    SubscribeMessage,
    MessageBody,
    ConnectedSocket,
} from '@nestjs/websockets';
import { Socket, Server } from 'socket.io';

@WebSocketGateway({
    cors: { origin: '*', transports: ['websocket', 'polling'] }, // Allow all origins for development
})
export class BuildGateway {
    @WebSocketServer()
    server: Server;
    
    private userRooms = new Map<string, string>();

    public sendConfigUpdate(config: any, userId: string) {
        // Send to specific user room instead of broadcasting to all
        if (userId && this.userRooms.has(userId)) {
            const roomId = this.userRooms.get(userId);
            this.server.to(roomId).emit('pcConfigFormed', config);
        }
    }

    handleConnection(client: Socket) {
        // Optional: Log connection for debugging
    }

    handleDisconnect(client: Socket) {
        // Clean up rooms when client disconnects
        for (const [userId, roomId] of this.userRooms.entries()) {
            if (roomId === client.id) {
                this.userRooms.delete(userId);
                break;
            }
        }
    }

    @SubscribeMessage('subscribeAutoBuild')
    handleSubscription(
        @MessageBody() message: { userId: string },
        @ConnectedSocket() client: Socket
    ) {
        const userId = message.userId || client.id;
        
        // Store mapping between userId and socket room
        this.userRooms.set(userId, client.id);
        
        // Join client to their own room
        client.join(client.id);
        
        client.emit(
            'autoBuildSubscribed',
            {
                message: 'Auto Build Subscription Successful',
                userId: userId
            }
        );
    }
}
