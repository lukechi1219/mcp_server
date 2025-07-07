import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions';
import * as readline from 'readline';
import * as fs from 'fs';

class TelegramAuthenticator {
  private rl: readline.Interface;

  constructor() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
  }

  private question(prompt: string): Promise<string> {
    return new Promise((resolve) => {
      this.rl.question(prompt, resolve);
    });
  }

  async authenticate() {
    try {
      const apiId = await this.question('Enter your API ID: ');
      const apiHash = await this.question('Enter your API Hash: ');
      const phoneNumber = await this.question('Enter your phone number (with country code): ');

      const session = new StringSession('');
      const client = new TelegramClient(session, parseInt(apiId), apiHash, {
        connectionRetries: 5,
      });

      console.log('Connecting to Telegram...');

      await client.start({
        phoneNumber: async () => phoneNumber,
        password: async () => {
          return await this.question('Enter your 2FA password (if enabled): ');
        },
        phoneCode: async () => {
          return await this.question('Enter the verification code sent to your phone: ');
        },
        onError: (err) => {
          console.error('Authentication error:', err);
        },
      });

      // Save session
      const sessionString = session.save();
      if (sessionString) {
        fs.writeFileSync('./telegram_session.txt', sessionString);
        console.log('✅ Authentication successful! Session saved to telegram_session.txt');

        // Save credentials for MCP server
        const credentials = {
          apiId,
          apiHash,
          phoneNumber,
        };
        fs.writeFileSync('./telegram_credentials.json', JSON.stringify(credentials, null, 2));
        console.log('✅ Credentials saved to telegram_credentials.json');
      }

      await client.disconnect();
    } catch (error) {
      console.error('Authentication failed:', error);
    } finally {
      this.rl.close();
    }
  }
}

// Run authentication
const auth = new TelegramAuthenticator();
auth.authenticate().catch(console.error);
