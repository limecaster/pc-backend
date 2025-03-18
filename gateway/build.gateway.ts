import {
    WebSocketGateway,
    WebSocketServer,
    SubscribeMessage,
    MessageBody,
} from '@nestjs/websockets';
import { Socket, Server } from 'socket.io';

@WebSocketGateway({
    cors: { origin: '*', transports: ['websocket', 'polling'] }, // Allow all origins for development
})
export class BuildGateway {
    @WebSocketServer()
    server: Server;

    public sendConfigUpdate(config: any) {
        console.log('Emitting pcConfigFormed event:');
        this.server.emit('pcConfigFormed', config);
    }

    handleConnection(client: Socket) {
        console.log(`Client connected: ${client.id}`);
    }

    handleDisconnect(client: Socket) {
        console.log(`Client disconnected: ${client.id}`);
    }

    @SubscribeMessage('subscribeAutoBuild')
    handleSubscription(@MessageBody() message: any) {
        console.log('Received subscription message:', message);
        this.server.emit(
            'autoBuildSubscribed',
            'Auto Build Subscription Successful',
        );
    }
}
