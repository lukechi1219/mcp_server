// #!/usr/bin/env node

import {Server} from '@modelcontextprotocol/sdk/server/index.js';
import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js';
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
    Tool,
} from '@modelcontextprotocol/sdk/types.js';
import TelegramBot from 'node-telegram-bot-api';

class TelegramMcpServer_botApi {
    private token = '';
    private bot: TelegramBot = new TelegramBot(this.token);
    private server: Server;

    constructor() {
        this.server = new Server(
            {
                name: 'telegram-mcp-server_bot-api',
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

    private setupToolHandlers() {
        // List available tools
        this.server.setRequestHandler(ListToolsRequestSchema, async () => {
            return {
                tools: [
                    {
                        name: 'send_telegram_message',
                        description: 'Send a message to a Telegram chat',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                chatId: {
                                    type: 'string',
                                    description: 'Chat ID to send message to',
                                },
                                message: {
                                    type: 'string',
                                    description: 'Message text to send',
                                },
                                parseMode: {
                                    type: 'string',
                                    description: 'Parse mode (HTML, Markdown, MarkdownV2)',
                                    enum: ['HTML', 'Markdown', 'MarkdownV2'],
                                },
                            },
                            required: ['chatId', 'message'],
                        },
                    },
                    {
                        name: 'get_telegram_updates',
                        description: 'Get recent updates from Telegram bot',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                limit: {
                                    type: 'number',
                                    description: 'Number of updates to retrieve (1-100)',
                                    minimum: 1,
                                    maximum: 100,
                                },
                            },
                            required: [],
                        },
                    },
                    {
                        name: 'send_telegram_photo',
                        description: 'Send a photo to a Telegram chat',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                chatId: {
                                    type: 'string',
                                    description: 'Chat ID to send photo to',
                                },
                                photo: {
                                    type: 'string',
                                    description: 'Photo URL or file path',
                                },
                                caption: {
                                    type: 'string',
                                    description: 'Photo caption',
                                },
                            },
                            required: ['chatId', 'photo'],
                        },
                    },
                ],
            };
        });

        // Handle tool calls
        this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
            const {name, arguments: args} = request.params;

            try {
                switch (name) {
                    case 'send_telegram_message':
                        return await this.sendTelegramMessage(args);

                    case 'get_telegram_updates':
                        return await this.getTelegramUpdates(args);

                    case 'send_telegram_photo':
                        return await this.sendTelegramPhoto(args);

                    default:
                        const errorMessage = `Unknown tool: ${name}`;
                        return this.errorContent(errorMessage);
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
        };
    }

    private async sendTelegramMessage(args: any) {
        const {chatId, message, parseMode} = args;

        const options: any = {};
        if (parseMode) {
            options.parse_mode = parseMode;
        }

        const result = await this.bot.sendMessage(chatId, message, options);

        return {
            content: [
                {
                    type: 'text',
                    text: `Message sent successfully! Message ID: ${result.message_id}`,
                },
            ],
        };
    }

    private async getTelegramUpdates(args: any) {
        const {limit = 10} = args;

        const updates = await this.bot.getUpdates({limit});

        return {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify(updates, null, 2),
                },
            ],
        };
    }

    private async sendTelegramPhoto(args: any) {
        const {chatId, photo, caption} = args;

        const options: any = {};
        if (caption) {
            options.caption = caption;
        }

        const result = await this.bot.sendPhoto(chatId, photo, options);

        return {
            content: [
                {
                    type: 'text',
                    text: `Photo sent successfully! Message ID: ${result.message_id}`,
                },
            ],
        };
    }

    private setupErrorHandling() {
        this.server.onerror = (error) => {
            console.error('[MCP Error]', error);
        };

        process.on('SIGINT', async () => {
            await this.server.close();
            process.exit(0);
        });
    }

    async run() {
        const transport = new StdioServerTransport();
        await this.server.connect(transport);
        console.error('Telegram MCP server running on stdio');
    }
}

// Start the server
const server = new TelegramMcpServer_botApi();
server.run().catch(console.error);
