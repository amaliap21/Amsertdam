const OPENROUTER_API = process.env.OPENROUTER_API_URL || "https://api.openrouter.ai/v1/chat/completions";
const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY || "";

export const openrouterAdapter = {
  name: "openrouter",
  async generate(messages: {role:string; content:string}[], opts: {model?:string, jsonMode?:boolean} = {}) {
    if (!OPENROUTER_KEY) throw new Error("OPENROUTER_API_KEY not set");
    const model = opts.model || process.env.OPENROUTER_MODEL || "gpt-4o-mini";
    const body = {
      model,
      messages: messages.map(m => ({ role: m.role, content: m.content })),
      temperature: 0.2,
      // request JSON-only responses via system message; adapter leaves that to prompts
    };

    const res = await fetch(OPENROUTER_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENROUTER_KEY}`,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const t = await res.text();
      throw new Error(`OpenRouter error ${res.status}: ${t.slice(0,400)}`);
    }
    const data = await res.json();
    // Try to extract text from common shapes
    let content = "";
    try {
      if (data.choices && data.choices[0] && data.choices[0].message) {
        content = data.choices[0].message.content;
      } else if (data.output && Array.isArray(data.output)) {
        content = data.output.map((b:any)=>b.content || b).join("");
      } else if (typeof data.data === 'string') {
        content = data.data;
      } else {
        content = JSON.stringify(data);
      }
    } catch {
      content = JSON.stringify(data);
    }
    return { content, model };
  }
};
