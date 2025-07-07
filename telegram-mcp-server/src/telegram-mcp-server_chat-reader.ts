//
import {Server} from '@modelcontextprotocol/sdk/server/index.js';
import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js';
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import {TelegramClient} from 'telegram';
import {StringSession} from 'telegram/sessions';
import {Api} from 'telegram/tl';
import * as fs from 'fs';
import PeerUser = Api.PeerUser;

class TelegramChatReaderMCP {
    private server: Server;
    private client: TelegramClient | null = null;
    private sessionFile = './telegram_session.txt';
    private session: StringSession;

    constructor() {
        this.session = new StringSession('');
        // ... rest of constructor

        this.server = new Server(
            {
                name: 'telegram-chat-reader',
                version: '1.0.0',
            },
            {
                capabilities: {
                    tools: {},
                },
            }
        );

        this.setupToolHandlers();
        this.setupErrorHandling();
    }

    private loadSession(): string {
        try {
            if (fs.existsSync(this.sessionFile)) {
                return fs.readFileSync(this.sessionFile, 'utf8').trim();
            }
        } catch (error) {
            console.error('Could not load session file:', error);
        }
        return '';
    }

    private setupToolHandlers() {
        this.server.setRequestHandler(ListToolsRequestSchema, async () => {
            return {
                tools: [
                    {
                        name: 'auto_connect',
                        description: 'Auto-connect using saved credentials and session',
                        inputSchema: {
                            type: 'object',
                            properties: {},
                        },
                    },
                    {
                        name: 'connect_telegram',
                        description: 'Connect with manual credentials (requires pre-auth)',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                apiId: {type: 'string'},
                                apiHash: {type: 'string'},
                                phoneNumber: {type: 'string'},
                            },
                            required: ['apiId', 'apiHash', 'phoneNumber'],
                        },
                    },
                    // ... other tools
                ],
            };
        });

        this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
            const {name, arguments: args} = request.params;

            try {
                switch (name) {
                    case 'connect_telegram':
                        return await this.connectTelegram(args);
                    case 'get_dialogs':
                        return await this.getDialogs(args);
                    case 'get_messages':
                        return await this.getMessages(args);
                    case 'search_global':
                        return await this.searchGlobal(args);
                    case 'get_me':
                        return await this.getMe();
                    default:
                        return this.errorContent(`Unknown tool: ${name}`);
                }
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                return this.errorContent(errorMessage);
            }
        });
    }

    private errorContent(errorMessage: string) {
        return {
            content: [
                {
                    type: 'text',
                    text: `Error: ${errorMessage}`,
                },
            ],
            isError: false,
        };
    }

    private async getDialogs(args: any) {
        if (!this.client) {
            throw new Error('Not connected to Telegram. Use connect_telegram first.');
        }

        const {limit = 100} = args;

        const dialogs = await this.client.getDialogs({limit});

        const result = dialogs.map(dialog => {
            const entity = dialog.entity;
            let chatInfo: any = {
                id: dialog.id?.toString(),
                title: dialog.title,
                isUser: dialog.isUser,
                isGroup: dialog.isGroup,
                isChannel: dialog.isChannel,
                unreadCount: dialog.unreadCount,
            };

            if (entity instanceof Api.User) {
                chatInfo.user = {
                    firstName: entity.firstName,
                    lastName: entity.lastName,
                    username: entity.username,
                    phone: entity.phone,
                };
            } else if (entity instanceof Api.Chat) {
                chatInfo.chat = {
                    title: entity.title,
                    participantsCount: entity.participantsCount,
                };
            } else if (entity instanceof Api.Channel) {
                chatInfo.channel = {
                    title: entity.title,
                    username: entity.username,
                    participantsCount: entity.participantsCount,
                };
            }

            if (dialog.message) {
                chatInfo.lastMessage = {
                    id: dialog.message.id,
                    message: dialog.message.message,
                    date: dialog.message.date,
                };
            }

            return chatInfo;
        });

        return {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify(result, null, 2),
                },
            ],
            isError: false,
        };
    }

    private async getMessages(args: any) {
        if (!this.client) {
            throw new Error('Not connected to Telegram. Use connect_telegram first.');
        }

        const {entityId, limit = 50, offsetId} = args;

        try {
            const entity = await this.client.getEntity(entityId);
            const messages = await this.client.getMessages(entity, {
                limit,
                offsetId,
            });

            const result = messages.map(msg => ({
                id: msg.id,
                message: msg.message,
                date: msg.date,
                fromId: (msg.fromId as PeerUser)?.userId?.toString(),
                sender: msg.sender ? {
                    firstName: (msg.sender as any).firstName,
                    lastName: (msg.sender as any).lastName,
                    username: (msg.sender as any).username,
                } : null,
                replyTo: msg.replyTo?.replyToMsgId,
                views: msg.views,
                forwards: msg.forwards,
            }));

            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify(result, null, 2),
                    },
                ],
            };
        } catch (error: any) {
            throw new Error(`Could not get messages: ${error.message}`);
        }
    }

    private async searchGlobal(args: any) {
        if (!this.client) {
            throw new Error('Not connected to Telegram. Use connect_telegram first.');
        }

        const {query, limit = 50} = args;

        try {
            const result = await this.client.invoke(
                new Api.messages.SearchGlobal({
                    q: query,
                    offsetRate: 0,
                    offsetPeer: new Api.InputPeerEmpty(),
                    offsetId: 0,
                    limit: limit,
                })
            );

            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify(result, null, 2),
                    },
                ],
                isError: false,
            };
        } catch (error: any) {
            throw new Error(`Search failed: ${error.message}`);
        }
    }

    private async getMe() {
        if (!this.client) {
            throw new Error('Not connected to Telegram. Use connect_telegram first.');
        }

        const me = await this.client.getMe();

        return {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify({
                        id: me.id?.toString(),
                        firstName: me.firstName,
                        lastName: me.lastName,
                        username: me.username,
                        phone: me.phone,
                        isBot: me.bot,
                    }, null, 2),
                },
            ],
            isError: false,
        };
    }

    private async connectTelegram(args: any) {
        const {apiId, apiHash, phoneNumber} = args;

        const sessionString = this.loadSession();
        this.session = new StringSession(sessionString);

        this.client = new TelegramClient(this.session, parseInt(apiId), apiHash, {
            connectionRetries: 5,
        });

        try {
            // Try to connect with existing session
            await this.client.connect();

            return {
                content: [
                    {
                        type: 'text',
                        text: 'Successfully connected to Telegram using existing session!',
                    },
                ],
            };
        } catch (error: any) {
            return {
                content: [
                    {
                        type: 'text',
                        text: 'Connection failed. Please ensure you have run the authentication script first to save your session.',
                    },
                ],
            };
        }
    }

    /**
     *
     */
    private setupErrorHandling() {
        this.server.onerror = (error) => {
            console.error('[MCP Error]', error);
        };

        process.on('SIGINT', async () => {
            if (this.client) {
                await this.client.disconnect();
            }
            await this.server.close();
            process.exit(0);
        });
    }

    async run() {
        const transport = new StdioServerTransport();
        await this.server.connect(transport);
        console.error('Telegram Chat Reader MCP server running on stdio');
    }
}

// Start the server
const server = new TelegramChatReaderMCP();
server.run().catch(console.error);
