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
        this.server.emit('pcConfigFormed', config);
    }

    handleConnection(client: Socket) {}

    handleDisconnect(client: Socket) {}

    @SubscribeMessage('subscribeAutoBuild')
    handleSubscription(@MessageBody() message: any) {
        this.server.emit(
            'autoBuildSubscribed',
            'Auto Build Subscription Successful',
        );
    }
}
