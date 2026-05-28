const HF_API = "https://api-inference.huggingface.co/models";
const HF_KEY = process.env.HF_API_KEY || process.env.HUGGINGFACE_API_KEY || "";

export const huggingfaceAdapter = {
  name: "huggingface",
  async generate(messages: {role:string; content:string}[], opts: {model?:string, jsonMode?:boolean} = {}) {
    if (!HF_KEY) throw new Error("Hugging Face API key not set");
    const model = opts.model || process.env.HF_MODEL || "google/flan-t5-large";
    const input = messages.map(m => `${m.role.toUpperCase()}: ${m.content}`).join("\n\n");
    const res = await fetch(`${HF_API}/${encodeURIComponent(model)}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${HF_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ inputs: input, options: { wait_for_model: true } }),
    });
    if (!res.ok) {
      const t = await res.text();
      throw new Error(`HuggingFace error ${res.status}: ${t.slice(0,400)}`);
    }
    const data = await res.json();
    // Response might be {generated_text: "..."} or array
    let content = "";
    if (Array.isArray(data)) {
      // for some models HF returns [{generated_text: '...'}]
      content = (data[0] && (data[0].generated_text || data[0].text)) || JSON.stringify(data[0]);
    } else if (typeof data === "object" && data !== null) {
      content = (data.generated_text as string) || (data.text as string) || JSON.stringify(data);
    } else if (typeof data === "string") {
      content = data;
    }
    return { content, model };
  }
};
