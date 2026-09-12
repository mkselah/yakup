const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const CLAUDE_MODEL = process.env.CLAUDE_MODEL || "claude-sonnet-5";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTI_BOILERPLATE = `
Do not repeat or rephrase the user's prompt in your answers.
Start your answer directly, no introductions such as "Certainly", "Sure", or similar.
Do not mention you are an AI or language model.
Focus on giving helpful, clear, and concise information.
Unless the user asks explicitly, give answers with 600-700 words.
Do not include any boilerplate text or disclaimers.
Do not include any system prompts or instructions in your responses.
Do not include any information about your capabilities, limitations, or how you work.
`;
// Anthropic wants "system" as a separate top-level string,
// and the messages array must contain only role: "user" | "assistant".
function splitSystemAndMessages(allMessages) {
  const systemParts = allMessages
    .filter((m) => m.role === "system")
    .map((m) => m.content);
  const chatMessages = allMessages
    .filter((m) => m.role !== "system")
    .map((m) => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: m.content,
    }));
  return { system: systemParts.join("\n\n"), chatMessages };
}
async function callClaude(system, messages, maxTokens = 4096) {
  if (!ANTHROPIC_API_KEY) throw new Error("Missing ANTHROPIC_API_KEY");
  const resp = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": ANTHROPIC_VERSION,
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      system: system || undefined,
      max_tokens: maxTokens,
      messages,
    }),
  });
  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Claude API error (${resp.status}): ${errText}`);
  }
  return resp.json();
}
async function getSuggestions(messages) {
  const { system, chatMessages } = splitSystemAndMessages(messages);
  const suggestionSystem =
    (system ? system + "\n\n" : "") +
    "Given the conversation so far, suggest 3 concise, engaging, natural next user questions to keep the dialog going. Reply with ONLY a JSON array of exactly 3 short strings, nothing else.";
  let suggestions = [];
  try {
    const data = await callClaude(suggestionSystem, chatMessages, 200);
    const text = (data.content || []).map((c) => c.text).join("\n");
    const m = text.match(/\[.*\]/s);
    if (m) suggestions = JSON.parse(m[0]);
  } catch (e) {
    suggestions = [];
  }
  if (!Array.isArray(suggestions) || suggestions.length !== 3) {
    suggestions = ["", "", ""];
  }
  return suggestions;
}
export async function handler(event) {
  const startTime = Date.now();
  try {
    const { messages } = JSON.parse(event.body);
    if (!Array.isArray(messages)) throw new Error("No messages");
    // Add anti-boilerplate as an extra system instruction
    const contextMsgs = [...messages, { role: "system", content: ANTI_BOILERPLATE }];
    const { system, chatMessages } = splitSystemAndMessages(contextMsgs);
    // 1. Get assistant reply
    const llmStart = Date.now();
    const data = await callClaude(system, chatMessages, 4096);
    const llmDuration = Date.now() - llmStart;
    const reply = (data.content || []).map((c) => c.text).join("\n");
    const usage = {
      prompt_tokens: data.usage?.input_tokens,
      completion_tokens: data.usage?.output_tokens,
      total_tokens: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0),
    };
    // 2. Get suggestions
    const suggStart = Date.now();
    const allMessages = [...messages, { role: "assistant", content: reply }];
    const suggestions = await getSuggestions(allMessages);
    const suggDuration = Date.now() - suggStart;
    const totalDuration = Date.now() - startTime;
    console.log("LLM duration(ms):", llmDuration, "tokens:", usage);
    console.log("Suggest duration(ms):", suggDuration, "total:", totalDuration);
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reply,
        suggestions,
        usage,
        timing: { llmDuration, suggDuration, totalDuration },
      }),
    };
  } catch (err) {
    console.error("chat.js ERROR:", err.stack || err);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: err.message || "Unknown error", stack: err.stack }),
    };
  }
}