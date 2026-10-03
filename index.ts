import { generateText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

if (!process.env.AI_GATEWAY_API_KEY) {
  console.error("ERROR: AI_GATEWAY_API_KEY is not set in .env.local");
  process.exit(1);
}

const gateway = createOpenAI({
  baseURL: 'https://gateway.vercel.com/v1',
  apiKey: process.env.AI_GATEWAY_API_KEY,
});

async function main() {
  console.log("Generating text using Vercel AI Gateway...");
  const { text } = await generateText({
    model: gateway('openai/gpt-5.5'),
    prompt: 'Invent a new holiday and describe its traditions.',
  });
  console.log("\n--- Result ---\n");
  console.log(text);
}
main().catch(console.error);
